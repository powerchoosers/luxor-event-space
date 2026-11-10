import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { TOUR_TEXT_DEFAULTS, type TourTextTemplateKey } from '@/lib/luxorSystemMessageTemplates'
import { readTourTextTemplate, saveTourTextTemplate } from '@/lib/luxorSystemMessageTemplatesServer'
import { areLuxorTourNotificationsEnabled } from '@/lib/luxorTourNotificationsServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
function isKey(value: unknown): value is TourTextTemplateKey { return value === 'tour_confirmation' || value === 'tour_reminder' }
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'messages') || !memberCan(member, 'calendar')) throw new CustomWorkflowServiceError('Messages and calendar permissions are required.', 403)
  return session.email
}
function errorResponse(error: unknown, validation = false) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (validation && error instanceof Error && /^(Enter the tour|Keep the message|Include \{\{tour_date\}\}|Use only|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
  return NextResponse.json({ error: 'Message settings are unavailable.' }, { status: 500, headers })
}
export async function GET(request: NextRequest) {
  try {
    await authorize()
    const key = request.nextUrl.searchParams.get('key')
    if (!isKey(key)) return NextResponse.json({ error: 'Unknown tour text.' }, { status: 400, headers })
    const [{ template, installed }, enabled] = await Promise.all([readTourTextTemplate(key), areLuxorTourNotificationsEnabled()])
    return NextResponse.json({ template, installed, canEdit: installed && canControlLiveLuxorAutomations(), enabled, defaultBody: TOUR_TEXT_DEFAULTS[key] }, { headers })
  } catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) return NextResponse.json({ error: 'Live automation editing is unavailable in this preview.' }, { status: 409, headers })
    const input = await request.json() as { key?: unknown; body?: unknown; revision?: unknown; restoreDefault?: unknown }
    if (!isKey(input.key) || (input.restoreDefault !== undefined && typeof input.restoreDefault !== 'boolean')) return NextResponse.json({ error: 'Invalid tour text selection.' }, { status: 400, headers })
    const template = await saveTourTextTemplate(input.key, input.restoreDefault === true ? TOUR_TEXT_DEFAULTS[input.key] : input.body, input.revision, actor)
    return NextResponse.json({ template }, { headers })
  } catch (error) { return errorResponse(error, true) }
}
