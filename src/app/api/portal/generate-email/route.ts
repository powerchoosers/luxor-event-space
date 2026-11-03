import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { requireCustomWorkflowOperator, CustomWorkflowServiceError } from '@/lib/luxorCustomWorkflowsServer'
import { generateWorkflowMessage } from '@/lib/luxorWorkflowAiServer'
import { getLuxorUserProfile } from '@/lib/luxorUserProfileServer'
import { normalizeLuxorEmailTheme } from '@/lib/luxorEmailDesignSystem'
import { validateWorkflowEmailDocument } from '@/lib/luxorWorkflowEmailDocument'
import { EMAIL_TEMPLATES, type LuxorEmailDocument } from '@/app/(portal)/portal/marketing/emailTemplates'
import type { CustomWorkflowEmailStep } from '@/lib/luxorCustomWorkflowDefinition'

export async function POST(request: Request) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    const payload = await request.json() as { prompt?: unknown; tone?: unknown; leadContext?: Record<string, unknown>; emailDocument?: unknown }
    if (typeof payload.prompt !== 'string' || !payload.prompt.trim() || payload.prompt.length > 5000) return NextResponse.json({ error: 'Enter email instructions of 1 to 5000 characters.' }, { status: 400 })
    const base = EMAIL_TEMPLATES.find((template) => template.id === 'welcome') || EMAIL_TEMPLATES[0]
    const document = payload.emailDocument || { schemaVersion: 2, subject: '', preheader: '', theme: normalizeLuxorEmailTheme('light'), blocks: base.blocks }
    const documentError = validateWorkflowEmailDocument(document)
    if (documentError) return NextResponse.json({ error: documentError }, { status: 400 })
    const tones: Record<string, string> = { professional: 'clear and professional', urgent: 'direct and timely, without invented scarcity, deadlines or pressure', elegant: 'refined and restrained', friendly: 'warm and conversational' }
    const tone = typeof payload.tone === 'string' ? tones[payload.tone] || tones.friendly : tones.friendly
    const step: CustomWorkflowEmailStep = {
      id: 'builder-email', type: 'email', mode: 'marketing', name: 'Email design', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '',
      emailStyle: 'template', emailDocument: document as LuxorEmailDocument, generationMode: 'ai', aiPrompt: `${payload.prompt.trim()}\nTone: ${tone}. Use one clear CTA. Use {{first_name}}, {{event_type}}, {{guest_count}}, {{target_date}}, {{tour_date}}, or {{tour_time}} only when appropriate. Preserve the existing design only where it serves this request; all copy and block order are editable.`,
    }
    const profile = await getLuxorUserProfile(session.email)
    const result = await generateWorkflowMessage(step, payload.leadContext || {}, profile, { preview: true })
    if (result.step.type !== 'email' || !result.step.emailDocument) throw new Error('Elena returned no editable email document.')
    const generated = result.step.emailDocument
    return NextResponse.json({ ...generated, name: payload.prompt.trim().slice(0, 80), theme: generated.theme.mode, source: result.source }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Email generation failed.' }, { status: error instanceof CustomWorkflowServiceError ? error.status : 502 })
  }
}
