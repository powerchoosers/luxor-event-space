import { NextRequest, NextResponse } from 'next/server'
import {
  checkInGrandOpeningGuest,
  checkInGrandOpeningRsvp,
  resolveGrandOpeningContact,
  resolveGrandOpeningInvite,
  searchGrandOpeningRsvps,
} from '@/lib/luxorGrandOpeningRaffleServer'

export const dynamic = 'force-dynamic'

const requestCounts = new Map<string, { count: number; resetsAt: number }>()

export async function GET(request: NextRequest) {
  try {
    assertPublicRateLimit(request)
    const { searchParams } = new URL(request.url)
    const contactName = searchParams.get('contactName')?.trim()
    const contactPhone = searchParams.get('contactPhone')?.trim()
    if (contactName && contactPhone) {
      return NextResponse.json({ contact: await resolveGrandOpeningContact(contactName, contactPhone) })
    }
    const invite = searchParams.get('invite')?.trim()
    if (invite) {
      const rsvp = await resolveGrandOpeningInvite(invite)
      if (!rsvp) return NextResponse.json({ error: 'This private check-in link is not valid.' }, { status: 404 })
      return NextResponse.json({ rsvp })
    }

    const query = searchParams.get('q')?.trim() || ''
    const matches = await searchGrandOpeningRsvps(query, 8)
    const seenNames = new Set<string>()
    const privateNameOnlyMatches = matches
      .filter((match) => {
        const key = match.full_name.trim().toLocaleLowerCase()
        if (seenNames.has(key)) return false
        seenNames.add(key)
        return true
      })
      .map(({ id, full_name, checked_in }) => ({ id, full_name, checked_in }))
    return NextResponse.json({ matches: privateNameOnlyMatches })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to search the guest list.'
    return NextResponse.json({ error: message }, { status: message.includes('Too many') ? 429 : 400 })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertPublicRateLimit(request)
    const body = await request.json()
    const mode = body?.mode === 'guest' ? 'guest' : 'rsvp'

    const attendee = mode === 'guest'
      ? await checkInGrandOpeningGuest({
          fullName: String(body.fullName || ''),
          email: String(body.email || ''),
          phone: String(body.phone || ''),
          invitedByInquiryId: String(body.invitedByInquiryId || ''),
          marketingOptIn: Boolean(body.marketingOptIn),
          checkedInBy: 'self',
        })
      : await checkInGrandOpeningRsvp({
          inquiryId: String(body.inquiryId || ''),
          inviteToken: String(body.inviteToken || ''),
          email: String(body.email || ''),
          phone: String(body.phone || ''),
          marketingOptIn: Boolean(body.marketingOptIn),
          checkedInBy: 'self',
        })

    return NextResponse.json({ attendee: { id: attendee.id, full_name: attendee.full_name } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to complete check-in.'
    return NextResponse.json({ error: message }, { status: message.includes('Too many') ? 429 : 400 })
  }
}

function assertPublicRateLimit(request: NextRequest) {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()
  const current = requestCounts.get(key)
  if (!current || current.resetsAt <= now) {
    requestCounts.set(key, { count: 1, resetsAt: now + 60_000 })
    return
  }
  current.count += 1
  if (current.count > 40) throw new Error('Too many check-in attempts. Please wait a minute and try again.')
}
