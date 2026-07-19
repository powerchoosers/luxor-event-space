import { NextRequest, NextResponse } from 'next/server'
import { getLuxorCallBySid, listLuxorCalls, updateLuxorCallDetails } from '@/lib/luxorCallsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  const inquiryId = request.nextUrl.searchParams.get('inquiryId')
  const unreadOnly = request.nextUrl.searchParams.get('unreadOnly') === 'true'
  const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '200', 10)

  try {
    const calls = await listLuxorCalls({
      inquiryId,
      unreadOnly,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 200,
    })
    return NextResponse.json(calls, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load call history.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const body = await request.json() as {
      id?: string
      twilioCallSid?: string
      isRead?: boolean
      notes?: string | null
      outcome?: string | null
    }
    let id = body.id
    if (!id && body.twilioCallSid) {
      id = (await getLuxorCallBySid(body.twilioCallSid))?.id
    }
    if (!id) return NextResponse.json({ error: 'Call ID required.' }, { status: 400 })

    const call = await updateLuxorCallDetails(id, {
      isRead: body.isRead,
      notes: body.notes,
      outcome: body.outcome,
    })
    if (!call) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
    return NextResponse.json(call)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update call.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

