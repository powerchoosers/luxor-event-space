import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { PAYMENT_REQUEST_REMINDER_EDIT_STARTER } from '@/lib/luxorPaymentRequestReminderCopy'
import { readPaymentRequestReminderSetting, savePaymentRequestReminderSetting } from '@/lib/luxorPaymentRequestReminderCopyServer'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'emails') || !memberCan(member, 'finances') || !memberCan(member, 'planner')) throw new CustomWorkflowServiceError('Email, finance and planner access are required.', 403)
  return session.email
}
function errorResponse(error: unknown) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
  if (error instanceof Error && /^(Enter |Unknown reminder|Use only|subject must|title must|greeting must|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  return NextResponse.json({ error: 'Payment request reminder settings are unavailable.' }, { status: 500, headers })
}
export async function GET() {
  try { await authorize(); const { setting, installed } = await readPaymentRequestReminderSetting(); return NextResponse.json({ setting, installed, canEdit: installed && canControlLiveLuxorAutomations(), starter: PAYMENT_REQUEST_REMINDER_EDIT_STARTER }, { headers }) }
  catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) throw new CustomWorkflowServiceError('Live automation editing is unavailable in this preview.', 409)
    const input = await request.json() as { copy?: unknown; revision?: unknown }
    if (input.copy === undefined) return NextResponse.json({ error: 'Select copy or restore the default.' }, { status: 400, headers })
    return NextResponse.json({ setting: await savePaymentRequestReminderSetting(input.copy, input.revision, actor) }, { headers })
  } catch (error) { return errorResponse(error) }
}
