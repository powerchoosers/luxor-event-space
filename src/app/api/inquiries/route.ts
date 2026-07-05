import { NextRequest, NextResponse } from 'next/server'
import { createLuxorInquiry, listLuxorInquiries, getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { LuxorInquiryInput, LuxorInquiryStatus } from '@/lib/luxorInquiryTypes'

const VALID_INQUIRY_STATUSES: LuxorInquiryStatus[] = [
  'new',
  'contacted',
  'tour_requested',
  'tour_confirmed',
  'proposal_sent',
  'booked',
  'closed_lost',
]

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
    const { id, status, author, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'ID required.' }, { status: 400 })
    }

    const existing = await getLuxorInquiry(id)
    if (!existing) {
      return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
    }

    if (status !== undefined) {
      if (!VALID_INQUIRY_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid inquiry status.' }, { status: 400 })
      }
      updates.status = status
    }

    const updated = await updateLuxorInquiry(id, updates)
    if (!updated) {
      return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
    }

    if (status && status !== existing.status) {
      try {
        await createNote(
          id,
          `Status changed from ${formatStatus(existing.status)} to ${formatStatus(status)}.`,
          'status_change',
          typeof author === 'string' && author.trim() ? author : 'Portal Owner',
        )
      } catch (noteError) {
        console.error('Inquiry status updated, but status note creation failed:', noteError)
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update inquiry.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function formatStatus(status: string) {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
