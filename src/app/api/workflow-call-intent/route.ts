import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession, getVerifiedLuxorPortalSession, isAuthorizedLuxorPortalEmail } from '@/lib/luxorPortalAuth'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'no-store' }

// This route must remain disabled until the draft RPC has passed full-schema,
// lock-order, role, and real multi-session review and is deliberately installed.
export async function POST(request: NextRequest) {
  const verified = await getVerifiedLuxorPortalSession()
  const session = verified ? await getLuxorPortalSession() : null
  if (!verified || !session || verified.email !== session.email || !isAuthorizedLuxorPortalEmail(session.email)) {
    return NextResponse.json({ error: 'An authorized staff session is required.' }, { status: 401, headers })
  }
  if (request.headers.get('origin') !== request.nextUrl.origin || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers })
  }
  if (process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED !== 'true' || process.env.LUXOR_ATOMIC_CALL_INTENT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Atomic call resolution is disabled.' }, { status: 409, headers })
  }
  try {
    const body = await request.json() as { requestId?: unknown; inquiryId?: unknown; taskId?: unknown; intent?: unknown; outcome?: unknown; note?: unknown }
    if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)
      || typeof body.inquiryId !== 'string' || !UUID.test(body.inquiryId)
      || typeof body.taskId !== 'string' || !UUID.test(body.taskId)
      || (body.intent !== 'stop' && body.intent !== 'nurture')
      || (body.outcome !== 'reached' && body.outcome !== 'no_answer' && body.outcome !== 'voicemail_left')
      || typeof body.note !== 'string' || body.note.length > 500) {
      return NextResponse.json({ error: 'Invalid call resolution.' }, { status: 400, headers })
    }
    const result = await supabaseRestStrict<unknown>('rpc/luxor_complete_call_and_stop_draft', {
      method: 'POST',
      body: JSON.stringify({
        p_request_id: body.requestId, p_inquiry_id: body.inquiryId, p_task_id: body.taskId,
        p_intent: body.intent, p_outcome: body.outcome, p_note: body.note, p_actor: session.email,
      }),
    })
    if (!result || typeof result !== 'object' || !('status' in result) || result.status !== 'stopped'
      || !('intent' in result) || result.intent !== body.intent || !('taskId' in result) || result.taskId !== body.taskId
      || !('noteId' in result) || typeof result.noteId !== 'string' || !UUID.test(result.noteId)) {
      // The RPC may have committed before an unexpected result. Never retry or
      // report a definite failure from this response.
      return NextResponse.json({ error: 'The call outcome could not be confirmed. Refresh and review before retrying.', code: 'outcome_unconfirmed' }, { status: 503, headers })
    }
    return NextResponse.json({ status: 'stopped', intent: body.intent, taskId: body.taskId, noteId: result.noteId }, { headers })
  } catch {
    return NextResponse.json({ error: 'The call outcome could not be confirmed. Refresh and review before retrying.', code: 'outcome_unconfirmed' }, { status: 503, headers })
  }
}
