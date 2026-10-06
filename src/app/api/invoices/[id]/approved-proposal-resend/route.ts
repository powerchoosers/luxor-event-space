import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { downloadLuxorDocument, getLuxorDocumentByInvoice } from '@/lib/luxorDocumentsServer'
import { createNote, listNotesByInquiry } from '@/lib/luxorNotesServer'
import { sendLuxorResendEmail } from '@/lib/luxorResendMailServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'
import {
  approvedProposalResendAuditMarker,
  approvedProposalResendKey,
  readApprovedProposalResend,
  validateApprovedProposalResend,
} from '@/lib/luxorApprovedProposalResend'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

async function correctEmailIfUnchanged(inquiry: LuxorInquiry, originalEmail: string, correctedEmail: string) {
  const currentEmail = inquiry.email?.trim() || ''
  if (currentEmail.toLowerCase() === correctedEmail.toLowerCase()) return inquiry
  if (currentEmail.toLowerCase() !== originalEmail.toLowerCase()) return null

  const [updated] = await supabaseRest<LuxorInquiry[]>(
    `luxor_inquiries?select=*&id=eq.${encodeURIComponent(inquiry.id)}&email=eq.${encodeURIComponent(currentEmail)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ email: correctedEmail, updated_at: new Date().toISOString() }),
    },
  )
  if (updated) return updated

  // A concurrent correction to the same approved address is safe; any other
  // concurrent edit is left untouched and stops the resend.
  const latest = await getLuxorInquiry(inquiry.id)
  return latest?.email?.trim().toLowerCase() === correctedEmail.toLowerCase() ? latest : null
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    const invoice = await getInvoice(id)
    if (!invoice || !invoice.inquiry_id) return NextResponse.json({ error: 'The proposal could not be found.' }, { status: 404 })
    const inquiry = await getLuxorInquiry(invoice.inquiry_id)
    if (!inquiry) return NextResponse.json({ error: 'The inquiry could not be found.' }, { status: 404 })

    const approvalRows = await supabaseRest<Array<{ approval_data: unknown }>>(
      `luxor_approved_proposal_resends?select=approval_data&invoice_id=eq.${encodeURIComponent(invoice.id)}&inquiry_id=eq.${encodeURIComponent(inquiry.id)}&limit=2`,
    )
    const approval = approvalRows.length === 1
      ? readApprovedProposalResend(approvalRows[0].approval_data, invoice, inquiry)
      : null
    if (!approval) return NextResponse.json({ error: 'A valid private approval record could not be verified.' }, { status: 409 })
    if (isLuxorOfferExpired(invoice)) return NextResponse.json({ error: 'The frozen proposal has expired and cannot be resent.' }, { status: 410 })

    const document = await getLuxorDocumentByInvoice(invoice.id, 'proposal')
    if (!document || document.inquiry_id !== inquiry.id || document.content_type !== 'application/pdf') {
      return NextResponse.json({ error: 'The private frozen proposal PDF could not be verified.' }, { status: 409 })
    }
    const pdf = await downloadLuxorDocument(document)
    const pdfSha256 = sha256(pdf)
    const proposalContext = invoice.proposal_context as Record<string, unknown> | null | undefined
    const snapshot = proposalContext?.delivery_snapshot as Record<string, unknown> | undefined
    const proposalEmail = snapshot?.proposal_email as { html?: unknown; subject?: unknown; attachment_filename?: unknown; review_url?: unknown } | undefined
    const html = typeof proposalEmail?.html === 'string' ? proposalEmail.html : ''
    const emailSha256 = sha256(html)
    const validationError = validateApprovedProposalResend({
      approval, invoice, inquiry, htmlSha256: emailSha256, pdfSha256,
    })
    if (validationError) return NextResponse.json({ error: validationError }, { status: 409 })

    const expectedReviewUrl = invoice.public_token
      ? `https://www.luxoratlaspalmas.com/proposal/${invoice.public_token}`
      : ''
    if (!expectedReviewUrl || proposalEmail?.review_url !== expectedReviewUrl || typeof proposalEmail?.subject !== 'string') {
      return NextResponse.json({ error: 'The frozen proposal link or subject could not be verified.' }, { status: 409 })
    }

    const correctedInquiry = await correctEmailIfUnchanged(inquiry, approval.originalEmail, approval.correctedEmail)
    if (!correctedInquiry) return NextResponse.json({ error: 'The inquiry email changed after approval. No message was sent.' }, { status: 409 })
    const currentInquiry = await getLuxorInquiry(inquiry.id)
    if (currentInquiry?.email?.trim().toLowerCase() !== approval.correctedEmail.toLowerCase()) {
      return NextResponse.json({ error: 'The corrected email is no longer saved on this inquiry. No message was sent.' }, { status: 409 })
    }

    const idempotencyKey = approvedProposalResendKey(invoice.id, Number(invoice.proposal_version), approval.approvalReference)
    const sent = await sendLuxorResendEmail({
      to: approval.correctedEmail,
      subject: proposalEmail.subject,
      content: html,
      from: 'booking@luxoratlaspalmas.com',
      fromName: 'Luxor Event Space',
      idempotencyKey,
      metadata: {
        flow_stage: 'approved_corrected_proposal_resend',
        approvalReference: approval.approvalReference,
        inquiryId: inquiry.id,
        invoiceId: invoice.id,
        proposalVersion: invoice.proposal_version,
        frozenPdfSha256: pdfSha256,
      },
      attachments: [{
        filename: typeof proposalEmail.attachment_filename === 'string' ? proposalEmail.attachment_filename : document.file_name,
        content: pdf,
        contentType: 'application/pdf',
      }],
    })

    const auditMarker = approvedProposalResendAuditMarker(idempotencyKey)
    const latestNotes = await listNotesByInquiry(inquiry.id)
    if (!latestNotes.some(note => note.content.includes(auditMarker))) {
      await createNote(
        inquiry.id,
        `${auditMarker}\nApproved frozen proposal resend accepted by Resend. Proposal version ${invoice.proposal_version}; PDF SHA-256 ${pdfSha256}; provider message ${sent.providerMessageId || 'pending webhook confirmation'}. Delivery is pending provider confirmation.`,
        'email_log',
        session.email,
      )
    }

    return NextResponse.json({
      accepted: true,
      delivery: 'accepted_pending_provider_confirmation',
      messageId: sent.messageId,
      providerMessageId: sent.providerMessageId,
      proposalVersion: invoice.proposal_version,
      pdfSha256,
    })
  } catch (error) {
    console.error('[approved-proposal-resend] failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The approved proposal resend failed.' }, { status: 500 })
  }
}
