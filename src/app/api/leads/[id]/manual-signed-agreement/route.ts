import { NextRequest, NextResponse } from 'next/server'
import { getLuxorBooking, updateLuxorBooking } from '@/lib/luxorBookingsServer'
import { ensureDocumentBucket } from '@/lib/luxorDocumentsServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getInvoice } from '@/lib/luxorInvoicesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { syncLuxorPaymentInstallments } from '@/lib/luxorPaymentInstallmentsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorDocument } from '@/lib/luxorInquiryTypes'

export const runtime = 'nodejs'

const MAX_PDF_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id: inquiryId } = await params
    const form = await request.formData()
    const bookingId = String(form.get('bookingId') || '')
    const file = form.get('file')
    if (!(file instanceof File) || !bookingId) return NextResponse.json({ error: 'Choose the signed agreement PDF and its booking.' }, { status: 400 })
    if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name) || file.size <= 0 || file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'Upload a PDF agreement no larger than 10 MB.' }, { status: 400 })
    }
    const [inquiry, booking] = await Promise.all([getLuxorInquiry(inquiryId), getLuxorBooking(bookingId)])
    if (!inquiry || inquiry.status === 'closed_lost' || !booking || booking.inquiry_id !== inquiry.id || booking.status === 'cancelled') {
      return NextResponse.json({ error: 'This signed agreement does not belong to an active booking for this lead.' }, { status: 409 })
    }
    const invoice = booking.invoice_id ? await getInvoice(booking.invoice_id) : null
    if (!invoice?.proposal_accepted_at || invoice.status !== 'sent') {
      return NextResponse.json({ error: 'Record acceptance of the locked final proposal before uploading a signed agreement.' }, { status: 409 })
    }

    const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) throw new Error('Supabase configuration is missing on the server.')
    const uploadedAt = new Date().toISOString()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `contracts/${booking.id}/manual/${Date.now()}-${safeName}`
    await ensureDocumentBucket()
    const upload = await fetch(`${url}/storage/v1/object/luxor-documents/${storagePath}`, {
      method: 'PUT',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
      body: Buffer.from(await file.arrayBuffer()),
    })
    if (!upload.ok) throw new Error(`Could not store the signed agreement: ${await upload.text()}`)
    const [document] = await supabaseRest<LuxorDocument[]>('luxor_documents?select=*', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
        inquiry_id: inquiry.id, invoice_id: invoice.id, document_type: 'executed_contract', title: `Manually signed agreement for ${booking.client_name}`,
        file_name: file.name, storage_path: storagePath, content_type: 'application/pdf', size_bytes: file.size, created_by: session.email,
        metadata: { signature_method: 'manual_upload', uploaded_at: uploadedAt, uploaded_by: session.email, booking_id: booking.id }, updated_at: uploadedAt,
      }),
    })
    if (!document) throw new Error('The agreement was stored but its document record could not be created.')
    const signedBooking = await updateLuxorBooking(booking.id, {
      status: 'confirmed', contract_status: 'signed', contract_signed_at: uploadedAt,
      metadata: { ...booking.metadata, manual_signed_agreement_document_id: document.id, manual_signed_agreement_uploaded_at: uploadedAt, manual_signed_agreement_uploaded_by: session.email, reservation_state: 'awaiting_initial_payment' },
    }) || booking
    await syncLuxorPaymentInstallments({ booking: { ...signedBooking, created_at: uploadedAt }, invoice })
    await Promise.all([
      updateLuxorInquiry(inquiry.id, { status: 'booked', pipeline_stage: 'deposit', metadata: { ...inquiry.metadata, contract_signed_at: uploadedAt, contract_signature_method: 'manual_upload' } }),
      createNote(inquiry.id, `Signed paper agreement uploaded by ${session.email}. The booking is now signed; collect the selected initial payment to reserve the date.`, 'status_change', 'Owner Portal'),
    ])
    return NextResponse.json({ document, booking: signedBooking }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to upload the signed agreement.' }, { status: 500 })
  }
}
