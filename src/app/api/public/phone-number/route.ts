import { NextResponse } from 'next/server'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const phoneNumber = await getActiveLuxorPhoneNumber()
    return NextResponse.json({ phoneNumber }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ phoneNumber: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
