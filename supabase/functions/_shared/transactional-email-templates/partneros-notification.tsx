import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text, Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://partneros.manwinwin.com'
export interface NotificationEmailProps {
  title?: string; message?: string; link?: string; priority?: string;
  recipientName?: string; dueDate?: string; summary?: string; unsubscribeToken?: string;
  kind?: 'lead' | 'task' | 'announcement';
}
export function safeNotificationLink(link?: string) {
  if (!link || !/^\/(?![\/\\])/.test(link) || /[\r\n\\]/.test(link)) return `${APP_URL}/notifications`
  return `${APP_URL}${link}`
}
export function notificationSubject(kind: string, title?: string) {
  const prefix = kind === 'announcement' ? 'Announcement' : kind === 'task' ? 'Task assigned' : 'Lead assigned'
  return `PartnerOS · ${prefix}${title ? `: ${title.replace(/[\r\n]/g, ' ').slice(0, 120)}` : ''}`
}
const labels = { lead: 'View lead', task: 'View task', announcement: 'Read announcement' }
const Email = ({ title, message, link, recipientName, dueDate, summary, unsubscribeToken, kind = 'lead' }: NotificationEmailProps) => (
  <Html lang="en" dir="ltr"><Head /><Preview>{title || 'New PartnerOS notification'}</Preview>
    <Body style={main}><Container style={container}>
      <Text style={brand}>ManWinWin <span style={{ color: '#e9243f' }}>PartnerOS</span></Text>
      <Text style={eyebrow}>{kind === 'announcement' ? 'News & updates' : 'Assigned to you'}</Text>
      <Heading style={heading}>{title || (kind === 'announcement' ? 'New announcement' : 'You have a new assignment')}</Heading>
      {recipientName && <Text style={text}>Hello {recipientName.split(' ')[0]},</Text>}
      <Text style={text}>{(kind === 'announcement' ? summary || message : message) || 'Open PartnerOS to view the details.'}</Text>
      {dueDate && <Text style={detail}>Due date: {new Date(`${dueDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</Text>}
      <Section style={{ margin: '24px 0' }}><Button style={button} href={safeNotificationLink(link)}>{labels[kind]}</Button></Section>
      <Hr style={hr} /><Text style={small}>You received this email {kind === 'announcement' ? 'because you are part of the audience for this PartnerOS announcement' : `because this ${kind} was assigned to you`}. Sign in to PartnerOS to view the full details.</Text>
      {unsubscribeToken && <Text style={small}><Link style={{ color: '#657180' }} href={`${APP_URL}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`}>Manage email notifications</Link> · In-app notifications remain available.</Text>}
    </Container></Body>
  </Html>
)
export function makeNotificationTemplate(kind: 'lead' | 'task' | 'announcement'): TemplateEntry {
  return {
    component: (props: NotificationEmailProps) => <Email {...props} kind={kind} />,
    subject: data => notificationSubject(kind, data.title),
    displayName: `PartnerOS ${kind}`,
    previewData: { title: kind === 'lead' ? 'Acme Maintenance Ltd' : kind === 'task' ? 'Follow up on the proposal' : 'ManWinWin product update', message: kind === 'announcement' ? 'A new software release is available. Read the announcement for the highlights.' : 'A new assignment is ready for you in PartnerOS.', link: kind === 'lead' ? '/incoming-leads' : kind === 'task' ? '/tasks' : '/announcements', recipientName: 'Alex', ...(kind === 'task' ? { dueDate: '2026-10-15' } : {}) },
  }
}
export const template = makeNotificationTemplate('lead')
const main = { backgroundColor: '#f5f7fa', fontFamily: 'Arial, Helvetica, sans-serif', padding: '24px 12px' }
const container = { backgroundColor: '#ffffff', border: '1px solid #e5e9ef', borderRadius: '12px', padding: '32px 28px', maxWidth: '560px' }
const brand = { fontSize: '16px', fontWeight: '700' as const, color: '#293541', margin: '0 0 28px' }
const eyebrow = { fontSize: '11px', fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: '0.7px', color: '#657180', margin: '0 0 10px' }
const heading = { fontSize: '24px', lineHeight: '1.3', color: '#293541', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#465260', lineHeight: '1.7', margin: '0 0 14px' }
const detail = { ...text, fontSize: '13px', fontWeight: '700' as const }
const button = { backgroundColor: '#e9243f', color: '#ffffff', fontSize: '14px', fontWeight: '700' as const, borderRadius: '6px', padding: '13px 22px', textDecoration: 'none' }
const hr = { borderColor: '#e5e9ef', margin: '28px 0 0' }
const small = { fontSize: '12px', color: '#657180', lineHeight: '1.6', margin: '16px 0 0' }
