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
    const { inquiryId, content, noteType, author, taskId } = body
    const allowedTypes = new Set(['note', 'call_log', 'email_log', 'status_change'])

    if (!inquiryId || !content) {
      return NextResponse.json({ error: 'inquiryId and content are required.' }, { status: 400 })
    }
    if (noteType !== undefined && !allowedTypes.has(noteType)) {
      return NextResponse.json({ error: 'Unsupported note type.' }, { status: 400 })
    }
    if (taskId !== undefined && taskId !== null && (typeof taskId !== 'string' || !/^[0-9a-f-]{36}$/i.test(taskId))) {
      return NextResponse.json({ error: 'Invalid task id.' }, { status: 400 })
    }

    const note = await createNote(inquiryId, content, noteType, author, taskId)
    return NextResponse.json(note, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create note.'
    return NextResponse.json({ error: message }, { status: error instanceof Error && error.name === 'LuxorNoteTaskLinkError' ? 400 : 500 })
  }
}
