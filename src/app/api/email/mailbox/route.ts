import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { parseLuxorMailboxPage, readLuxorMailboxPage } from '@/lib/luxorMailboxPageServer'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }

/** Read-only POST keeps search terms and starred IDs out of URL/access logs. */
export async function POST(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401, headers })
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403, headers })
  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'JSON required.' }, { status: 415, headers })
  const body = await request.text()
  if (Buffer.byteLength(body) > 65536) return NextResponse.json({ error: 'Mailbox request too large.' }, { status: 413, headers })
  let input
  try { input = parseLuxorMailboxPage(JSON.parse(body)) }
  catch { return NextResponse.json({ error: 'Invalid mailbox page parameters.' }, { status: 400, headers }) }
  try { return NextResponse.json(await readLuxorMailboxPage(input), { headers }) }
  catch { return NextResponse.json({ error: 'The mailbox could not load this page. Please retry.' }, { status: 503, headers }) }
}
