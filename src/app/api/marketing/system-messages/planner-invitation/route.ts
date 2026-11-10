import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { PLANNER_INVITATION_DEFAULT } from '@/lib/luxorPlannerInvitationCopy'
import { readPlannerInvitationSetting, savePlannerInvitationSetting } from '@/lib/luxorPlannerInvitationCopyServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || member.role !== 'owner' || !memberCan(member, 'emails') || !memberCan(member, 'planner')) throw new CustomWorkflowServiceError('Owner, email and planner access are required.', 403)
  return session.email
}
function errorResponse(error: unknown) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
  if (error instanceof Error && /^(Enter |Unknown email|Use only|subject must|greeting must|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  return NextResponse.json({ error: 'Planner invitation settings are unavailable.' }, { status: 500, headers })
}
export async function GET() {
  try { await authorize(); const { setting, installed } = await readPlannerInvitationSetting(); return NextResponse.json({ setting, installed, canEdit: installed && canControlLiveLuxorAutomations(), starter: PLANNER_INVITATION_DEFAULT }, { headers }) }
  catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) throw new CustomWorkflowServiceError('Live automation editing is unavailable in this preview.', 409)
    const input = await request.json() as { copy?: unknown; revision?: unknown }
    if (input.copy === undefined) return NextResponse.json({ error: 'Select copy or restore the default.' }, { status: 400, headers })
    return NextResponse.json({ setting: await savePlannerInvitationSetting(input.copy, input.revision, actor) }, { headers })
  } catch (error) { return errorResponse(error) }
}
