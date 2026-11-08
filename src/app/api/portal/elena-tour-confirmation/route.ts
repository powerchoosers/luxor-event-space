import { NextResponse } from 'next/server'

/** Fail closed until a durable closure is enforced across schedule publishers. */
export async function POST() {
  return NextResponse.json({ error: 'Tour availability changes are unavailable in Elena. Review availability in Calendar; schedule updates may reopen times.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
