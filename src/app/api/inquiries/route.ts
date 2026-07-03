import { NextResponse } from 'next/server'
import { createLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as LuxorInquiryInput
    const inquiry = await createLuxorInquiry(payload, request.headers.get('user-agent') ?? undefined)

    return NextResponse.json({ inquiry }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit inquiry.'
    const status = message.includes('Missing SUPABASE') ? 500 : 400

    console.error('Luxor inquiry submission failed:', message)
    return NextResponse.json({ error: message }, { status })
  }
}
