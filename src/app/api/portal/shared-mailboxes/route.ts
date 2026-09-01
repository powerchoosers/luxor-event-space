import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { LUXOR_SHARED_MAILBOXES } from '@/lib/luxorSharedMailboxes'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getLuxorPortalSession()
  const member = session ? await getLuxorPortalMember(session.email) : null
  if (!member) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  const mailboxes = member.role === 'owner' || member.role === 'admin'
    ? LUXOR_SHARED_MAILBOXES
    : []

  return NextResponse.json({ mailboxes }, { headers: { 'Cache-Control': 'private, no-store' } })
}

