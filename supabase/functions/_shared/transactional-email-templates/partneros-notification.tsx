import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://partneros.manwinwin.com'

interface Props {
  title?: string
  message?: string
  link?: string
  priority?: string
}

const safeLink = (link?: string) => {
  if (!link || typeof link !== 'string') return `${APP_URL}/notifications`
  // Only relative in-app paths are accepted; never arbitrary external URLs.
  if (link.startsWith('/') && !link.startsWith('//')) return `${APP_URL}${link}`
  return `${APP_URL}/notifications`
}

const Email = ({ title, message, link, priority }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{title || 'You have a new PartnerOS notification'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brandMark}>ManWinWin <span style={brandAccent}>PartnerOS</span></Text>
        {priority === 'action_required' ? <Text style={badge}>Action required</Text> : null}
        <Heading style={h1}>{title || 'New notification'}</Heading>
        {message ? <Text style={text}>{message}</Text> : null}
        <Section style={{ margin: '24px 0' }}>
          <Button style={button} href={safeLink(link)}>Open in PartnerOS</Button>
        </Section>
        <Hr style={hr} />
        <Text style={smallText}>
          This is an operational notification from PartnerOS about work assigned to you.
          The same item is always available in your PartnerOS notifications.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `${d?.priority === 'action_required' ? '[Action] ' : ''}${d?.title || 'PartnerOS notification'}`,
  displayName: 'PartnerOS notification',
  previewData: {
    title: 'New lead assigned to you',
    message: 'Acme Maintenance Ltd has been assigned to you.',
    link: '/incoming-leads',
    priority: 'action_required',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', system-ui, -apple-system, Arial, sans-serif" }
const container = { padding: '28px 25px', maxWidth: '560px' }
const brandMark = { fontSize: '16px', fontWeight: '700' as const, color: 'hsl(207, 18%, 20%)', margin: '0 0 20px' }
const brandAccent = { color: 'hsl(353, 94%, 55%)' }
const badge = { display: 'inline-block', fontSize: '11px', fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: 'hsl(353, 94%, 45%)', margin: '0 0 8px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(207, 18%, 20%)', margin: '0 0 12px' }
const text = { fontSize: '14px', color: 'hsl(207, 14%, 35%)', lineHeight: '1.6', margin: '0 0 14px' }
const button = { backgroundColor: 'hsl(353, 94%, 55%)', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '6px', padding: '12px 22px', textDecoration: 'none' }
const hr = { borderColor: 'hsl(207, 14%, 90%)', margin: '24px 0 0' }
const smallText = { fontSize: '12px', color: 'hsl(207, 14%, 50%)', lineHeight: '1.5', margin: '16px 0 0' }
