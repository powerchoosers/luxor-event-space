import 'server-only'

import { renderLuxorSystemEmail } from './luxorEmailDesignSystem'
import { createLuxorEmailJob } from './luxorEmailJobsServer'
import {
  latestLuxorCreatedDocumentSignedEventPayload,
  listLuxorCreatedDocumentSigners,
  updateLuxorCreatedDocumentSigner,
} from './luxorCreatedDocumentFieldsServer'
import {
  buildLuxorCreatedDocumentExecutedPdf,
} from './luxorCreatedDocumentSignedPdfServer'
import {
  assertCreatedDocumentQueueRecipient,
  createdDocumentRecipientSummary,
  createdDocumentReminderSchedule,
  isCreatedDocumentRecipientEmail,
  planCreatedDocumentInvitations,
  rollupCreatedDocumentStatus,
  type CreatedDocumentInviteSigner,
  type CreatedDocumentSigningOrder,
} from './luxorCreatedDocumentSendPlan'
import { createLuxorCreatedDocumentSigningToken } from './luxorCreatedDocumentToken'
import {
  getLuxorCreatedDocument,
  patchLuxorCreatedDocumentRecord,
} from './luxorDocumentCreatorServer'
import { supabaseRest } from './supabaseRestServer'
import type { LuxorCreatedDocumentRow } from './luxorDocumentCreatorTypes'
import type { LuxorCreatedDocumentSignerRow } from './luxorCreatedDocumentFieldTypes'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
}

function signatureEmail(input: { recipientName: string; subject: string; message: string; url: string; reminder: boolean }) {
  const first = input.recipientName.trim().split(/\s+/)[0] || 'there'
  const subject = input.reminder ? `Reminder: ${input.subject}` : input.subject
  const html = renderLuxorSystemEmail({
    previewText: input.reminder ? 'Reminder to sign your Luxor document.' : 'A Luxor document is ready for your signature.',
    eyebrow: input.reminder ? 'Signature reminder' : 'Signature requested',
    title: input.reminder ? 'A reminder to sign' : 'Ready for your signature',
    greeting: `Hi ${escapeHtml(first)},`,
    bodyHtml: `<p style="margin:0">${escapeHtml(input.message)}</p>`,
    actions: [{ label: 'Review and sign', url: input.url }],
    note: 'This secure link is only for you. If you were not expecting it, you can ignore this email.',
    theme: 'light',
  })
  return { subject, html }
}

async function queueCreatedDocumentEmail(input: {
  recipientEmail: string
  subject: string
  html: string
  scheduledFor?: string
  confirmLiveSend: boolean
  metadata: Record<string, unknown>
}) {
  assertCreatedDocumentQueueRecipient(input.recipientEmail, input.confirmLiveSend)
  return createLuxorEmailJob({
    jobType: 'contract_signature',
    recipientEmail: input.recipientEmail.trim(),
    subject: input.subject,
    body: input.html,
    scheduledFor: input.scheduledFor,
    metadata: input.metadata,
  })
}

export async function cancelQueuedCreatedDocumentEmails(documentId: string, signerId?: string) {
  const rows = await supabaseRest<Array<{ id: string; metadata?: Record<string, unknown> }>>(
    `luxor_email_jobs?select=id,metadata&status=eq.queued&metadata->>created_document_id=eq.${encodeURIComponent(documentId)}`,
  )
  for (const row of rows) {
    const kind = row.metadata?.kind
    if (kind !== 'created_document_signature' && kind !== 'created_document_reminder') continue
    if (signerId && row.metadata?.signer_id !== signerId) continue
    await supabaseRest(`luxor_email_jobs?id=eq.${encodeURIComponent(row.id)}&status=eq.queued`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'cancelled',
        last_error: 'Created document signing changed before this email was sent.',
        updated_at: new Date().toISOString(),
      }),
    })
  }
}

async function inviteSigner(input: {
  document: LuxorCreatedDocumentRow
  signer: CreatedDocumentInviteSigner
  subject: string
  message: string
  reminderAt: string | null
  confirmLiveSend: boolean
}) {
  const issued = createLuxorCreatedDocumentSigningToken()
  const url = `${siteOrigin()}/secure-portal/sign/${encodeURIComponent(issued.token)}`
  const invitation = signatureEmail({
    recipientName: input.signer.name,
    subject: input.subject,
    message: input.message,
    url,
    reminder: false,
  })
  await queueCreatedDocumentEmail({
    recipientEmail: input.signer.email,
    subject: invitation.subject,
    html: invitation.html,
    confirmLiveSend: input.confirmLiveSend,
    metadata: {
      kind: 'created_document_signature',
      created_document_id: input.document.id,
      signer_id: input.signer.id,
      signing_order: input.document.signing_order || 'parallel',
    },
  })
  if (input.reminderAt) {
    const reminder = signatureEmail({
      recipientName: input.signer.name,
      subject: input.subject,
      message: input.message,
      url,
      reminder: true,
    })
    await queueCreatedDocumentEmail({
      recipientEmail: input.signer.email,
      subject: reminder.subject,
      html: reminder.html,
      scheduledFor: input.reminderAt,
      confirmLiveSend: input.confirmLiveSend,
      metadata: {
        kind: 'created_document_reminder',
        created_document_id: input.document.id,
        signer_id: input.signer.id,
      },
    })
  }
  await updateLuxorCreatedDocumentSigner(input.signer.id, {
    token_hash: issued.tokenHash,
    token_expires_at: issued.expiresAt,
    invited_at: new Date().toISOString(),
    name: input.signer.name,
    email: input.signer.email,
  })
}

export async function sendLuxorCreatedDocumentForSignature(input: {
  documentId: string
  signers: Array<{ id: string; name: string; email: string; role_label: string }>
  subject: string
  message: string
  signingOrder: CreatedDocumentSigningOrder
  reminderEnabled: boolean
  reminderAfterDays: number
  confirmLiveSend: boolean
}) {
  const document = await getLuxorCreatedDocument(input.documentId)
  if (!document) throw new Error('Document not found.')
  if (document.is_template || document.status === 'template') {
    throw new Error('Save a draft from this template before sending it.')
  }
  if (document.status !== 'draft') throw new Error('This document has already been sent.')
  const subject = input.subject.trim().slice(0, 200)
  const message = input.message.trim().slice(0, 2000)
  if (!subject) throw new Error('Add a subject before sending.')
  if (!message) throw new Error('Add a message before sending.')
  const prepared = input.signers.map((signer) => ({
    ...signer,
    name: signer.name.trim().slice(0, 200),
    email: signer.email.trim().slice(0, 320),
    role_label: signer.role_label.trim().slice(0, 120),
  }))
  if (prepared.some((signer) => !signer.name || !isCreatedDocumentRecipientEmail(signer.email))) {
    throw new Error('Each recipient needs a name and a valid email.')
  }
  for (const signer of prepared) {
    await updateLuxorCreatedDocumentSigner(signer.id, {
      name: signer.name,
      email: signer.email,
      role_label: signer.role_label,
    })
  }
  const signers = await listLuxorCreatedDocumentSigners(input.documentId)
  const known = new Map(prepared.map((signer) => [signer.id, signer]))
  const merged = signers.map((signer) => {
    const next = known.get(signer.id)
    return next ? { ...signer, name: next.name, email: next.email, role_label: next.role_label } : signer
  })
  const plan = planCreatedDocumentInvitations(input.signingOrder, merged)
  if (!plan.length && !merged.some((signer) => signer.invited_at)) {
    throw new Error('Add at least one recipient before sending.')
  }
  const reminderAt = createdDocumentReminderSchedule(input.reminderEnabled, input.reminderAfterDays)
  const draft = {
    ...document,
    signing_order: input.signingOrder,
  }
  for (const signer of plan) {
    await inviteSigner({
      document: draft,
      signer,
      subject,
      message,
      reminderAt,
      confirmLiveSend: input.confirmLiveSend,
    })
  }
  return patchLuxorCreatedDocumentRecord(input.documentId, {
    status: 'sent',
    signing_order: input.signingOrder,
    reminder_enabled: input.reminderEnabled,
    reminder_after_days: Math.min(30, Math.max(1, Math.round(input.reminderAfterDays) || 3)),
    sent_subject: subject,
    sent_message: message,
    sent_at: new Date().toISOString(),
    recipient_summary: createdDocumentRecipientSummary(merged),
  })
}

export async function remindLuxorCreatedDocumentSigners(input: {
  documentId: string
  confirmLiveSend: boolean
}) {
  const document = await getLuxorCreatedDocument(input.documentId)
  if (!document) throw new Error('Document not found.')
  if (!['sent', 'opened', 'partially_signed'].includes(document.status)) {
    throw new Error('Reminders are available after the document is sent.')
  }
  const subject = document.sent_subject?.trim() || `Please sign: ${document.title}`
  const message = document.sent_message?.trim() || 'Please review and sign this Luxor document.'
  const signers = await listLuxorCreatedDocumentSigners(input.documentId)
  const outstanding = signers
    .filter((signer) => signer.invited_at && signer.status !== 'signed' && signer.status !== 'declined' && signer.email.trim())
    .sort((left, right) => left.sign_order - right.sign_order)
  const targets = document.signing_order === 'sequential' ? outstanding.slice(0, 1) : outstanding
  if (!targets.length) throw new Error('There is no signer left to remind.')
  for (const signer of targets) {
    await cancelQueuedCreatedDocumentEmails(document.id, signer.id)
    const issued = createLuxorCreatedDocumentSigningToken()
    const url = `${siteOrigin()}/secure-portal/sign/${encodeURIComponent(issued.token)}`
    const reminder = signatureEmail({
      recipientName: signer.name,
      subject,
      message,
      url,
      reminder: true,
    })
    await queueCreatedDocumentEmail({
      recipientEmail: signer.email,
      subject: reminder.subject,
      html: reminder.html,
      confirmLiveSend: input.confirmLiveSend,
      metadata: {
        kind: 'created_document_reminder',
        created_document_id: document.id,
        signer_id: signer.id,
      },
    })
    await updateLuxorCreatedDocumentSigner(signer.id, {
      token_hash: issued.tokenHash,
      token_expires_at: issued.expiresAt,
    })
  }
  return document
}

export async function voidLuxorCreatedDocument(documentId: string) {
  const document = await getLuxorCreatedDocument(documentId)
  if (!document) throw new Error('Document not found.')
  if (document.status === 'draft' || document.status === 'template' || document.is_template) {
    throw new Error('Only a sent document can be voided.')
  }
  if (document.status === 'voided') return document
  const signers = await listLuxorCreatedDocumentSigners(documentId)
  for (const signer of signers) {
    if (signer.status === 'signed') continue
    await updateLuxorCreatedDocumentSigner(signer.id, {
      token_hash: null,
      token_expires_at: null,
      status: signer.status === 'declined' ? 'declined' : 'expired',
    })
  }
  await cancelQueuedCreatedDocumentEmails(documentId)
  return patchLuxorCreatedDocumentRecord(documentId, {
    status: 'voided',
    voided_at: new Date().toISOString(),
  })
}

async function writeExecutedPdf(documentId: string, signers: LuxorCreatedDocumentSignerRow[]) {
  const stamps = []
  for (const signer of signers) {
    const payload = await latestLuxorCreatedDocumentSignedEventPayload(signer.id)
    const fieldValues = payload?.field_values && typeof payload.field_values === 'object' && !Array.isArray(payload.field_values)
      ? payload.field_values as Record<string, unknown>
      : {}
    stamps.push({
      roleKey: signer.role_key,
      fieldValues,
      signatureDataUrl: typeof payload?.signature_data_url === 'string' ? payload.signature_data_url : null,
      initialsDataUrl: typeof payload?.initials_data_url === 'string' ? payload.initials_data_url : null,
    })
  }
  return buildLuxorCreatedDocumentExecutedPdf({ documentId, signers: stamps })
}

export async function syncLuxorCreatedDocumentDeliveryStatus(documentId: string) {
  const document = await getLuxorCreatedDocument(documentId)
  if (!document) return null
  if (document.archived_at || document.is_template || document.status === 'draft' || document.status === 'template' || document.status === 'voided') {
    return document
  }
  const signers = await listLuxorCreatedDocumentSigners(documentId)
  const next = rollupCreatedDocumentStatus(signers)
  let current = document
  if (next && next !== document.status) {
    current = await patchLuxorCreatedDocumentRecord(documentId, { status: next })
  }
  if (next === 'signed' && !current.final_pdf_path) {
    const finalPath = await writeExecutedPdf(documentId, signers)
    current = await patchLuxorCreatedDocumentRecord(documentId, { final_pdf_path: finalPath, status: 'signed' })
  }
  for (const signer of signers) {
    if (signer.status === 'signed' || signer.status === 'declined') {
      await cancelQueuedCreatedDocumentEmails(documentId, signer.id)
    }
  }
  if (current.signing_order === 'sequential' && next && next !== 'signed' && next !== 'declined') {
    const subject = current.sent_subject?.trim() || `Please sign: ${current.title}`
    const message = current.sent_message?.trim() || 'Please review and sign this Luxor document.'
    const plan = planCreatedDocumentInvitations('sequential', signers)
    const reminderAt = createdDocumentReminderSchedule(Boolean(current.reminder_enabled), current.reminder_after_days || 3)
    for (const signer of plan) {
      await inviteSigner({
        document: current,
        signer,
        subject,
        message,
        reminderAt,
        confirmLiveSend: true,
      })
    }
  }
  return current
}
