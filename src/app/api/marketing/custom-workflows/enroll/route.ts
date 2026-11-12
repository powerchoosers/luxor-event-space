import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession, getVerifiedLuxorPortalSession, isAuthorizedLuxorPortalEmail } from '@/lib/luxorPortalAuth'
import { createCustomWorkflow, CustomWorkflowServiceError, getCustomWorkflow, getCustomWorkflowFeatureStatus, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { supabaseRest, supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import { PREBUILT_WORKFLOWS } from '@/lib/luxorPrebuiltWorkflows'
import { cloneCustomWorkflowDefinition, createNewContactFollowUpDefinition } from '@/lib/luxorCustomWorkflowDefinition'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    const payload = await request.json() as { workflowId?: unknown; inquiryIds?: unknown; requestId?: unknown }
    if (typeof payload.workflowId !== 'string' || !payload.workflowId.trim()) return NextResponse.json({ error: 'Choose a workflow.', committed: false }, { status: 400 })
    const starter = PREBUILT_WORKFLOWS.find((workflow) => workflow.id === payload.workflowId)
    if (starter) {
      // Starters are editable suggestions, not approved live automation. Never
      // create their tasks early or imply that emails have been scheduled.
      const definition = cloneCustomWorkflowDefinition(starter.definition)
      const receipt = createNewContactFollowUpDefinition().steps[0]
      definition.steps = definition.steps.map((step) => step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment' ? { ...receipt } : step)
      const workflow = await createCustomWorkflow({ name: starter.name, definition, actorEmail: session.email })
      return NextResponse.json({ success: true, draftCreated: true, workflow: { id: workflow.id, name: workflow.name }, workflowName: workflow.name, enrolledCount: 0, tasksCreated: 0, message: 'Draft created. Review and activate it before enrolling leads.' }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.workflowId)) return NextResponse.json({ error: 'Choose a saved workflow.', committed: false }, { status: 400 })
    if (!Array.isArray(payload.inquiryIds) || !payload.inquiryIds.length || payload.inquiryIds.length > 100 || payload.inquiryIds.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) return NextResponse.json({ error: 'Select between 1 and 100 valid leads.', committed: false }, { status: 400 })
    if (payload.requestId !== undefined && process.env.LUXOR_CALL_RESOLUTION_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Atomic enrollment is not available yet. Any previous request remains unconfirmed.' }, { status: 409 })
    }
    if (process.env.LUXOR_CALL_RESOLUTION_ENABLED === 'true') {
      const verified = await getVerifiedLuxorPortalSession()
      if (!verified || verified.email !== session.email || !isAuthorizedLuxorPortalEmail(session.email)
        || request.headers.get('origin') !== request.nextUrl.origin
        || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return NextResponse.json({ error: 'An authorized same-origin staff session is required.', committed: false }, { status: 403 })
      }
      if (typeof payload.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId)) {
        return NextResponse.json({ error: 'A stable enrollment request ID is required.', committed: false }, { status: 400 })
      }
      const requestId = payload.requestId.toLowerCase()
      const ids = [...new Set((payload.inquiryIds as string[]).map(id => id.toLowerCase()))].sort()
      const candidateFeatures = await getCustomWorkflowFeatureStatus(session.email)
      const result = await supabaseRestStrict<{ status?: string; requestId?: string; enrolled_count?: number; already_enrolled_count?: number; skipped_count?: number }>('rpc/luxor_enroll_workflow_with_resolution', {
        method: 'POST', body: JSON.stringify({ p_request_id: requestId, p_workflow_id: payload.workflowId.toLowerCase(), p_inquiry_ids: ids, p_actor_email: session.email, p_allow_new: candidateFeatures.authoringEnabled === true && candidateFeatures.executionEnabled === true }),
      })
      if (result?.status !== 'completed' || result.requestId !== requestId
        || !Number.isInteger(result.enrolled_count) || result.enrolled_count! < 0
        || !Number.isInteger(result.already_enrolled_count) || result.already_enrolled_count! < 0
        || result.skipped_count !== 0 || result.enrolled_count! + result.already_enrolled_count! !== ids.length) {
        throw new Error('The enrollment result could not be confirmed. Retry the original request.')
      }
      return NextResponse.json({ success: true, requestId: result.requestId, enrolledCount: result.enrolled_count,
        alreadyEnrolledCount: result.already_enrolled_count, skippedCount: 0, tasksCreated: 0 }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const features = await getCustomWorkflowFeatureStatus(session.email)
    if (!features.executionEnabled) return NextResponse.json({ error: 'Workflow execution is disabled. No leads were enrolled.' }, { status: 409 })
    const { workflow } = await getCustomWorkflow(payload.workflowId, session.email)
    if (workflow.status !== 'active' || !workflow.current_version_id) return NextResponse.json({ error: 'Only an active workflow can enroll leads. Review and activate its draft first.' }, { status: 409 })
    const [result] = await supabaseRest<Array<{ enrolled_count: number; already_enrolled_count: number; skipped_count: number }>>('rpc/luxor_custom_workflow_manual_enroll', {
      method: 'POST', body: JSON.stringify({ p_workflow_id: workflow.id, p_inquiry_ids: [...new Set(payload.inquiryIds)], p_actor_email: session.email }),
    })
    if (!result) throw new Error('The enrollment result could not be verified. Reload before trying again.')
    return NextResponse.json({ success: true, workflowName: workflow.name, enrolledCount: result.enrolled_count, alreadyEnrolledCount: result.already_enrolled_count, skippedCount: result.skipped_count, tasksCreated: 0, message: 'Workflow runs were saved. Each step follows the active version, timing, and consent rules.' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (process.env.LUXOR_CALL_RESOLUTION_ENABLED === 'true') {
      if (error instanceof SupabaseRestError && ['22023','40001','55P03','23505','42501','55000','P0001'].includes(error.code || '')) {
        return NextResponse.json({ error: error.message, committed: false }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }
      if (error instanceof CustomWorkflowServiceError || error instanceof SyntaxError) {
        return NextResponse.json({ error: error.message }, { status: error instanceof CustomWorkflowServiceError ? error.status : 400 })
      }
      return NextResponse.json({ error: 'Enrollment could not be confirmed. Retry the original selection safely.' }, { status: 503 })
    }
    const message = error instanceof Error ? error.message : 'Could not enroll leads in workflow.'
    const status = error instanceof CustomWorkflowServiceError ? error.status
      : error instanceof SyntaxError ? 400
      : /marketing operator access/i.test(message) ? 403
      : /only an active workflow|execution is disabled|version is incomplete|trigger is not connected/i.test(message) ? 409
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
