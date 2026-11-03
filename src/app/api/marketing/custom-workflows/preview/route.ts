import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { CustomWorkflowServiceError, previewCustomWorkflowEmail, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import type { CustomWorkflowEmailSettings } from '@/lib/luxorCustomWorkflowDefinition'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    const payload = await request.json() as { step?: unknown; emailSettings?: CustomWorkflowEmailSettings }
    if (!payload.step || typeof payload.step !== 'object' || Array.isArray(payload.step)) {
      return NextResponse.json({ error: 'Choose an email step to preview.' }, { status: 400 })
    }
    return NextResponse.json({ html: await previewCustomWorkflowEmail(payload.step as never, payload.emailSettings, session.email), simulated: true, sent: false })
  } catch (error) {
    const status = error instanceof CustomWorkflowServiceError ? error.status : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The preview could not be rendered.' }, { status })
  }
}
