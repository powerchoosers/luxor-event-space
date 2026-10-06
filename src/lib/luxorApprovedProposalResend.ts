import 'server-only'

import { createHash } from 'node:crypto'
import type { LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'

export type ApprovedProposalResend = {
  version: 1
  approved: true
  approver: string
  approvalSource: string
  approvalReference: string
  approvedAt: string
  inquiryId: string
  invoiceId: string
  originalEmail: string
  correctedEmail: string
  expectedSubject: string
  expectedTotal: number
  expectedPdfSha256: string
  expectedHtmlSha256: string
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && value.length <= 254
    && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)
}

export function readApprovedProposalResend(value: unknown, invoice: LuxorInvoice, inquiry: LuxorInquiry) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<ApprovedProposalResend>
  if (record.version !== 1 || record.approved !== true || !record.approver?.trim()
    || !record.approvalSource?.trim() || !record.approvalReference?.trim()
    || !Number.isFinite(Date.parse(record.approvedAt || ''))
    || record.inquiryId !== inquiry.id || record.invoiceId !== invoice.id
    || invoice.inquiry_id !== inquiry.id || !isEmail(record.originalEmail) || !isEmail(record.correctedEmail)
    || record.originalEmail.toLowerCase() === record.correctedEmail.toLowerCase()
    || typeof record.expectedSubject !== 'string' || !record.expectedSubject.trim() || /[\r\n]/.test(record.expectedSubject)
    || !Number.isFinite(record.expectedTotal) || !isSha256(record.expectedPdfSha256)
    || !isSha256(record.expectedHtmlSha256)) return null
  return record as ApprovedProposalResend
}

export function approvedProposalResendKey(invoiceId: string, proposalVersion: number, approvalReference: string) {
  const digest = createHash('sha256').update(`${invoiceId}\u0000${proposalVersion}\u0000${approvalReference}`).digest('hex')
  return `approved-proposal-resend/v1/${digest}`
}

export function approvedProposalResendAuditMarker(idempotencyKey: string) {
  const digest = createHash('sha256').update(idempotencyKey).digest('hex')
  return `luxor-proposal-resend-audit/v1/${digest}`
}

export function validateApprovedProposalResend(input: {
  approval: ApprovedProposalResend
  invoice: LuxorInvoice
  inquiry: LuxorInquiry
  htmlSha256: string
  pdfSha256: string
}) {
  const { approval, invoice, inquiry } = input
  if (invoice.status !== 'sent' || invoice.invoice_kind !== 'event' || invoice.proposal_version !== 1
    || !invoice.price_locked_at || invoice.proposal_accepted_at || invoice.booking_id || invoice.paid_at
    || Number(invoice.total) !== approval.expectedTotal) {
    return 'The saved proposal no longer matches the approved, unaccepted proposal.'
  }
  if (inquiry.email?.trim().toLowerCase() !== approval.originalEmail.toLowerCase()
    && inquiry.email?.trim().toLowerCase() !== approval.correctedEmail.toLowerCase()) {
    return 'The inquiry email changed after approval. No message was sent.'
  }
  const proposalContext = invoice.proposal_context as Record<string, unknown> | null | undefined
  const proposalEmail = (proposalContext?.delivery_snapshot as Record<string, unknown> | undefined)?.proposal_email as Record<string, unknown> | undefined
  if (proposalContext?.publication_attempt === null || typeof proposalContext?.publication_attempt !== 'object'
    || (proposalContext.publication_attempt as Record<string, unknown>).state !== 'completed'
    || typeof proposalEmail?.html !== 'string' || !proposalEmail.html.trim()
    || proposalEmail.recipient_email?.toString().trim().toLowerCase() !== approval.originalEmail.toLowerCase()
    || proposalEmail.subject !== approval.expectedSubject
    || input.htmlSha256.toLowerCase() !== approval.expectedHtmlSha256.toLowerCase()
    || input.pdfSha256.toLowerCase() !== approval.expectedPdfSha256.toLowerCase()) {
    return 'The original frozen email or PDF does not match its private approval record. No message was sent.'
  }
  return null
}
