import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listLuxorCalendarReviews, reviewLuxorCalendarReply } from '@/lib/luxorCalendarReviewServer'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401, headers })
  const value = new URL(request.url).searchParams.get('page') ?? '0'
  if (!/^\d{1,6}$/.test(value) || Number(value) > 100_000) return NextResponse.json({ error: 'Invalid review page.' }, { status: 400, headers })
  try { return NextResponse.json(await listLuxorCalendarReviews(Number(value)), { headers }) }
  catch { return NextResponse.json({ error: 'Calendar replies are unavailable. Refresh to try again.' }, { status: 503, headers }) }
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401, headers })
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403, headers })
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return NextResponse.json({ error: 'JSON request required.' }, { status: 415, headers })
  const text = await request.text()
  if (Buffer.byteLength(text) > 4096) return NextResponse.json({ error: 'Request too large.' }, { status: 413, headers })
  let body: Record<string, unknown>
  try {
    body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid review')
  } catch { return NextResponse.json({ error: 'Invalid review.' }, { status: 400, headers }) }
  if (typeof body.responseId !== 'string' || !uuid.test(body.responseId)
    || !Number.isInteger(body.expectedSequence) || Number(body.expectedSequence) < 0 || Number(body.expectedSequence) > 2147483647
    || (body.decision !== 'approve' && body.decision !== 'dismiss')
    || body.confirm !== 'review-calendar-reply'
    || typeof body.note !== 'string' || !body.note.trim() || body.note.length > 500) {
    return NextResponse.json({ error: 'Confirm the reply and add a review note.' }, { status: 400, headers })
  }
  try {
    await reviewLuxorCalendarReply({ responseId: body.responseId, expectedSequence: Number(body.expectedSequence), decision: body.decision, note: body.note.trim() }, session.email)
    return NextResponse.json({ saved: true }, { headers })
  } catch {
    return NextResponse.json({ error: 'The reply may have changed or already been reviewed. Refresh before deciding again.' }, { status: 409, headers })
  }
}
