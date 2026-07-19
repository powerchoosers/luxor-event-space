import { NextResponse } from 'next/server'
import { getSelectedLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const phoneNumber = await getSelectedLuxorPhoneNumber()
    return NextResponse.json({ phoneNumber }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ phoneNumber: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
