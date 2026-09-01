import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { LUXOR_INVOICES_MAILBOX } from '@/lib/luxorSharedMailboxes'
import { saveLuxorMailAttachment } from '@/lib/luxorMailboxServer'
import { processPendingLuxorBillIntakes } from '@/lib/luxorBillIntakeServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

const MAX_INVOICE_BYTES = 20 * 1024 * 1024
const SUPPORTED_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function safeFilename(value: string) {
  return value.replace(/[\r\n\u0000]/g, '').trim().slice(0, 255) || 'uploaded-bill'
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF, JPG, or PNG bill to upload.' }, { status: 400 })
    const contentType = file.type.toLowerCase()
    if (!SUPPORTED_CONTENT_TYPES.has(contentType)) return NextResponse.json({ error: 'Bill uploads must be PDF, JPG, or PNG files.' }, { status: 400 })
    if (!file.size || file.size > MAX_INVOICE_BYTES) return NextResponse.json({ error: 'Bill uploads must be smaller than 20 MB.' }, { status: 400 })

    const uploadId = randomUUID()
    const receivedAt = new Date().toISOString()
    const filename = safeFilename(file.name)
    const messageId = uploadId
    const subject = `Manual bill upload: ${filename}`
    await supabaseRest('luxor_mail_messages?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: messageId,
        provider: 'resend',
        provider_id: `manual-upload:${uploadId}`,
        direction: 'incoming',
        thread_key: `manual-upload:${uploadId}`,
        from_address: session.email,
        to_addresses: [LUXOR_INVOICES_MAILBOX.address],
        subject,
        text_body: 'Bill uploaded from the Luxor owner portal for AI intake.',
        status: 'received',
        idempotency_key: `manual-bill-upload:${uploadId}`,
        occurred_at: receivedAt,
        metadata: { manualUpload: true, uploadedBy: session.email },
      }),
    })

    const attachment = await saveLuxorMailAttachment({
      messageId,
      sourceKey: `manual-upload-${uploadId}`,
      filename,
      contentType,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })

    const [intake] = await supabaseRest<Array<{ id: string; status: string; filename: string }>>('luxor_bill_intakes?select=id,status,filename', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        message_id: messageId,
        attachment_id: attachment.id,
        filename,
        content_type: contentType,
        size_bytes: file.size,
        sender_address: session.email,
        recipient_address: LUXOR_INVOICES_MAILBOX.address,
        source_type: 'portal_upload',
        subject,
        received_at: receivedAt,
        status: 'received',
      }),
    })
    if (!intake) throw new Error('Bill intake could not be queued.')

    // Start work opportunistically; the authenticated email worker remains the durable retry path.
    void processPendingLuxorBillIntakes(1).catch((error) => console.error('Manual bill intake worker start failed:', error))
    return NextResponse.json({ intake }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bill upload could not be queued.' }, { status: 500 })
  }
}
