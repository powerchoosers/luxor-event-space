import 'server-only'

import crypto from 'crypto'
import type { LuxorBooking, LuxorEmailJob, LuxorInquiry } from './luxorInquiryTypes'
import { renderLuxorSystemEmail } from './luxorEmailDesignSystem'
import { supabaseRest } from './supabaseRestServer'
import { renderZelleInstructionsCopy, type ZelleInstructionsCopy } from './luxorZelleInstructionsCopy'
import { readZelleInstructionsSetting } from './luxorZelleInstructionsCopyServer'

function stableJobId(key: string) {
  const hex = crypto.createHash('sha256').update(`luxor-zelle-instructions/v1/${key}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function buildLuxorZelleInstructionsEmail(input: {
  clientName: string
  recipient: string
  amount: number
  amountLabel: 'reservation deposit' | 'full event balance'
  copyOverride?: ZelleInstructionsCopy | null
}) {
  const firstName = input.clientName.trim().split(/\s+/)[0] || 'there'
  const amount = input.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const copy = input.copyOverride ? renderZelleInstructionsCopy(input.copyOverride, { first_name: firstName, payment_type: input.amountLabel }) : null
  return {
    subject: copy?.subject ?? 'Luxor Zelle payment instructions',
    body: renderLuxorSystemEmail({
      previewText: `Zelle instructions for your ${input.amountLabel}.`,
      eyebrow: 'Payment instructions',
      title: 'Send your payment with Zelle',
      greeting: copy ? escapeHtml(copy.greeting) : `Hi ${escapeHtml(firstName)},`,
      bodyHtml: copy ? `<p style="margin:0">${escapeHtml(copy.body).replace(/\n/g, '<br />')}</p>` : `<p style="margin:0">You selected Zelle for your ${input.amountLabel}. To send it, open your bank's Zelle service and enter the recipient below.</p>`,
      details: [
        { label: 'Amount selected', value: amount },
        { label: 'Zelle recipient', value: escapeHtml(input.recipient) },
      ],
      note: 'Choosing Zelle does not mean a transfer was sent or received. Your date is reserved only after Luxor confirms receipt. If you have already sent the transfer, reply to this email so Luxor can verify it.',
      theme: 'light',
    }),
  }
}

export async function queueLuxorZelleInstructionsEmail(input: {
  booking: LuxorBooking
  inquiry: LuxorInquiry | null
  amount: number
  amountLabel: 'reservation deposit' | 'full event balance'
  recipient: string
}) {
  const recipientEmail = (input.inquiry?.email || input.booking.email || '').trim().toLowerCase()
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error('A valid prospect email is required to send Zelle instructions.')
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('The Zelle payment amount is invalid.')

  const amountKey = input.amountLabel === 'reservation deposit' ? 'deposit' : 'full'
  const automationKey = `zelle-instructions:${input.booking.id}:${amountKey}`
  const id = stableJobId(automationKey)
  const [existing] = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
  if (existing) return existing

  let copySettingsUnavailable = false
  let copyOverride = null
  try { copyOverride = (await readZelleInstructionsSetting()).setting.copy_override }
  catch (error) { copySettingsUnavailable = true; console.error('Zelle instruction settings unavailable; using original wording:', error) }
  const email = buildLuxorZelleInstructionsEmail({
    clientName: input.inquiry?.full_name || input.booking.client_name,
    recipient: input.recipient,
    amount: input.amount,
    amountLabel: input.amountLabel,
    copyOverride,
  })
  const rows = await supabaseRest<LuxorEmailJob[]>('luxor_email_jobs?on_conflict=id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({
      id,
      inquiry_id: input.inquiry?.id || input.booking.inquiry_id || null,
      booking_id: input.booking.id,
      signature_request_id: null,
      // Reuse the existing customer payment request queue type so the regular
      // worker, provider idempotency, and sent history handle delivery.
      job_type: 'final_payment_request',
      status: 'queued',
      recipient_email: recipientEmail,
      subject: email.subject,
      body: email.body,
      scheduled_for: new Date().toISOString(),
      metadata: {
        automated: true,
        automation_key: automationKey,
        payment_method: 'zelle',
        payment_amount: input.amount,
        payment_amount_kind: amountKey,
        ...(copySettingsUnavailable ? { copy_settings_unavailable: true } : {}),
      },
    }),
  })
  const job = rows[0] || (await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`))[0]
  if (!job || job.recipient_email !== recipientEmail || job.metadata?.automation_key !== automationKey) {
    throw new Error('Zelle instructions could not be safely queued.')
  }
  return job
}
