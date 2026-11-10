import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { EVENT_REMINDER_DEFAULT, renderEventReminder } from '@/lib/luxorSystemMessageTemplates'
import { readEventReminderTemplate, saveEventReminderTemplate } from '@/lib/luxorSystemMessageTemplatesServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'messages') || !memberCan(member, 'planner')) throw new CustomWorkflowServiceError('Messages and planner permissions are required.', 403)
  return session.email
}
function errorResponse(error: unknown, validation = false) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (validation && error instanceof Error && /^(Enter the event|Keep the message|Include \{\{event_date\}\}|Use only|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
  return NextResponse.json({ error: 'Message settings are unavailable.' }, { status: 500, headers })
}
export async function GET() {
  try {
    await authorize()
    const { template, installed } = await readEventReminderTemplate()
    return NextResponse.json({ template, installed, canEdit: installed && canControlLiveLuxorAutomations(), defaultBody: EVENT_REMINDER_DEFAULT, preview: renderEventReminder(template.body_template, { name: 'Sample Guest', eventType: 'celebration', timeUntil: 'one week', eventDate: 'October 24, 2026' }) }, { headers })
  } catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) return NextResponse.json({ error: 'Live automation editing is unavailable in this preview.' }, { status: 409, headers })
    const input = await request.json() as { body?: unknown; revision?: unknown; restoreDefault?: unknown }
    if (input.restoreDefault !== undefined && typeof input.restoreDefault !== 'boolean') return NextResponse.json({ error: 'Invalid restore selection.' }, { status: 400, headers })
    const template = await saveEventReminderTemplate(input.restoreDefault === true ? EVENT_REMINDER_DEFAULT : input.body, input.revision, actor)
    return NextResponse.json({ template }, { headers })
  } catch (error) { return errorResponse(error, true) }
}
