/* eslint-disable @typescript-eslint/no-explicit-any -- JSONB snapshots are allowlisted before exposure. */
import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getPlannerBooking } from '@/lib/luxorPlannerServer'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { buildPlannerPresentationInvitation, createPresentationToken, decryptPresentationSecret, encryptPresentationSecret, hashPresentationToken, sanitizePlannerPresentationSnapshot } from '@/lib/luxorPlannerSharingServer'
import { createUniqueLuxorEmailJob } from '@/lib/luxorEmailJobsServer'

type Row = Record<string, any>
const privateHeaders = { 'Cache-Control': 'private, no-store' }
async function owner() {
  const session = await getLuxorPortalSession()
  if (!session) return { response: NextResponse.json({ error: 'Portal sign-in required.' }, { status: 401 }) }
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'planner') || member.role !== 'owner') {
    return { response: NextResponse.json({ error: 'Only the account owner can share a Planner presentation.' }, { status: 403 }) }
  }
  return { session }
}
function storageConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Private Planner storage is not configured.')
  return { url: url.replace(/\/$/, ''), key }
}
async function copyPrivateObject(sourcePath: string, targetPath: string, contentType: string) {
  const { url, key } = storageConfig()
  const source = await fetch(`${url}/storage/v1/object/luxor-planner-files/${sourcePath}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
  if (!source.ok) throw new Error('A selected design image could not be read.')
  const body = new Uint8Array(await source.arrayBuffer())
  const saved = await fetch(`${url}/storage/v1/object/luxor-planner-files/${targetPath}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'false' }, body, cache: 'no-store' })
  if (!saved.ok) throw new Error('A private presentation image could not be copied.')
  return body.byteLength
}
async function removePrivateObjects(paths: string[]) {
  if (!paths.length) return
  const { url, key } = storageConfig()
  await Promise.all(paths.map(path => fetch(`${url}/storage/v1/object/luxor-planner-files/${path}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }).catch(() => undefined)))
}

export async function GET(request: NextRequest) {
  const access = await owner()
  if ('response' in access) return access.response
  const bookingId = new URL(request.url).searchParams.get('bookingId') || ''
  if (!bookingId || !(await getPlannerBooking(bookingId))) return NextResponse.json({ error: 'Confirmed event not found.' }, { status: 404, headers: privateHeaders })
  const rows = await supabaseRestStrict<Row[]>(`luxor_planner_presentations?select=id,design_id,design_revision,recipient_email,expires_at,revoked_at,sent_at,lifecycle_status,client_action,client_note,responded_at,created_at&booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.desc&limit=100`)
  return NextResponse.json({ presentations: rows }, { headers: privateHeaders })
}

export async function POST(request: NextRequest) {
  const access = await owner()
  if ('response' in access) return access.response
  if (Number(request.headers.get('content-length') || 0) > 16_384) return NextResponse.json({ error: 'The presentation request is too large.' }, { status: 413 })
  const body = await request.json().catch(() => null) as Row | null
  const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : ''
  const designId = typeof body?.designId === 'string' ? body.designId : ''
  const presentationId = typeof body?.presentationId === 'string' ? body.presentationId : ''
  const expectedRevision = Number(body?.revision)
  const rawFileIds = Array.isArray(body?.fileIds) ? body.fileIds : []
  if (rawFileIds.length > 20 || rawFileIds.some((x: unknown) => typeof x !== 'string' || x.length > 80)) return NextResponse.json({ error: 'Choose up to 20 valid image attachments.' }, { status: 400 })
  const selectedFileIds = [...new Set(rawFileIds as string[])]
  const days = Number(body?.expiresInDays)
  if (!bookingId || !designId || !/^[0-9a-f-]{36}$/i.test(presentationId) || !Number.isInteger(expectedRevision) || expectedRevision < 1 || selectedFileIds.length > 20 || ![7, 14, 30].includes(days)) return NextResponse.json({ error: 'Choose a design revision, up to 20 images, and an expiry.' }, { status: 400 })
  const booking = await getPlannerBooking(bookingId)
  if (!booking || booking.status !== 'confirmed' || !booking.inquiry_id) return NextResponse.json({ error: 'Choose a confirmed event with a linked inquiry.' }, { status: 409 })
  const revisionBundle = await supabaseRestStrict<Row>('rpc/luxor_planner_get_design_revision_for_share', {
    method: 'POST', body: JSON.stringify({ p_design_id: designId, p_booking_id: bookingId, p_expected_revision: expectedRevision }),
  })
  const design = revisionBundle?.design as Row | undefined
  const full = revisionBundle?.snapshot as Row | undefined
  if (!design || !full || design.id !== designId || design.design_kind !== 'event_concept' || design.booking_id !== bookingId || design.archived_at) return NextResponse.json({ error: 'Choose a saved revision of a design attached to this event.' }, { status: 409 })
  const availableAssets = Array.isArray(full.assets) ? full.assets as Row[] : []
  const selected = availableAssets.filter(asset => selectedFileIds.includes(String(asset.source_file_id)) && ['image/jpeg','image/png','image/webp'].includes(String(asset.content_type)))
  if (selected.length !== selectedFileIds.length) return NextResponse.json({ error: 'Select only image attachments from this exact design revision.' }, { status: 400 })
  const [inquiry] = await supabaseRestStrict<Row[]>(`luxor_inquiries?select=id,email,full_name&id=eq.${encodeURIComponent(booking.inquiry_id)}&limit=1`)
  const recipient = typeof inquiry?.email === 'string' ? inquiry.email.trim() : ''
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return NextResponse.json({ error: 'The event does not have a valid client email address.' }, { status: 409 })
  const requestFingerprint = crypto.createHash('sha256').update(JSON.stringify({ bookingId, designId, revision: expectedRevision, fileIds: [...selectedFileIds].sort(), recipient: recipient.toLowerCase(), expiresInDays: days })).digest('hex')
  const token = createPresentationToken()
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString()
  const preparationClaimId = crypto.randomUUID()
  const storagePaths: string[] = []
  let ownsPreparation = false
  let preparationReady = false
  let reservationAttempted = false
  let invitationQueueAttempted = false
  try {
    reservationAttempted = true
    const reservation = await supabaseRestStrict<Row>('rpc/luxor_planner_begin_presentation', { method:'POST', body:JSON.stringify({
      p_id:presentationId, p_booking_id:bookingId, p_design_id:designId, p_design_revision:expectedRevision,
      p_design_snapshot:sanitizePlannerPresentationSnapshot(full,expectedRevision), p_request_fingerprint:requestFingerprint,
      p_expected_asset_count:selected.length, p_recipient_email:recipient, p_token_hash:hashPresentationToken(token),
      p_token_ciphertext:encryptPresentationSecret(token), p_created_by:access.session.email, p_expires_at:expiresAt, p_claim_id:preparationClaimId,
    }) })
    if (reservation?.state === 'conflict') return NextResponse.json({ error:'This request ID is already bound to a different presentation request.' }, { status:409, headers:privateHeaders })
    if (reservation?.state === 'preparing' && reservation.reserved !== true) {
      const leaseUntil = Date.parse(String(reservation.lease_until || ''))
      const retryAfterSeconds = Math.max(1,Math.min(120,Math.ceil((leaseUntil-Date.now())/1000)||15))
      return NextResponse.json({ id:presentationId, state:'preparing', retryAfterSeconds, message:'The selected images are still being prepared. Retry this same request after the short preparation lease.' }, { status:202, headers:privateHeaders })
    }
    if (!reservation?.presentation) throw new Error('Presentation preparation could not be reserved.')
    const current = reservation.presentation as Row
    if (current.booking_id !== bookingId || current.request_fingerprint !== requestFingerprint || current.revoked_at || Date.parse(current.expires_at) <= Date.now()) return NextResponse.json({ error:'This presentation request is no longer active or does not match.' }, { status:409, headers:privateHeaders })
    if (reservation.reserved === true) {
      ownsPreparation = true
      if (reservation.reclaimed === true && Array.isArray(reservation.abandoned_paths)) await removePrivateObjects(reservation.abandoned_paths as string[])
      for (const asset of selected) {
        const id = crypto.randomUUID()
        const fileName = String(asset.file_name || 'design-image').replace(/[^a-zA-Z0-9 ._-]/g, '_').slice(0, 180)
        const path = `presentations/${presentationId}/${preparationClaimId}/${id}/${encodeURIComponent(fileName)}`
        storagePaths.push(path)
        const size = await copyPrivateObject(String(asset.storage_path), path, String(asset.content_type))
        const registered = await supabaseRestStrict<Row>('rpc/luxor_planner_register_presentation_file', { method:'POST', body:JSON.stringify({p_id:presentationId,p_request_fingerprint:requestFingerprint,p_claim_id:preparationClaimId,p_file:{id,source_file_id:asset.source_file_id,file_name:fileName,content_type:asset.content_type,size_bytes:size,storage_path:path}}) })
        if (!registered?.registered) throw new Error('The presentation preparation lease was lost before its image could be attached.')
      }
      const ready = await supabaseRestStrict<Row>('rpc/luxor_planner_mark_presentation_ready', { method:'POST', body:JSON.stringify({p_id:presentationId,p_request_fingerprint:requestFingerprint,p_claim_id:preparationClaimId}) })
      if (!ready?.ready) throw new Error('Presentation assets could not be confirmed ready.')
      preparationReady = true
    }
    if (!['ready','queued'].includes(String(current.lifecycle_status)) && !preparationReady) return NextResponse.json({ error:'The presentation is not ready to send.' }, { status:409, headers:privateHeaders })
    const tokenToSend = reservation.created === true ? token : decryptPresentationSecret(String(current.token_ciphertext))
    const actualExpiry = String(current.expires_at || expiresAt)
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com'
    const invitation = buildPlannerPresentationInvitation({ name: String(inquiry.full_name || booking.client_name), url: `${base.replace(/\/$/, '')}/planner-review/${tokenToSend}`, expiresAt:actualExpiry })
    invitationQueueAttempted = true
    const emailJob = await createUniqueLuxorEmailJob({ inquiryId: booking.inquiry_id, bookingId, jobType: 'layout_review', recipientEmail: recipient, subject: invitation.subject, body: invitation.body, metadata: { kind: 'planner_presentation_invitation', planner_presentation_id: presentationId }, automationKey: `planner-presentation-invitation:${presentationId}` })
    await supabaseRestStrict<Row[]>(`luxor_planner_presentations?id=eq.${encodeURIComponent(presentationId)}&lifecycle_status=eq.ready`, { method:'PATCH', body:JSON.stringify({invitation_email_job_id:emailJob.id,lifecycle_status:'queued'}) })
    return NextResponse.json({ id:presentationId, expiresAt:actualExpiry, deliveryStatus:emailJob.status }, { status:reservation.reserved===true?201:200, headers:privateHeaders })
  } catch (error) {
    if (ownsPreparation && !preparationReady && !invitationQueueAttempted) {
      const aborted = await supabaseRestStrict<Row>('rpc/luxor_planner_abort_presentation_preparation', { method:'POST', body:JSON.stringify({p_id:presentationId,p_request_fingerprint:requestFingerprint,p_claim_id:preparationClaimId}) }).catch(()=>null)
      if (aborted?.aborted) await removePrivateObjects(storagePaths)
    }
    console.error('Planner presentation creation failed:', error)
    const progressUncertain = invitationQueueAttempted || ownsPreparation || reservationAttempted
    return NextResponse.json({ error: progressUncertain ? 'Presentation progress is being reconciled. Retry this same request shortly.' : 'The private presentation could not be created.' }, { status: progressUncertain ? 503 : 500, headers: privateHeaders })
  }
}

export async function DELETE(request: NextRequest) {
  const access = await owner()
  if ('response' in access) return access.response
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Choose a presentation.' }, { status: 400 })
  const [row] = await supabaseRestStrict<Row[]>(`luxor_planner_presentations?select=id,revoked_at&id=eq.${encodeURIComponent(id)}&limit=1`)
  if (!row) return NextResponse.json({ error: 'Presentation not found.' }, { status: 404 })
  await supabaseRestStrict<unknown>(`luxor_planner_presentations?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ revoked_at: row.revoked_at || new Date().toISOString(), updated_at: new Date().toISOString() }) })
  return NextResponse.json({ ok: true }, { headers: privateHeaders })
}
