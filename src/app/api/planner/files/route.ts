import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import {
  buildPlannerDesignRevisionSnapshot,
  commitPlannerDesignAttachmentChange,
  getPlannerBooking,
  getPlannerDesign,
  PlannerMutationOutcomeUnknownError,
  snapshotPlannerDesignAssets,
} from '@/lib/luxorPlannerServer'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

const MAX_SIZE = 25 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain',
])
type PlannerFile = { id: string; storage_path: string; file_name: string; content_type: string; size_bytes: number; event_vendor_id?: string | null; design_id?: string | null; category?: string | null }

async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) return { response: NextResponse.json({ error: 'Portal sign-in required.' }, { status: 401 }) }
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'planner')) return { response: NextResponse.json({ error: 'Planner access is not enabled for this portal account.' }, { status: 403 }) }
  return { session }
}
function configuration() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Private Planner file storage is not configured.')
  return { url: url.replace(/\/$/, ''), key }
}
function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9 ._-]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'planner-file'
}
function detectPlannerMime(bytes: Uint8Array, fileName: string): string | null {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const starts = (...values: number[]) => values.every((value, index) => buffer[index] === value)
  const extension = fileName.toLowerCase().split('.').pop() || ''
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x52, 0x49, 0x46, 0x46) && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  const ole = starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
  if (ole && extension === 'doc') return 'application/msword'
  if (ole && extension === 'xls') return 'application/vnd.ms-excel'
  if (starts(0x50, 0x4b, 0x03, 0x04)) {
    const hasWordContent = buffer.includes(Buffer.from('word/document.xml'))
    const hasWorkbookContent = buffer.includes(Buffer.from('xl/workbook.xml'))
    if (hasWordContent && !hasWorkbookContent) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (hasWorkbookContent && !hasWordContent) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (extension === 'txt') {
    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      if (!decoded.includes('\0')) return 'text/plain'
    } catch { return null }
  }
  return null
}
function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Planner file request failed.'
  const missingTable = /could not find the table|relation .* does not exist/i.test(message)
  if (missingTable) return NextResponse.json({ error: 'Planner storage has not been enabled yet.' }, { status: 503 })
  console.error('Planner file request failed:', error)
  return NextResponse.json({ error: 'Planner file request failed. Please try again.' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorize()
    if ('response' in access) return access.response
    const requestUrl = new URL(request.url)
    const id = requestUrl.searchParams.get('id')
    const download = requestUrl.searchParams.get('download') === '1'
    if (!id) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 })
    const [file] = await supabaseRestStrict<PlannerFile[]>(`luxor_planner_files?select=id,storage_path,file_name,content_type,size_bytes&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    const { url, key } = configuration()
    const response = await fetch(`${url}/storage/v1/object/luxor-planner-files/${file.storage_path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store',
    })
    if (!response.ok) return NextResponse.json({ error: 'Private Planner file could not be opened.' }, { status: 502 })
    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        'Content-Type': ALLOWED_TYPES.has(file.content_type) ? file.content_type : 'application/octet-stream',
        'Content-Length': String(file.size_bytes),
        'Content-Disposition': `${!download && (file.content_type === 'application/pdf' || file.content_type.startsWith('image/')) ? 'inline' : 'attachment'}; filename="${safeName(file.file_name)}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) { return responseError(error) }
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorize()
    if ('response' in access) return access.response
    const form = await request.formData()
    const upload = form.get('file')
    if (!(upload instanceof File) || upload.size < 1 || upload.size > MAX_SIZE) return NextResponse.json({ error: 'Choose a file up to 25 MB.' }, { status: 400 })
    if (!ALLOWED_TYPES.has(upload.type)) return NextResponse.json({ error: 'This file type is not supported.' }, { status: 415 })
    const bytes = new Uint8Array(await upload.arrayBuffer())
    if (detectPlannerMime(bytes, upload.name) !== upload.type) return NextResponse.json({ error: 'The file contents do not match the selected file type.' }, { status: 415 })
    const bookingId = String(form.get('booking_id') || '').trim() || null
    const vendorId = String(form.get('vendor_id') || '').trim() || null
    const designId = String(form.get('design_id') || '').trim() || null
    const eventVendorId = String(form.get('event_vendor_id') || '').trim() || null
    if ([bookingId, vendorId, designId, eventVendorId].filter(Boolean).length !== 1) return NextResponse.json({ error: 'Attach the file to one event, vendor, design, or event vendor.' }, { status: 400 })
    const category = String(form.get('category') || 'other').slice(0, 80)
    if (category === 'design_revision_snapshot') return NextResponse.json({ error: 'Revision snapshots are system managed.' }, { status: 400 })
    if (bookingId && !(await getPlannerBooking(bookingId))) return NextResponse.json({ error: 'Confirmed event not found.' }, { status: 404 })
    if (vendorId) {
      const [vendor] = await supabaseRestStrict<Array<{ id: string }>>(`luxor_planner_vendors?select=id&id=eq.${encodeURIComponent(vendorId)}&archived_at=is.null&limit=1`)
      if (!vendor) return NextResponse.json({ error: 'Vendor not found.' }, { status: 404 })
    }
    let targetDesign: Record<string, unknown> | null = null
    const expectedRevision = Number(form.get('expected_revision'))
    if (designId) {
      targetDesign = await getPlannerDesign(designId)
      if (!targetDesign || targetDesign.archived_at) return NextResponse.json({ error: 'Design not found.' }, { status: 404 })
      if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(targetDesign.revision || 1)) return NextResponse.json({ error: 'This design changed after you opened it. Reopen the latest revision before attaching a file.' }, { status: 409 })
    }
    if (eventVendorId) {
      const [assignment] = await supabaseRestStrict<Array<{ id: string; booking_id: string }>>(`luxor_planner_event_vendors?select=id,booking_id&id=eq.${encodeURIComponent(eventVendorId)}&limit=1`)
      if (!assignment || !(await getPlannerBooking(assignment.booking_id))) return NextResponse.json({ error: 'Confirmed event vendor assignment not found.' }, { status: 404 })
    }
    const fileId = crypto.randomUUID()
    const fileName = safeName(upload.name)
    const path = `${fileId}/${encodeURIComponent(fileName)}`
    const { url, key } = configuration()
    const stored = await fetch(`${url}/storage/v1/object/luxor-planner-files/${path}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': upload.type, 'x-upsert': 'false' }, body: bytes, cache: 'no-store',
    })
    if (!stored.ok) return NextResponse.json({ error: 'File could not be stored securely.' }, { status: 502 })
    const record = {
      id: fileId, booking_id: bookingId, vendor_id: vendorId, design_id: designId, event_vendor_id: eventVendorId,
      category,
      title: safeName(String(form.get('title') || fileName)).slice(0, 200),
      file_name: fileName, storage_path: path, content_type: upload.type, size_bytes: upload.size,
      expires_at: /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('expires_at') || '')) ? String(form.get('expires_at')) : null,
      internal_only: true, uploaded_by: access.session.email, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    const removeStagedUpload = async () => {
      await fetch(`${url}/storage/v1/object/luxor-planner-files/${path}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }).catch(() => undefined)
    }
    if (designId) {
      let revisionAssets: Awaited<ReturnType<typeof snapshotPlannerDesignAssets>> | null = null
      try {
        revisionAssets = await snapshotPlannerDesignAssets(designId, expectedRevision, access.session.email)
        const snapshot = buildPlannerDesignRevisionSnapshot(targetDesign!, expectedRevision, revisionAssets.assets)
        // The new bytes are staged privately. A single DB transaction publishes
        // their metadata, the immutable previous revision, and the revision bump.
        const committed = await commitPlannerDesignAttachmentChange({
          designId,
          expectedRevision,
          operation: 'upload',
          snapshot,
          file: record,
        })
        if (!committed.committed || !committed.file) {
          await revisionAssets.cleanup()
          await removeStagedUpload()
          return NextResponse.json({ error: 'This design changed while the attachment was uploading. Reopen the latest revision and try again.' }, { status: 409 })
        }
        return NextResponse.json(committed.file, { status: 201 })
      } catch (error) {
        if (error instanceof PlannerMutationOutcomeUnknownError) {
          // A negative read can precede a late commit. Retain the upload and
          // copied history objects until a terminal result is known.
          return NextResponse.json({ error: 'The upload may have completed, but its response was not confirmed. Reload the design before retrying.' }, { status:503 })
        }
        if (revisionAssets) await revisionAssets.cleanup()
        await removeStagedUpload()
        throw error
      }
    }

    let saved: Record<string, unknown> | undefined
    try {
      [saved] = await supabaseRestStrict<Array<Record<string, unknown>>>('luxor_planner_files?select=*', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record),
      })
    } catch (error) {
      await fetch(`${url}/storage/v1/object/luxor-planner-files/${path}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }).catch(() => undefined)
      throw error
    }
    if (!saved) {
      await fetch(`${url}/storage/v1/object/luxor-planner-files/${path}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
      return NextResponse.json({ error: 'File metadata could not be saved.' }, { status: 500 })
    }
    return NextResponse.json(saved, { status: 201 })
  } catch (error) { return responseError(error) }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await authorize()
    if ('response' in access) return access.response
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid file update.' }, { status: 400 })
    const value = body as Record<string, unknown>
    const id = typeof value.id === 'string' ? value.id : ''
    if (!id) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 })
    const [existing] = await supabaseRestStrict<PlannerFile[]>(`luxor_planner_files?select=id,storage_path,file_name,content_type,size_bytes,event_vendor_id,design_id,category&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!existing) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    if (existing.category === 'design_revision_snapshot') return NextResponse.json({ error: 'Saved revision attachments are immutable.' }, { status: 409 })
    if (existing.design_id) return NextResponse.json({ error: 'Design attachments are versioned. Remove the file and upload its replacement to preserve revision history.' }, { status: 409 })
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof value.title === 'string' && value.title.trim()) patch.title = safeName(value.title).slice(0, 200)
    if (typeof value.category === 'string') patch.category = value.category.trim().slice(0, 80)
    if (value.expires_at === null || (typeof value.expires_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.expires_at))) patch.expires_at = value.expires_at
    const [saved] = await supabaseRestStrict<Array<Record<string, unknown>>>(`luxor_planner_files?select=*&id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) })
    return saved ? NextResponse.json(saved) : NextResponse.json({ error: 'File not found.' }, { status: 404 })
  } catch (error) { return responseError(error) }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await authorize()
    if ('response' in access) return access.response
    const requestUrl = new URL(request.url)
    const id = requestUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 })
    const [file] = await supabaseRestStrict<PlannerFile[]>(`luxor_planner_files?select=*&id=eq.${encodeURIComponent(id)}&limit=1`)
    if (!file) {
      const designId = requestUrl.searchParams.get('design_id')
      const requestedRevision = Number(requestUrl.searchParams.get('revision'))
      if (designId && Number.isInteger(requestedRevision) && requestedRevision > 0) {
        const revisions = await supabaseRestStrict<Array<{ snapshot: Record<string, unknown> }>>(`luxor_planner_design_revisions?select=snapshot&design_id=eq.${encodeURIComponent(designId)}&revision=eq.${requestedRevision}&limit=1`)
        const assets = revisions[0]?.snapshot?.assets
        if (Array.isArray(assets) && assets.some((asset) => asset && typeof asset === 'object' && (asset as Record<string, unknown>).source_file_id === id)) {
          return NextResponse.json({ ok:true, alreadyRemoved:true })
        }
      }
      return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    }
    if (file.category === 'design_revision_snapshot') return NextResponse.json({ error: 'Saved revision attachments are immutable.' }, { status: 409 })
    if (file.design_id) {
      const expectedRevision = Number(requestUrl.searchParams.get('revision'))
      if (!Number.isInteger(expectedRevision)) return NextResponse.json({ error: 'Reload the design before removing this attachment.' }, { status:409 })
      const design = await getPlannerDesign(file.design_id)
      if (!design || Number(design.revision || 1) !== expectedRevision) return NextResponse.json({ error: 'This design changed after you opened it. Reload and review the latest revision before removing the attachment.' }, { status:409 })
      const { url, key } = configuration()
      const revisionAssets = await snapshotPlannerDesignAssets(file.design_id, expectedRevision, access.session.email)
      let committed
      try {
        committed = await commitPlannerDesignAttachmentChange({
          designId: file.design_id,
          expectedRevision,
          operation: 'delete',
          snapshot: buildPlannerDesignRevisionSnapshot(design, expectedRevision, revisionAssets.assets),
          fileId: id,
        })
      } catch (error) {
        if (error instanceof PlannerMutationOutcomeUnknownError) {
          // The detached file row may become visible after this request times
          // out. Keep both source and revision bytes on unknown outcome.
          return NextResponse.json({ error: 'The removal may have completed, but its response was not confirmed. Reload the design before retrying.' }, { status:503 })
        }
        await revisionAssets.cleanup()
        throw error
      }
      if (!committed.committed) {
        await revisionAssets.cleanup()
        return NextResponse.json({ error: 'This design changed after you opened it. Reload and review the latest revision before removing the attachment.' }, { status:409 })
      }
      // Keep the source object until the transactional metadata/revision change
      // is durable. A storage cleanup failure only leaves an unreferenced private object.
      const removed = await fetch(`${url}/storage/v1/object/luxor-planner-files/${file.storage_path}`, { method:'DELETE', headers:{apikey:key,Authorization:`Bearer ${key}`}, cache:'no-store' }).catch(() => null)
      if (removed && !removed.ok && removed.status !== 404) console.error('Planner attachment detached; private object cleanup remains pending.')
      return NextResponse.json({ ok: true })
    }
    const { url, key } = configuration()
    const stored = await fetch(`${url}/storage/v1/object/luxor-planner-files/${file.storage_path}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
    if (!stored.ok && stored.status !== 404) return NextResponse.json({ error: 'File could not be removed from private storage.' }, { status: 502 })
    await supabaseRestStrict<unknown>(`luxor_planner_files?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    return NextResponse.json({ ok: true })
  } catch (error) { return responseError(error) }
}
