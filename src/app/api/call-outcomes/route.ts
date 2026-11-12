import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession, getVerifiedLuxorPortalSession, isAuthorizedLuxorPortalEmail } from '@/lib/luxorPortalAuth'
import { requireCustomWorkflowOperator, CustomWorkflowServiceError } from '@/lib/luxorCustomWorkflowsServer'
import { SupabaseRestError, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { parseCallResolutionInput, isCallResolutionResult } from '@/lib/luxorCallResolution'

const headers = { 'Cache-Control': 'no-store' }

export async function POST(request: NextRequest) {
  const verified = await getVerifiedLuxorPortalSession()
  const session = verified ? await getLuxorPortalSession() : null
  if (!verified || !session || verified.email !== session.email || !isAuthorizedLuxorPortalEmail(session.email)) {
    return NextResponse.json({ error: 'An authorized staff session is required.' }, { status: 401, headers })
  }
  if (request.headers.get('origin') !== request.nextUrl.origin
    || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers })
  }
  // Local candidate only until the exact database transaction and its producer
  // coordination have passed review and the production rollout is approved.
  if (process.env.LUXOR_CALL_RESOLUTION_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Call follow-up changes are unavailable. Preserve any unconfirmed save and check the lead history before trying again.', code: 'disabled' }, { status: 409, headers })
  }
  const input = parseCallResolutionInput(await request.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'Choose a valid call outcome and next step, including a future time or nurture workflow when needed.', committed: false }, { status: 400, headers })
  try {
    // The database also checks the actor and workflow eligibility. Never trust
    // an actor, permission, status, or workflow version supplied by the browser.
    if (input.nextStep === 'nurture') await requireCustomWorkflowOperator(session.email)
    const result = await supabaseRestStrict<unknown>('rpc/luxor_resolve_call_outcome', {
      method: 'POST', body: JSON.stringify({
        p_request_id: input.requestId, p_inquiry_id: input.inquiryId, p_task_id: input.taskId,
        p_outcome: input.outcome, p_next_step: input.nextStep, p_note: input.note,
        p_due_at: input.dueAt, p_channel: input.channel, p_nurture_workflow_id: input.nurtureWorkflowId,
        p_actor: session.email,
      }),
    })
    if (!isCallResolutionResult(result, input)) throw new Error('Unconfirmed transaction result')
    return NextResponse.json(result, { headers })
  } catch (error) {
    if (error instanceof CustomWorkflowServiceError) {
      return NextResponse.json({ error: error.message, committed: false }, { status: error.status, headers })
    }
    // These SQL errors roll back the complete transaction. A lost connection or
    // malformed result is different: do not promise nothing was saved or fall back.
    if (error instanceof SupabaseRestError && ['22023', '40001', '55P03', '23505', 'P0001'].includes(error.code || '')) {
      return NextResponse.json({ error: 'The task or workflow changed, or another action is in progress. Refresh and review before saving again.', code: 'resolution_conflict', committed: false }, { status: 409, headers })
    }
    return NextResponse.json({ error: 'The saved result could not be confirmed. Check the lead timeline before retrying.', code: 'outcome_unconfirmed' }, { status: 503, headers })
  }
}
