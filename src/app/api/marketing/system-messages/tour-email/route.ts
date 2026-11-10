import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { TOUR_EMAIL_NOTICE_KEYS, type TourEmailNoticeKey } from '@/lib/luxorTourEmailCopy'
import { readTourEmailCopySettings, saveTourEmailCopySetting } from '@/lib/luxorTourEmailCopyServer'
import { areLuxorTourNotificationsEnabled } from '@/lib/luxorTourNotificationsServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'emails') || !memberCan(member, 'calendar')) throw new CustomWorkflowServiceError('Emails and calendar permissions are required.', 403)
  return session.email
}
function errorResponse(error: unknown) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
  if (error instanceof Error && /^(Enter |Unknown tour|Use only|Subject and greeting|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  return NextResponse.json({ error: 'Tour email settings are unavailable.' }, { status: 500, headers })
}
export async function GET() {
  try {
    await authorize()
    const [{ settings, installed }, enabled] = await Promise.all([readTourEmailCopySettings(), areLuxorTourNotificationsEnabled()])
    return NextResponse.json({ settings, installed, enabled, canEdit: installed && canControlLiveLuxorAutomations() }, { headers })
  } catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) return NextResponse.json({ error: 'Live automation editing is unavailable in this preview.' }, { status: 409, headers })
    const input = await request.json() as { key?: unknown; copy?: unknown; revision?: unknown }
    if (typeof input.key !== 'string' || !TOUR_EMAIL_NOTICE_KEYS.includes(input.key as TourEmailNoticeKey) || input.copy === undefined) return NextResponse.json({ error: 'Invalid tour email selection.' }, { status: 400, headers })
    const setting = await saveTourEmailCopySetting(input.key as TourEmailNoticeKey, input.copy, input.revision, actor)
    return NextResponse.json({ setting }, { headers })
  } catch (error) { return errorResponse(error) }
}
