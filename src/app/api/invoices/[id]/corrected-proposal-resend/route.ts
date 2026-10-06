import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { downloadLuxorDocument, getLuxorDocumentByInvoice } from '@/lib/luxorDocumentsServer'
import { createNote, listNotesByInquiry } from '@/lib/luxorNotesServer'
import { sendLuxorZohoEmail } from '@/lib/zohoMailServer'
import {
  MARY_ROBLES_CORRECTED_EMAIL,
  MARY_ROBLES_CORRECTION_REFERENCE,
  MARY_ROBLES_FROZEN_PDF_SHA256,
  MARY_ROBLES_INQUIRY_ID,
  MARY_ROBLES_ORIGINAL_EMAIL,
  MARY_ROBLES_PROPOSAL_ID,
  maryRoblesResendIdempotencyKey,
  validateMaryRoblesProposalResend,
} from '@/lib/luxorCorrectedProposalResend'
import { isLuxorOfferExpired } from '@/lib/luxorOffer'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await params
    if (id !== MARY_ROBLES_PROPOSAL_ID) return NextResponse.json({ error: 'This correction action is not available for that proposal.' }, { status: 404 })

    const invoice = await getInvoice(id)
    const inquiry = invoice?.inquiry_id ? await getLuxorInquiry(invoice.inquiry_id) : null
    if (isLuxorOfferExpired(invoice)) return NextResponse.json({ error: 'The frozen proposal has expired and cannot be resent.' }, { status: 410 })

    const document = await getLuxorDocumentByInvoice(id, 'proposal')
    if (!document || document.inquiry_id !== MARY_ROBLES_INQUIRY_ID || document.content_type !== 'application/pdf') {
      return NextResponse.json({ error: 'The private frozen proposal PDF could not be verified.' }, { status: 409 })
    }
    const pdf = await downloadLuxorDocument(document)
    const pdfSha256 = createHash('sha256').update(pdf).digest('hex')
    const proposalHtml = invoice?.proposal_context?.delivery_snapshot && typeof invoice.proposal_context.delivery_snapshot === 'object'
      ? (invoice.proposal_context.delivery_snapshot as Record<string, unknown>).proposal_email
      : null
    const savedHtml = proposalHtml && typeof proposalHtml === 'object' && typeof (proposalHtml as Record<string, unknown>).html === 'string'
      ? (proposalHtml as { html: string }).html
      : ''
    const emailHtmlSha256 = createHash('sha256').update(savedHtml).digest('hex')
    const validationError = validateMaryRoblesProposalResend({
      request: {
        expectedInvoiceId: MARY_ROBLES_PROPOSAL_ID,
        expectedInquiryId: MARY_ROBLES_INQUIRY_ID,
        originalEmail: MARY_ROBLES_ORIGINAL_EMAIL,
        correctedEmail: MARY_ROBLES_CORRECTED_EMAIL,
        correctionReference: MARY_ROBLES_CORRECTION_REFERENCE,
        expectedPdfSha256: MARY_ROBLES_FROZEN_PDF_SHA256,
      },
      invoice,
      inquiry,
      currentEmailHtmlSha256: emailHtmlSha256,
      currentPdfSha256: pdfSha256,
    })
    if (validationError) return NextResponse.json({ error: validationError }, { status: 409 })
    if (!invoice || !inquiry) return NextResponse.json({ error: 'The proposal or inquiry is unavailable.' }, { status: 404 })

    const snapshot = invoice.proposal_context!.delivery_snapshot as Record<string, unknown>
    const proposalEmail = snapshot.proposal_email as { html: string; subject: string; attachment_filename?: string; review_url?: string; recipient_name?: string }
    const privatePage = `https://www.luxoratlaspalmas.com/proposal/${invoice.public_token}`
    if (!invoice.public_token || proposalEmail.review_url !== privatePage) {
      return NextResponse.json({ error: 'The frozen proposal link could not be verified.' }, { status: 409 })
    }

    // Update only this inquiry email. Old send/suppression history and the frozen invoice stay unchanged.
    if (inquiry.email?.trim().toLowerCase() !== MARY_ROBLES_CORRECTED_EMAIL) {
      const correctedInquiry = await updateLuxorInquiry(inquiry.id, { email: MARY_ROBLES_CORRECTED_EMAIL })
      if (correctedInquiry?.email?.trim().toLowerCase() !== MARY_ROBLES_CORRECTED_EMAIL) {
        return NextResponse.json({ error: 'The inquiry email correction could not be confirmed; no message was sent.' }, { status: 409 })
      }
    }

    const idempotencyKey = maryRoblesResendIdempotencyKey(Number(invoice.proposal_version || 1))
    const result = await sendLuxorZohoEmail({
      to: MARY_ROBLES_CORRECTED_EMAIL,
      subject: proposalEmail.subject,
      content: savedHtml,
      from: 'booking@luxoratlaspalmas.com',
      fromName: 'Luxor Event Space',
      attachments: [{
        filename: proposalEmail.attachment_filename || document.file_name,
        content: pdf,
        contentType: 'application/pdf',
      }],
      idempotencyKey,
      metadata: {
        flow_stage: 'approved_corrected_proposal_resend',
        invoice_id: invoice.id,
        inquiry_id: inquiry.id,
        proposal_version: invoice.proposal_version || 1,
        correction_reference: MARY_ROBLES_CORRECTION_REFERENCE,
        original_recipient: MARY_ROBLES_ORIGINAL_EMAIL,
        corrected_recipient: MARY_ROBLES_CORRECTED_EMAIL,
        frozen_pdf_sha256: pdfSha256,
      },
    })
    const providerMessageId = 'providerMessageId' in result ? result.providerMessageId : null

    const auditMarker = `Approved frozen proposal resend ${MARY_ROBLES_CORRECTION_REFERENCE}`
    const existingNotes = await listNotesByInquiry(inquiry.id)
    if (!existingNotes.some((note) => note.content.includes(auditMarker))) {
      await createNote(
        inquiry.id,
        `${auditMarker}: corrected recipient ${MARY_ROBLES_CORRECTED_EMAIL}; proposal ${invoice.id} version ${invoice.proposal_version || 1}; frozen PDF SHA-256 ${pdfSha256}; provider accepted message ${providerMessageId || result.messageId}. Provider delivery is pending confirmation.`,
        'email_log',
        session.email,
      )
    }

    return NextResponse.json({
      accepted: true,
      delivery: 'accepted_pending_provider_confirmation',
      messageId: result.messageId,
      providerMessageId,
      recipient: result.to,
      invoiceId: invoice.id,
      proposalVersion: invoice.proposal_version || 1,
      pdfSha256,
    })
  } catch (error) {
    console.error('[corrected-proposal-resend] failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The approved proposal resend failed.' }, { status: 500 })
  }
}
