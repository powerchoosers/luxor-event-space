import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { findVisibleLuxorMailMessage, setLuxorMailMessageStar } from '@/lib/luxorMailboxServer'
import { findLuxorSharedMailboxByAddress } from '@/lib/luxorSharedMailboxes'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401, headers })
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Same-origin mailbox changes are required.' }, { status: 403, headers })
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'JSON required.' }, { status: 415, headers })
  }

  const { id } = await params
  if (!/^mail-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Only saved mailbox messages can be starred.' }, { status: 400, headers })
  }

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > 2048) return NextResponse.json({ error: 'Star request is too large.' }, { status: 413, headers })
  let body: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(rawBody)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
  } catch { /* Invalid JSON is handled below. */ }
  if (typeof body?.starred !== 'boolean' || (body.email !== undefined && (typeof body.email !== 'string' || body.email.length > 254))) {
    return NextResponse.json({ error: 'Provide a starred state and an optional shared mailbox.' }, { status: 400, headers })
  }

  const mailboxEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (mailboxEmail) {
    const member = await getLuxorPortalMember(session.email)
    if (!findLuxorSharedMailboxByAddress(mailboxEmail) || !member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json({ error: 'This shared mailbox is restricted to portal admins.' }, { status: 403, headers })
    }
  }

  try {
    const visible = await findVisibleLuxorMailMessage(id, mailboxEmail || undefined)
    if (!visible) return NextResponse.json({ error: 'Mailbox message not found.' }, { status: 404, headers })
    const result = await setLuxorMailMessageStar(session.email, id, body.starred)
    return NextResponse.json(result, { headers })
  } catch {
    return NextResponse.json({ error: 'The message star could not be saved. Please retry.' }, { status: 503, headers })
  }
}
