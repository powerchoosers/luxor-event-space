import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  CUSTOM_WORKFLOW_AUTHORING_ENABLED,
  createCustomWorkflow,
  CustomWorkflowServiceError,
  listCustomWorkflows,
  requireCustomWorkflowOperator,
} from '@/lib/luxorCustomWorkflowsServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    await requireCustomWorkflowOperator(session.email)
    if (!CUSTOM_WORKFLOW_AUTHORING_ENABLED) {
      return NextResponse.json({ enabled: false, workflows: [], unavailableReason: 'Custom workflow storage and runtime validation are still closed.' }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ enabled: true, workflows: await listCustomWorkflows(session.email) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serviceError(error)
  }
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const payload = await request.json() as { name?: unknown; definition?: unknown }
    const workflow = await createCustomWorkflow({ name: payload.name, definition: payload.definition, actorEmail: session.email })
    return NextResponse.json({ workflow }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return serviceError(error)
  }
}

function serviceError(error: unknown) {
  const status = error instanceof CustomWorkflowServiceError ? error.status : 500
  const message = error instanceof Error ? error.message : 'Custom workflow request failed.'
  return NextResponse.json({ error: message }, { status })
}
