import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  changeCustomWorkflowLifecycle,
  CustomWorkflowServiceError,
  getCustomWorkflow,
  saveCustomWorkflowDraft,
} from '@/lib/luxorCustomWorkflowsServer'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ workflowId: string }> }

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const { workflowId } = await context.params
    return NextResponse.json(await getCustomWorkflow(workflowId, session.email), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serviceError(error)
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const { workflowId } = await context.params
    const payload = await request.json() as { name?: unknown; definition?: unknown; expectedRevision?: unknown; action?: unknown }
    if (payload.action === 'activate' || payload.action === 'pause' || payload.action === 'resume' || payload.action === 'archive') {
      await changeCustomWorkflowLifecycle({ id: workflowId, action: payload.action, actorEmail: session.email })
      return NextResponse.json(await getCustomWorkflow(workflowId, session.email), { headers: { 'Cache-Control': 'no-store' } })
    }
    const workflow = await saveCustomWorkflowDraft({
      id: workflowId,
      name: payload.name,
      definition: payload.definition,
      expectedRevision: payload.expectedRevision,
      actorEmail: session.email,
    })
    return NextResponse.json({ workflow }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serviceError(error)
  }
}

function serviceError(error: unknown) {
  const status = error instanceof CustomWorkflowServiceError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Custom workflow request failed.'
  return NextResponse.json({ error: message }, { status })
}
