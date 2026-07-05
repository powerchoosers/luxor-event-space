import { NextResponse } from 'next/server'
import { listAvailableLuxorTourSlots } from '@/lib/luxorTourSlotsServer'

export async function GET() {
  try {
    const slots = await listAvailableLuxorTourSlots()
    return NextResponse.json({ slots })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load tour availability.'
    return NextResponse.json({ error: message, slots: [] }, { status: 500 })
  }
}
