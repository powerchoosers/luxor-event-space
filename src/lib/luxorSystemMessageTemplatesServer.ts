import 'server-only'
import { EVENT_REMINDER_DEFAULT, INQUIRY_CONFIRMATION_DEFAULT, INVOICE_REMINDER_DEFAULTS, PAYMENT_CONFIRMATION_DEFAULT, TOUR_TEXT_DEFAULTS, validateEventReminderTemplate, validateInquiryConfirmationTemplate, validateInvoiceReminderTemplate, validatePaymentConfirmationTemplate, validateTourTextTemplate, type InvoiceReminderTemplateKey, type TourTextTemplateKey } from './luxorSystemMessageTemplates'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'

export type InquiryConfirmationTemplate = { body_template: string; revision: number; updated_at: string; updated_by: string | null }

export async function readTourTextTemplate(key: TourTextTemplateKey): Promise<{ template: InquiryConfirmationTemplate; installed: boolean }> {
  const fallback = { template: { body_template: TOUR_TEXT_DEFAULTS[key], revision: 0, updated_at: '', updated_by: null }, installed: false }
  try {
    const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>(`luxor_system_message_templates?select=body_template,revision,updated_at,updated_by&message_key=eq.${key}&limit=1`)
    if (!template) return fallback
    validateTourTextTemplate(template.body_template, key)
    return { template, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return fallback
    throw error
  }
}

export async function saveTourTextTemplate(key: TourTextTemplateKey, body: unknown, revision: unknown, actorEmail: string) {
  const value = validateTourTextTemplate(body, key)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>(`luxor_system_message_templates?message_key=eq.${key}&revision=eq.${revision}&select=body_template,revision,updated_at,updated_by`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ body_template: value, revision: Number(revision) + 1, updated_by: actorEmail, updated_at: new Date().toISOString() }) })
  if (!template) throw new Error('This message changed. Reload before saving.')
  return template
}

export async function readInvoiceReminderTemplate(key: InvoiceReminderTemplateKey): Promise<{ template: InquiryConfirmationTemplate; installed: boolean }> {
  const fallback = { template: { body_template: INVOICE_REMINDER_DEFAULTS[key], revision: 0, updated_at: '', updated_by: null }, installed: false }
  try {
    const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>(`luxor_system_message_templates?select=body_template,revision,updated_at,updated_by&message_key=eq.${key}&limit=1`)
    if (!template) return fallback
    validateInvoiceReminderTemplate(template.body_template, key)
    return { template, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return fallback
    throw error
  }
}

export async function saveInvoiceReminderTemplate(key: InvoiceReminderTemplateKey, body: unknown, revision: unknown, actorEmail: string) {
  const value = validateInvoiceReminderTemplate(body, key)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>(`luxor_system_message_templates?message_key=eq.${key}&revision=eq.${revision}&select=body_template,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ body_template: value, revision: Number(revision) + 1, updated_by: actorEmail, updated_at: new Date().toISOString() }),
  })
  if (!template) throw new Error('This message changed. Reload before saving.')
  return template
}

export async function readEventReminderTemplate(): Promise<{ template: InquiryConfirmationTemplate; installed: boolean }> {
  const fallback = { template: { body_template: EVENT_REMINDER_DEFAULT, revision: 0, updated_at: '', updated_by: null }, installed: false }
  try {
    const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>('luxor_system_message_templates?select=body_template,revision,updated_at,updated_by&message_key=eq.event_reminder&limit=1')
    if (!template) return fallback
    validateEventReminderTemplate(template.body_template)
    return { template, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return fallback
    throw error
  }
}

export async function saveEventReminderTemplate(body: unknown, revision: unknown, actorEmail: string) {
  const value = validateEventReminderTemplate(body)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>(`luxor_system_message_templates?message_key=eq.event_reminder&revision=eq.${revision}&select=body_template,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ body_template: value, revision: Number(revision) + 1, updated_by: actorEmail, updated_at: new Date().toISOString() }),
  })
  if (!template) throw new Error('This message changed. Reload before saving.')
  return template
}

export async function readPaymentConfirmationTemplate(): Promise<{ template: InquiryConfirmationTemplate; installed: boolean }> {
  const fallback = { template: { body_template: PAYMENT_CONFIRMATION_DEFAULT, revision: 0, updated_at: '', updated_by: null }, installed: false }
  try {
    const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>('luxor_system_message_templates?select=body_template,revision,updated_at,updated_by&message_key=eq.payment_confirmation&limit=1')
    if (!template) return fallback
    validatePaymentConfirmationTemplate(template.body_template)
    return { template, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return fallback
    throw error
  }
}

export async function savePaymentConfirmationTemplate(body: unknown, revision: unknown, actorEmail: string) {
  const value = validatePaymentConfirmationTemplate(body)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>(`luxor_system_message_templates?message_key=eq.payment_confirmation&revision=eq.${revision}&select=body_template,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ body_template: value, revision: Number(revision) + 1, updated_by: actorEmail, updated_at: new Date().toISOString() }),
  })
  if (!template) throw new Error('This message changed. Reload before saving.')
  return template
}

export async function readInquiryConfirmationTemplate(): Promise<{ template: InquiryConfirmationTemplate; installed: boolean }> {
  try {
    const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>('luxor_system_message_templates?select=body_template,revision,updated_at,updated_by&message_key=eq.inquiry_confirmation&limit=1')
    if (!template) throw new Error('Inquiry confirmation template is missing.')
    validateInquiryConfirmationTemplate(template.body_template)
    return { template, installed: true }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST205') return { template: { body_template: INQUIRY_CONFIRMATION_DEFAULT, revision: 0, updated_at: '', updated_by: null }, installed: false }
    throw error
  }
}

export async function saveInquiryConfirmationTemplate(body: unknown, revision: unknown, actorEmail: string) {
  const value = validateInquiryConfirmationTemplate(body)
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw new Error('Reload the message before saving.')
  const [template] = await supabaseRestStrict<InquiryConfirmationTemplate[]>(`luxor_system_message_templates?message_key=eq.inquiry_confirmation&revision=eq.${revision}&select=body_template,revision,updated_at,updated_by`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ body_template: value, revision: Number(revision) + 1, updated_by: actorEmail, updated_at: new Date().toISOString() }),
  })
  if (!template) throw new Error('This message changed. Reload before saving.')
  return template
}
