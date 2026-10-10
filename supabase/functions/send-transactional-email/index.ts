import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2.99.3'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

const SENDER_DOMAIN = 'notify.partneros.manwinwin.com' // Provider-registered domain; validate before changing.
const FROM_DOMAIN = 'partneros.manwinwin.com'
const json = (data: Record<string, unknown>, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Custom authentication: only a database-held, per-environment dispatch token
// is accepted. JWTs/anon keys do not authorize this endpoint. Verification is
// a service-role-only RPC, and recipients/content are always resolved in DB.
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const token = req.headers.get('X-PartnerOS-Dispatch-Token')
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return json({ error: 'Unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Server configuration error' }, 503)
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: authorized, error: authError } = await db.rpc('notification_dispatch_authorized', { _token: token })
  if (authError || authorized !== true) return json({ error: 'Forbidden' }, 403)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }
  if (body.action === 'health') return json({ ready: !!Deno.env.get('LOVABLE_API_KEY'), senderDomain: SENDER_DOMAIN, fromDomain: FROM_DOMAIN })
  if (body.action === 'process_queue') {
    if (!Deno.env.get('LOVABLE_API_KEY')) return json({ error: 'Email provider credential missing' }, 503)
    const response = await fetch(`${url}/functions/v1/process-email-queue`, {
      method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ queues: ['transactional_emails'] }),
    })
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json' } })
  }
  const notificationId = typeof body.notificationId === 'string' ? body.notificationId : ''
  if (!uuid.test(notificationId)) return json({ error: 'notificationId is required' }, 400)
  try {
    const { data: context, error: contextError } = await db.rpc('notification_email_context', { _notification_id: notificationId })
    if (contextError) throw new Error('Could not resolve notification')
    if (!context) {
      await db.from('notifications').update({ email_status: 'disabled', email_error: 'Notification no longer eligible for email' }).eq('id', notificationId).in('email_status', ['dispatching', 'failed'])
      return json({ skipped: true })
    }
    const recipient = context.recipientEmail
    const { data: suppression, error: suppressionError } = await db.from('suppressed_emails').select('id').eq('email', recipient).maybeSingle()
    if (suppressionError) throw new Error('Could not verify suppression status')
    if (suppression) {
      const { error } = await db.from('email_send_log').insert({ message_id: notificationId, template_name: 'partneros-notification', recipient_email: recipient, status: 'suppressed' })
      if (error) throw new Error('Could not record suppression')
      return json({ suppressed: true })
    }
    let { data: tokenRow, error: tokenError } = await db.from('email_unsubscribe_tokens').select('token,used_at').eq('email', recipient).maybeSingle()
    if (tokenError) throw new Error('Could not prepare preferences link')
    if (tokenRow?.used_at) {
      await db.from('email_send_log').insert({ message_id: notificationId, template_name: 'partneros-notification', recipient_email: recipient, status: 'suppressed', error_message: 'Email preferences disable notifications' })
      return json({ suppressed: true })
    }
    if (!tokenRow) {
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      const newToken = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
      const { error } = await db.from('email_unsubscribe_tokens').upsert({ email: recipient, token: newToken }, { onConflict: 'email', ignoreDuplicates: true })
      if (error) throw new Error('Could not save preferences link')
      const reread = await db.from('email_unsubscribe_tokens').select('token,used_at').eq('email', recipient).single()
      if (reread.error) throw new Error('Could not confirm preferences link')
      tokenRow = reread.data
    }
    if (!tokenRow?.token || tokenRow.used_at) throw new Error('Email preferences are unavailable')
    const templateName = context.eventType === 'announcement.published' ? 'partneros-announcement' : context.eventType.startsWith('task.') ? 'partneros-task-assigned' : 'partneros-lead-assigned'
    const template = TEMPLATES[templateName]
    const props = { ...context, unsubscribeToken: tokenRow.token }
    const component = React.createElement(template.component, props)
    const html = await renderAsync(component)
    const text = await renderAsync(component, { plainText: true })
    const subject = typeof template.subject === 'function' ? template.subject(props) : template.subject
    const { data: queued, error: enqueueError } = await db.rpc('enqueue_notification_email', {
      _notification_id: notificationId,
      _payload: {
        message_id: notificationId, to: recipient, from: `ManWinWin PartnerOS <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN, subject, html, text, purpose: 'transactional', label: templateName,
        unsubscribe_token: tokenRow.token, queued_at: new Date().toISOString(),
      },
    })
    if (enqueueError) throw new Error('Could not queue notification email')
    return json({ queued: queued === true, duplicateOrSkipped: queued !== true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email preparation failed'
    // Record a useful stage error without logging tokens, addresses, or content.
    await db.from('notifications').update({ email_status: 'failed', email_error: message }).eq('id', notificationId).is('email_queued_at', null).in('email_status', ['dispatching', 'failed'])
    console.error('Notification email preparation failed', { notificationId, stage: message })
    return json({ error: 'Email preparation failed' }, 500)
  }
})
