import { NextResponse } from 'next/server'
import { getVerifiedLuxorPortalSession, getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { stageDeveloperSupportUpload } from '@/lib/luxorDeveloperSupportAttachmentsServer'

const STAGING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: NO_STORE })
  }

  const [verified, active] = await Promise.all([getVerifiedLuxorPortalSession(), getLuxorPortalSession()])
  if (!verified || !active || verified.email !== active.email || verified.issuedAt !== active.issuedAt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  const member = await getLuxorPortalMember(verified.email)
  if (!member || member.status !== 'active' || member.role !== 'owner') {
    return NextResponse.json({ error: 'Only the Luxor owner can attach developer support files.' }, { status: 403, headers: NO_STORE })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400, headers: NO_STORE })

  const stagingId = String(form.get('stagingId') || '').trim()
  const name = String(form.get('name') || '').trim()
  const type = String(form.get('type') || '').trim()
  const file = form.get('file')

  if (!STAGING_ID_PATTERN.test(stagingId) || !name || name.length > 200) {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400, headers: NO_STORE })
  }
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400, headers: NO_STORE })
  }

  try {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const result = await stageDeveloperSupportUpload(stagingId, name, type || file.type, buffer)
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not upload that file.'
    return NextResponse.json({ error: message }, { status: 400, headers: NO_STORE })
  }
}
