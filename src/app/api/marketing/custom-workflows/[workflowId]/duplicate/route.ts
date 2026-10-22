import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { CustomWorkflowServiceError, duplicateCustomWorkflow } from '@/lib/luxorCustomWorkflowsServer'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ workflowId: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const { workflowId } = await context.params
    const workflow = await duplicateCustomWorkflow(workflowId, session.email)
    return NextResponse.json({ workflow }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const status = error instanceof CustomWorkflowServiceError ? error.status : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The workflow could not be duplicated.' }, { status })
  }
}
