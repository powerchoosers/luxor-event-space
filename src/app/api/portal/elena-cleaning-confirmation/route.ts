import { NextResponse } from 'next/server'
import { consumeElenaCleaningCompletion } from '@/lib/luxorElenaCleaningConfirmationServer'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'token')) return NextResponse.json({ error: 'Invalid confirmation.' }, { status: 400 })
  try {
    const result = await consumeElenaCleaningCompletion((body as { token: unknown }).token)
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'The result could not be verified. Check the cleaning log before trying again.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
  }
}
