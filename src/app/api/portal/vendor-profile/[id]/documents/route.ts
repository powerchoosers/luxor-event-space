import { NextRequest, NextResponse } from 'next/server'
import { postgrestSchemaUnavailable } from '@/lib/luxorPostgrestSchema'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { inspectLuxorExpenseReceipt } from '@/lib/luxorExpenseReceiptsServer'
import { verifyDocumentTicket } from '@/lib/luxorProviderDocumentAnalysis'
import { claimProviderUploadDestination } from '@/lib/luxorProviderUploadDestination'
import { VENDOR_UUID, vendorDocumentPath, vendorFinanceSession, vendorStorage, vendorStorageObjectMissing } from '@/lib/luxorVendorDocumentsServer'

type Claim = { id: string; vendor_id: string; file_name: string; content_type: string; size_bytes: number; sha256: string; kind: string; created_by: string; created_at: string }
const claimSelect = 'id,vendor_id,file_name,content_type,size_bytes,sha256,kind,created_by,created_at'
function publicClaim(row: Claim) { return { id: row.id, file_name: row.file_name, size_bytes: row.size_bytes, kind: row.kind, created_at: row.created_at } }
async function readClaim(vendorId: string, documentId: string) { const [row] = await supabaseRestStrict<Claim[]>(`luxor_vendor_document_claims?select=${claimSelect}&id=eq.${documentId}&vendor_id=eq.${vendorId}&limit=1`); return row || null }
type Doc = { id: string; vendor_id: string; file_name: string; content_type: string; size_bytes: number; storage_path: string; sha256: string; kind: string; created_at: string; scan_metadata?: { contract_end_date?: string | null } | null }
const select = 'id,vendor_id,file_name,content_type,size_bytes,storage_path,sha256,kind,created_at'
async function readExisting(vendorId: string, documentId: string) {
  const [row] = await supabaseRestStrict<Doc[]>(`luxor_vendor_documents?select=${select}&id=eq.${documentId}&vendor_id=eq.${vendorId}&limit=1`)
  return row || null
}
function publicDoc(row: Doc) { return { id: row.id, file_name: row.file_name, content_type: row.content_type, size_bytes: row.size_bytes, kind: row.kind, created_at: row.created_at, scan_metadata: row.scan_metadata || null } }
function documentsUnavailable(error: unknown) {
  return postgrestSchemaUnavailable(error)
}
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await vendorFinanceSession()) return NextResponse.json({ error: 'Operations and finance access required.' }, { status: 403 })
  const { id: rawId } = await context.params
  const id = rawId.toLowerCase()
  if (!VENDOR_UUID.test(id)) return NextResponse.json({ error: 'Invalid vendor.' }, { status: 400 })
  try {
    try {
      await supabaseRestStrict<Doc[]>(`luxor_vendor_documents?select=id&vendor_id=eq.${id}&limit=1`)
    } catch (error) {
      if (documentsUnavailable(error)) {
        return NextResponse.json({ documents: [], pendingUploads: [], unavailable: true }, { headers: { 'Cache-Control': 'no-store' } })
      }
      throw error
    }
    let documentFields = select
    let analysisAvailable = false
    try {
      await supabaseRestStrict('luxor_vendor_documents?select=scan_metadata&limit=1')
      documentFields += ',scan_metadata'
      await supabaseRestStrict('luxor_provider_upload_destinations?select=id&limit=1')
      analysisAvailable = true
    } catch (error) { if (!postgrestSchemaUnavailable(error)) throw error }
    const path = `luxor_vendor_documents?select=${documentFields}&vendor_id=eq.${id}&order=created_at.desc,id.asc`
    const count = await supabaseRestCount(path); const rows: Doc[] = []
    for (let offset = 0; offset < count; offset += 500) { const page = await supabaseRestStrict<Doc[]>(`${path}&limit=500&offset=${offset}`); if (page.length !== Math.min(500, count-offset)) throw new Error('Incomplete documents'); rows.push(...page) }
    if (rows.length !== count || new Set(rows.map((row) => row.id)).size !== count || await supabaseRestCount(path) !== count) throw new Error('Documents changed while loading')
    const claimPath = `luxor_vendor_document_claims?select=${claimSelect}&vendor_id=eq.${id}&order=created_at.desc,id.asc`
    let pendingUploads: ReturnType<typeof publicClaim>[] = []
    try {
      const claimCount = await supabaseRestCount(claimPath); const claims: Claim[] = []
      for (let offset = 0; offset < claimCount; offset += 500) { const page = await supabaseRestStrict<Claim[]>(`${claimPath}&limit=500&offset=${offset}`); if (page.length !== Math.min(500, claimCount-offset)) throw new Error('Incomplete claims'); claims.push(...page) }
      if (claims.length !== claimCount || new Set(claims.map((row) => row.id)).size !== claimCount || await supabaseRestCount(claimPath) !== claimCount) throw new Error('Claims changed while loading')
      const completed = new Set(rows.map((row) => row.id))
      pendingUploads = claims.filter((claim) => !completed.has(claim.id)).map(publicClaim)
    } catch (error) {
      if (!postgrestSchemaUnavailable(error)) throw error
    }
    return NextResponse.json({ documents: rows.map(publicDoc), pendingUploads, analysisAvailable }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (documentsUnavailable(error)) {
      return NextResponse.json({ documents: [], pendingUploads: [], unavailable: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ error: 'Vendor documents are unavailable. Please retry.' }, { status: 503 })
  }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await vendorFinanceSession()
  if (!session) return NextResponse.json({ error: 'Operations and finance access required.' }, { status: 403 })
  const { id: rawId } = await context.params
  const id = rawId.toLowerCase()
  if (!VENDOR_UUID.test(id)) return NextResponse.json({ error: 'Invalid vendor.' }, { status: 400 })
  try {
    try {
      await supabaseRestStrict<Doc[]>(`luxor_vendor_documents?select=id&limit=1`)
    } catch (error) {
      if (documentsUnavailable(error)) {
        return NextResponse.json({ error: 'Vendor documents are not stored yet. Nothing was uploaded.', unavailable: true }, { status: 409 })
      }
      throw error
    }
    const form = await request.formData(); const file = form.get('file'); const documentId = String(form.get('request_id') || '').toLowerCase(); const kind = String(form.get('kind') || '')
    if (!(file instanceof File) || !VENDOR_UUID.test(documentId) || !['contract','other'].includes(kind) || (!form.get('analysis_ticket') && form.get('no_tax_identifiers') !== 'true') || /(?:^|[^a-z])(?:w[\s_-]*9|ssn|tax[\s_-]*id|ein)(?:[^a-z]|$)/i.test(file.name)) return NextResponse.json({ error: 'Choose a supported document and confirm it has no tax or government identification numbers.' }, { status: 400 })
    let inspected: Awaited<ReturnType<typeof inspectLuxorExpenseReceipt>>
    try { inspected = await inspectLuxorExpenseReceipt(file) } catch { return NextResponse.json({ error: 'Choose a valid PDF, JPG, or PNG smaller than 20 MB.' }, { status: 400 }) }
    const ticket = String(form.get('analysis_ticket') || '')
    if (ticket) { try { await supabaseRestStrict('luxor_vendor_documents?select=scan_metadata&limit=1') } catch (error) { if (postgrestSchemaUnavailable(error)) return NextResponse.json({ error: 'Automatic document storage is not available yet.' }, { status: 503 }); throw error } }
    const analysis = ticket ? verifyDocumentTicket(ticket, inspected.sha256, id, session.email) : null
    if (ticket && (!analysis || analysis.sensitive !== 'none' || (analysis.kind !== 'uncertain' && analysis.kind !== kind))) return NextResponse.json({ error: 'The document analysis expired or does not match this file. Please analyze it again.' }, { status: 400 })
    try {
      if (!await claimProviderUploadDestination({ id: documentId, vendor_id: id, sha256: inspected.sha256, created_by: session.email, kind: kind as 'contract' | 'other' })) return NextResponse.json({ error: 'This upload was already started for another document or destination. Retry the original upload.' }, { status: 409 })
    } catch (error) {
      // Keep the attested legacy upload path usable on the old schema; AI uploads
      // require the shared destination claim and must fail closed without it.
      if (analysis || !postgrestSchemaUnavailable(error)) throw error
    }
    const matches = (row: Doc) => row.id === documentId && row.vendor_id === id && row.sha256 === inspected.sha256 && row.kind === kind && row.file_name === inspected.safeName && row.content_type === inspected.contentType && row.size_bytes === inspected.bytes.length && row.storage_path === vendorDocumentPath(id, documentId)
    const existing = await readExisting(id, documentId)
    if (existing) {
      if (!matches(existing)) return NextResponse.json({ error: 'This upload request was already used for a different document.' }, { status: 409 })
      return NextResponse.json({ document: publicDoc(existing), replayed: true })
    }
    const [vendor] = await supabaseRestStrict<Array<{ id: string; archived_at: string | null }>>(`luxor_vendors?select=id,archived_at&id=eq.${id}&limit=1`)
    if (!vendor) return NextResponse.json({ error: 'Vendor not found.' }, { status: 404 })
    const duplicates = await supabaseRestStrict<Doc[]>(`luxor_vendor_documents?select=${select}&vendor_id=eq.${id}&sha256=eq.${inspected.sha256}&limit=1`)
    if (duplicates.length) {
      const duplicate = duplicates[0]
      if (matches(duplicate)) return NextResponse.json({ document: publicDoc(duplicate), replayed: true })
      return NextResponse.json({ error: 'This document is already attached to the vendor.' }, { status: 409 })
    }
    let claim = await readClaim(id, documentId)
    if (!claim) {
      if (vendor.archived_at) return NextResponse.json({ error: 'Restore this vendor before adding a document.' }, { status: 409 })
      try {
        const [created] = await supabaseRestStrict<Claim[]>(`luxor_vendor_document_claims?select=${claimSelect}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ id: documentId, vendor_id: id, file_name: inspected.safeName, content_type: inspected.contentType, size_bytes: inspected.bytes.length, sha256: inspected.sha256, kind, created_by: session.email }) })
        claim = created || null
      } catch (error) {
        // A concurrent retry may have inserted this claim, or its response may be lost.
        claim = await readClaim(id, documentId)
        if (!claim) {
          const [sameContent] = await supabaseRestStrict<Claim[]>(`luxor_vendor_document_claims?select=${claimSelect}&vendor_id=eq.${id}&sha256=eq.${inspected.sha256}&limit=1`)
          if (sameContent) return NextResponse.json({ error: 'An upload for this document already exists. Reload and resume the pending upload.' }, { status: 409 })
          throw error
        }
      }
    }
    if (!claim) throw new Error('Upload claim was not confirmed')
    if (claim.sha256 !== inspected.sha256 || claim.kind !== kind || claim.file_name !== inspected.safeName || claim.content_type !== inspected.contentType || claim.size_bytes !== inspected.bytes.length) return NextResponse.json({ error: 'This upload request was already used for a different document.' }, { status: 409 })
    const path = vendorDocumentPath(id, documentId)
    // Recovery after observing archival requires an existing object. A write
    // already started while active can still finish after archival.
    let stored = await vendorStorage(path)
    if (!stored.ok) {
      if (!(await vendorStorageObjectMissing(stored))) throw new Error('Could not inspect stored document')
      const [current] = await supabaseRestStrict<Array<{ archived_at: string | null }>>(`luxor_vendors?select=archived_at&id=eq.${id}&limit=1`)
      if (!current || current.archived_at) return NextResponse.json({ error: 'The document is not in storage. Restore this vendor before retrying the upload.' }, { status: 409 })
      const uploaded = await vendorStorage(path, { method: 'POST', headers: { 'Content-Type': inspected.contentType, 'x-upsert': 'false' }, body: Buffer.from(inspected.bytes) })
      // A competing request or a lost response may already have written it.
      // Verify storage after both success and failure before inserting metadata.
      if (!uploaded.ok && ![400, 409].includes(uploaded.status)) throw new Error('Upload could not be confirmed')
      stored = await vendorStorage(path)
      if (!stored.ok) throw new Error('Could not verify stored document')
    }
    const bytes = new Uint8Array(await stored.arrayBuffer())
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('')
    if (bytes.length !== claim.size_bytes || digest !== claim.sha256) return NextResponse.json({ error: 'Stored document does not match this upload request. Contact an administrator.' }, { status: 409 })
    let created: Doc | undefined
    try {
      ;[created] = await supabaseRestStrict<Doc[]>(`luxor_vendor_documents?select=${select}${analysis ? ',scan_metadata' : ''}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ id: documentId, vendor_id: id, file_name: inspected.safeName, storage_path: path, content_type: inspected.contentType, size_bytes: inspected.bytes.length, created_by: claim.created_by, finalized_by: session.email, sha256: inspected.sha256, kind, no_tax_identifiers_confirmed: analysis ? null : true, ...(analysis ? { scan_metadata: { kind: analysis.kind, sensitive: analysis.sensitive, confidence: analysis.confidence, contract_end_date: analysis.contractEndDate, source: 'ai_unverified' } } : {}) }) })
    } catch (error) {
      // An insert may have committed even if its response was lost, or another retry won.
      const replay = await readExisting(id, documentId)
      if (replay && matches(replay)) return NextResponse.json({ document: publicDoc(replay), replayed: true })
      throw error
    }
    if (!created) {
      const replay = await readExisting(id, documentId)
      if (replay && matches(replay)) return NextResponse.json({ document: publicDoc(replay), replayed: true })
      throw new Error('Document record was not returned')
    }
    return NextResponse.json({ document: publicDoc(created), replayed: false }, { status: 201 })
  } catch (error) {
    if (documentsUnavailable(error)) {
      return NextResponse.json({ error: 'Vendor documents are not stored yet. Nothing was uploaded.', unavailable: true }, { status: 409 })
    }
    console.error('Vendor document upload failed:', error)
    return NextResponse.json({ error: 'Document could not be confirmed. Retry the same upload before choosing another.' }, { status: 503 })
  }
}
