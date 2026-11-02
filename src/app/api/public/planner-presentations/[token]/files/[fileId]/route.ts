import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { findPresentationByToken, getPresentationFile, presentationIsActive, verifyPresentationSession } from '@/lib/luxorPlannerSharingServer'

type Context = { params: Promise<{ token: string; fileId: string }> }
export async function GET(_request: NextRequest, { params }: Context) {
  const { token, fileId } = await params
  const presentation = await findPresentationByToken(token)
  if (!presentation || !presentationIsActive(presentation)) return new NextResponse('Unavailable', { status: 410, headers: { 'Cache-Control': 'no-store' } })
  const cookie = (await cookies()).get(`luxor_planner_verified_${presentation.id}`)?.value
  if (!verifyPresentationSession(cookie, presentation.id, presentation.token_hash)) return new NextResponse('Verification required', { status: 401, headers: { 'Cache-Control': 'no-store' } })
  const file = await getPresentationFile(presentation.id, fileId)
  if (!file) return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return new NextResponse('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  const object = await fetch(`${url.replace(/\/$/, '')}/storage/v1/object/luxor-planner-files/${file.storage_path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
  if (!object.ok) return new NextResponse('Unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  return new NextResponse(await object.arrayBuffer(), { headers: { 'Content-Type': file.content_type, 'Content-Length': String(file.size_bytes), 'Content-Disposition': `inline; filename="${file.file_name.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
