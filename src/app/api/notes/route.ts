import { NextRequest, NextResponse } from 'next/server'
import { listNotesByInquiry, createNote } from '@/lib/luxorNotesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const inquiryId = searchParams.get('inquiryId')

    if (!inquiryId) {
      return NextResponse.json({ error: 'Missing inquiryId parameter.' }, { status: 400 })
    }

    const notes = await listNotesByInquiry(inquiryId)
    return NextResponse.json(notes)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch notes.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const body = await request.json()
    const { inquiryId, content, noteType, author } = body

    if (!inquiryId || !content) {
      return NextResponse.json({ error: 'inquiryId and content are required.' }, { status: 400 })
    }

    const note = await createNote(inquiryId, content, noteType, author)
    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create note.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
