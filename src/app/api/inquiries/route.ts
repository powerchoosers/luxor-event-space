import { NextRequest, NextResponse } from 'next/server'
import { createLuxorInquiry, listLuxorInquiries, getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      const inquiry = await getLuxorInquiry(id)
      if (!inquiry) {
        return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
      }
      return NextResponse.json(inquiry)
    }

    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 75
    const inquiries = await listLuxorInquiries(limit)
    return NextResponse.json(inquiries)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch inquiries.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'ID required.' }, { status: 400 })
    }

    const updated = await updateLuxorInquiry(id, updates)
    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update inquiry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
