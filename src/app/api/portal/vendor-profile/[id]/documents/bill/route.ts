import { after, NextRequest, NextResponse } from 'next/server'
import { inspectLuxorExpenseReceipt } from '@/lib/luxorExpenseReceiptsServer'
import { VENDOR_UUID, vendorFinanceSession } from '@/lib/luxorVendorDocumentsServer'
import { verifyDocumentTicket } from '@/lib/luxorProviderDocumentAnalysis'
import { claimProviderUploadDestination } from '@/lib/luxorProviderUploadDestination'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { saveLuxorMailAttachment } from '@/lib/luxorMailboxServer'
import { processPendingLuxorBillIntakes } from '@/lib/luxorBillIntakeServer'
import { LUXOR_INVOICES_MAILBOX } from '@/lib/luxorSharedMailboxes'

export const maxDuration = 60
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await vendorFinanceSession()
  if (!session) return NextResponse.json({ error: 'Operations and finance access required.' }, { status: 403 })
  const { id: raw } = await context.params
  const id = raw.toLowerCase()
  if (!VENDOR_UUID.test(id)) return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 })
  try {
    const form = await request.formData(), file = form.get('file'), requestId = String(form.get('request_id') || '').toLowerCase()
    if (!(file instanceof File) || !VENDOR_UUID.test(requestId)) return NextResponse.json({ error: 'Choose a document to upload.' }, { status: 400 })
    let inspected: Awaited<ReturnType<typeof inspectLuxorExpenseReceipt>>
    try { inspected = await inspectLuxorExpenseReceipt(file) } catch { return NextResponse.json({ error: 'Choose a valid PDF, JPG, or PNG up to 20 MB.' }, { status: 400 }) }
    const assessment = verifyDocumentTicket(String(form.get('analysis_ticket') || ''), inspected.sha256, id, session.email)
    if (!assessment || assessment.sensitive !== 'none' || !['bill', 'uncertain'].includes(assessment.kind)) return NextResponse.json({ error: 'The analysis expired or does not match this document. Analyze it again.' }, { status: 400 })
    const [vendor] = await supabaseRestStrict<Array<{ id: string; archived_at: string | null }>>(`luxor_vendors?select=id,archived_at&id=eq.${id}&limit=1`)
    if (!vendor || vendor.archived_at) return NextResponse.json({ error: 'An active provider is required.' }, { status: 409 })
    if (!await claimProviderUploadDestination({ id: requestId, vendor_id: id, sha256: inspected.sha256, created_by: session.email, kind: 'bill' })) return NextResponse.json({ error: 'This upload was already started for another document or destination. Retry the original upload.' }, { status: 409 })
    const metadata = { manualUpload: true, uploadedBy: session.email, providerId: id, documentHash: inspected.sha256 }
    await supabaseRestStrict('luxor_mail_messages?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id: requestId, provider: 'resend', provider_id: `provider-upload:${requestId}`, direction: 'incoming', thread_key: `provider-upload:${requestId}`, from_address: session.email, to_addresses: [LUXOR_INVOICES_MAILBOX.address], subject: `Provider bill upload: ${inspected.safeName}`, text_body: 'Bill uploaded from the owner portal.', status: 'received', idempotency_key: `provider-upload:${requestId}`, occurred_at: new Date().toISOString(), metadata }) })
    const [message] = await supabaseRestStrict<Array<{ metadata: Record<string, unknown> }>>(`luxor_mail_messages?select=metadata&id=eq.${requestId}&limit=1`)
    if (!message || message.metadata?.documentHash !== inspected.sha256 || message.metadata?.providerId !== id || message.metadata?.uploadedBy !== session.email) return NextResponse.json({ error: 'This upload request belongs to another document.' }, { status: 409 })
    const attachment = await saveLuxorMailAttachment({ messageId: requestId, sourceKey: `provider-upload-${requestId}`, filename: inspected.safeName, contentType: inspected.contentType, bytes: inspected.bytes })
    await supabaseRestStrict('luxor_bill_intakes?on_conflict=attachment_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ message_id: requestId, attachment_id: attachment.id, filename: inspected.safeName, content_type: inspected.contentType, size_bytes: inspected.bytes.length, sender_address: session.email, recipient_address: LUXOR_INVOICES_MAILBOX.address, source_type: 'portal_upload', subject: `Provider bill upload: ${inspected.safeName}`, received_at: new Date().toISOString(), status: 'received' }) })
    const [intake] = await supabaseRestStrict<Array<{ id: string; status: string; bill_id: string | null; duplicate_of_bill_id: string | null }>>(`luxor_bill_intakes?select=id,status,bill_id,duplicate_of_bill_id&attachment_id=eq.${attachment.id}&limit=1`)
    if (!intake) throw new Error('Bill intake could not be verified.')
    after(async () => { await processPendingLuxorBillIntakes(1, intake.id).catch(() => undefined) })
    return NextResponse.json({ intake }, { status: 202 })
  } catch { return NextResponse.json({ error: 'Bill upload could not be confirmed. Retry the same document.' }, { status: 503 }) }
}
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await vendorFinanceSession()
  if (!session) return NextResponse.json({ error: 'Operations and finance access required.' }, { status: 403 })
  const { id: raw } = await context.params
  const id = raw.toLowerCase(), requestId = request.nextUrl.searchParams.get('request_id') || ''
  if (!VENDOR_UUID.test(id) || !VENDOR_UUID.test(requestId)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  try {
    const [message] = await supabaseRestStrict<Array<{ metadata: Record<string, unknown> }>>(`luxor_mail_messages?select=metadata&id=eq.${requestId}&limit=1`)
    if (!message || message.metadata?.providerId !== id || message.metadata?.uploadedBy !== session.email) return NextResponse.json({ error: 'Upload not found.' }, { status: 404 })
    const [intake] = await supabaseRestStrict<Array<{ id: string; status: string; bill_id: string | null; duplicate_of_bill_id: string | null }>>(`luxor_bill_intakes?select=id,status,bill_id,duplicate_of_bill_id&message_id=eq.${requestId}&limit=1`)
    // The worker uses a lease and next-attempt guard, so polling can safely wake a
    // stalled or retryable intake without creating another bill.
    if (intake && ['received', 'failed', 'processing'].includes(intake.status)) after(async () => { await processPendingLuxorBillIntakes(1, intake.id).catch(() => undefined) })
    return NextResponse.json({ intake: intake || null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Upload status is unavailable.' }, { status: 503 }) }
}
