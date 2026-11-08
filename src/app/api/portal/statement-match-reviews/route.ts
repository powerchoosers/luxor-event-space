import { NextResponse } from 'next/server'

// Fail closed until the database can authenticate and revoke the acting user.
// Do not re-enable this route with a shared service credential and a supplied actor.
function unavailable() {
  return NextResponse.json({ error: 'Recorded match reviews are unavailable. No review was saved.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function GET() { return unavailable() }
export async function POST() { return unavailable() }
