import { NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { downloadLuxorMailAttachment } from '@/lib/luxorMailboxServer'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getOperationsSession()) return NextResponse.json({ error: 'Operations access required.' }, { status: 403 })
  const { id } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Invalid bill.' }, { status: 400 })
  try {
    const [bill] = await supabaseRestStrict<LuxorBill[]>(`luxor_bills?id=eq.${id}&select=*&limit=1`)
    if (!bill?.source_message_id || !bill.source_attachment_id) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    const result = await downloadLuxorMailAttachment(bill.source_message_id, bill.source_attachment_id)
    const contentType = /^(application\/pdf|image\/(png|jpeg))$/i.test(result.contentType) ? result.contentType : 'application/octet-stream'
    const filename = (bill.source_filename || 'invoice').replace(/[^\x20-\x7e]|["\\]/g, '_')
    return new NextResponse(result.bytes as BodyInit, { headers: { 'Content-Type': contentType, 'Content-Disposition': `inline; filename="${filename}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Document could not be loaded.' }, { status: 500 }) }
}
