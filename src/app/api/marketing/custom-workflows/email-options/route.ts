import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { requireCustomWorkflowOperator, CustomWorkflowServiceError } from '@/lib/luxorCustomWorkflowsServer'
import { getCustomWorkflowEmailOptions } from '@/lib/luxorWorkflowEmailServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    return NextResponse.json(await getCustomWorkflowEmailOptions(session.email), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Email options could not be loaded.' }, { status: error instanceof CustomWorkflowServiceError ? error.status : 500 })
  }
}
