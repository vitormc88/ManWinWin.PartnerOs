import type * as React from 'npm:react@18.3.1'
import { makeNotificationTemplate } from './partneros-notification.tsx'
export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}
export const TEMPLATES: Record<string, TemplateEntry> = {
  'partneros-notification': makeNotificationTemplate('lead'),
  'partneros-lead-assigned': makeNotificationTemplate('lead'),
  'partneros-task-assigned': makeNotificationTemplate('task'),
  'partneros-announcement': makeNotificationTemplate('announcement'),
}
