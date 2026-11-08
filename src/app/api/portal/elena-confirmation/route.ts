import { NextResponse } from 'next/server'
import { consumeElenaNoteConfirmation } from '@/lib/luxorElenaConfirmationServer'

/** No client-supplied action, SQL, summary, or member identity is accepted. */
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'token')) return NextResponse.json({ error: 'Invalid confirmation.' }, { status: 400 })
  try {
    const result = await consumeElenaNoteConfirmation((body as { token: unknown }).token)
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Confirmation is unavailable, expired, already used, or could not be verified.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
  }
}
