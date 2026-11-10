import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { getLuxorFollowUpSetup, updateLuxorFollowUpTemplate } from '@/lib/luxorFollowUpsServer'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function PATCH(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    if (!canControlLiveLuxorAutomations()) return NextResponse.json({ error: 'Step settings cannot change live automation from a local preview.' }, { status: 409 })
    const input = await request.json() as { templateId?: unknown; expectedUpdatedAt?: unknown; delayDays?: unknown; name?: unknown; notes?: unknown }
    if (typeof input.templateId !== 'string' || !UUID.test(input.templateId) || typeof input.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(input.expectedUpdatedAt))) return NextResponse.json({ error: 'Reload the step before saving.' }, { status: 400 })
    if (!Number.isInteger(input.delayDays) || Number(input.delayDays) < 0 || Number(input.delayDays) > 365) return NextResponse.json({ error: 'Timing must be a whole number of days from 0 to 365.' }, { status: 400 })
    const { templates } = await getLuxorFollowUpSetup()
    const template = templates.find((item) => item.id === input.templateId)
    if (!template || template.automation_key !== 'brochure_lead' || template.uses_existing_delivery || !['email', 'phone'].includes(template.channel)) return NextResponse.json({ error: 'This step cannot use these settings.' }, { status: 400 })
    const updates: Record<string, unknown> = { delay_days: input.delayDays }
    if (template.channel === 'phone') {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 500 || typeof input.notes !== 'string' || input.notes.length > 12000) return NextResponse.json({ error: 'Enter a task title and valid task notes.' }, { status: 400 })
      updates.name = input.name.trim()
      updates.body = input.notes.trim() || null
    } else if (input.name !== undefined || input.notes !== undefined) {
      return NextResponse.json({ error: 'Edit email content in the email editor.' }, { status: 400 })
    }
    const saved = await updateLuxorFollowUpTemplate(template.id, updates, input.expectedUpdatedAt)
    return NextResponse.json({ template: saved }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    if (error instanceof Error && /changed after it was opened/i.test(error.message)) return NextResponse.json({ error: 'This step changed. Reload before saving.' }, { status: 409 })
    return NextResponse.json({ error: 'Step settings could not be saved.' }, { status: 500 })
  }
}
