import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { getLuxorUserProfile } from '@/lib/luxorUserProfileServer'
import { generateWorkflowMessage } from '@/lib/luxorWorkflowAiServer'
import { validateCustomWorkflowDefinition, type CustomWorkflowEmailStep, type CustomWorkflowTextStep } from '@/lib/luxorCustomWorkflowDefinition'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    const payload = await request.json() as {
      channel?: unknown; prompt?: unknown; step?: CustomWorkflowEmailStep | CustomWorkflowTextStep
      leadContext?: Record<string, unknown>; senderMode?: unknown; senderEmail?: unknown
    }
    if (payload.channel !== 'email' && payload.channel !== 'text') return NextResponse.json({ error: 'Choose email or text.' }, { status: 400 })
    if (typeof payload.prompt !== 'string' || !payload.prompt.trim() || payload.prompt.length > 6000) return NextResponse.json({ error: 'Enter instructions of 1 to 6000 characters.' }, { status: 400 })
    const defaultStep: CustomWorkflowEmailStep | CustomWorkflowTextStep = payload.channel === 'email'
      ? { id: 'message-preview', type: 'email', mode: 'marketing', name: 'Email sample', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '', emailStyle: 'personal' }
      : { id: 'message-preview', type: 'text', name: 'Text sample', body: '', requiredConsentScope: 'marketing' }
    const step = { ...(payload.step || defaultStep), generationMode: 'ai' as const, aiPrompt: payload.prompt.trim() }
    if (step.type !== payload.channel) return NextResponse.json({ error: 'The selected step does not match the message channel.' }, { status: 400 })
    const issues = validateCustomWorkflowDefinition({ schemaVersion: 1, trigger: 'manual', steps: [step, { id: 'message-preview-end', type: 'end', name: 'End' }] }, { allowIncompleteDraft: true })
    if (issues.length) return NextResponse.json({ error: issues[0].message }, { status: 400 })
    const profile = payload.senderMode === 'elena'
      ? { displayName: 'Elena', roleTitle: 'Luxor Event Space Concierge' }
      : await getLuxorUserProfile(session.email)
    const context = payload.leadContext && typeof payload.leadContext === 'object' && !Array.isArray(payload.leadContext) ? payload.leadContext : {}
    const result = await generateWorkflowMessage(step, context, profile, { preview: true })
    const generated = result.step
    return NextResponse.json(generated.type === 'email'
      ? { subject: generated.subject, previewText: generated.previewText, body: generated.body, ctaText: generated.ctaText, ctaUrl: generated.ctaUrl, emailDocument: generated.emailDocument, source: result.source }
      : { body: generated.body, source: result.source }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Message generation failed.' }, { status: error instanceof CustomWorkflowServiceError ? error.status : 502 })
  }
}
