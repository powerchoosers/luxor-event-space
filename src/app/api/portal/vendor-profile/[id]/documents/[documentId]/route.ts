import { NextRequest, NextResponse } from 'next/server'
import { postgrestSchemaUnavailable } from '@/lib/luxorPostgrestSchema'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { VENDOR_UUID, vendorDocumentPath, vendorFinanceSession, vendorStorage } from '@/lib/luxorVendorDocumentsServer'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; documentId: string }> }) {
  if (!await vendorFinanceSession()) return NextResponse.json({ error: 'Operations and finance access required.' }, { status: 403 })
  const { id: rawId, documentId: rawDocumentId } = await context.params
  const id = rawId.toLowerCase(), documentId = rawDocumentId.toLowerCase()
  if (!VENDOR_UUID.test(id) || !VENDOR_UUID.test(documentId)) return NextResponse.json({ error: 'Invalid document.' }, { status: 400 })
  try {
    const [row] = await supabaseRestStrict<Array<{ file_name: string; storage_path: string; content_type: string; size_bytes: number }>>(`luxor_vendor_documents?select=file_name,storage_path,content_type,size_bytes&id=eq.${documentId}&vendor_id=eq.${id}&limit=1`)
    if (!row || row.storage_path !== vendorDocumentPath(id, documentId) || !['application/pdf','image/jpeg','image/png'].includes(row.content_type)) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    const file = await vendorStorage(row.storage_path)
    if (!file.ok) throw new Error('Storage read failed')
    const filename = row.file_name.replace(/[\r\n"\\]/g, '_').slice(0, 160) || 'document'
    return new NextResponse(file.body, { headers: { 'Content-Type': row.content_type, 'Content-Length': String(row.size_bytes), 'Content-Disposition': `${request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } })
  } catch (error) {
    if (postgrestSchemaUnavailable(error)) {
      return NextResponse.json({ error: 'Vendor documents are not stored yet.', unavailable: true }, { status: 404 })
    }
    return NextResponse.json({ error: 'Document could not be opened.' }, { status: 503 })
  }
}
