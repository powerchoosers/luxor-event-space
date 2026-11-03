import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createCustomWorkflow, CustomWorkflowServiceError, getCustomWorkflow, getCustomWorkflowFeatureStatus, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { PREBUILT_WORKFLOWS } from '@/lib/luxorPrebuiltWorkflows'
import { cloneCustomWorkflowDefinition, createNewContactFollowUpDefinition } from '@/lib/luxorCustomWorkflowDefinition'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    const payload = await request.json() as { workflowId?: unknown; inquiryIds?: unknown }
    if (typeof payload.workflowId !== 'string' || !payload.workflowId.trim()) return NextResponse.json({ error: 'Choose a workflow.' }, { status: 400 })
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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.workflowId)) return NextResponse.json({ error: 'Choose a saved workflow.' }, { status: 400 })
    if (!Array.isArray(payload.inquiryIds) || !payload.inquiryIds.length || payload.inquiryIds.length > 100 || payload.inquiryIds.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) return NextResponse.json({ error: 'Select between 1 and 100 valid leads.' }, { status: 400 })
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
    const message = error instanceof Error ? error.message : 'Could not enroll leads in workflow.'
    const status = error instanceof CustomWorkflowServiceError ? error.status
      : error instanceof SyntaxError ? 400
      : /marketing operator access/i.test(message) ? 403
      : /only an active workflow|execution is disabled|version is incomplete|trigger is not connected/i.test(message) ? 409
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
