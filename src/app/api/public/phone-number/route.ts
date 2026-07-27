import { NextResponse } from 'next/server'
import { getPublicLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const phoneNumber = await getPublicLuxorPhoneNumber()
    return NextResponse.json({ phoneNumber }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ phoneNumber: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
