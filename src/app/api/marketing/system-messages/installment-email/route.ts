import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { INSTALLMENT_REMINDER_DEFAULTS, INSTALLMENT_REMINDER_KEYS, type InstallmentReminderKey } from '@/lib/luxorInstallmentReminderCopy'
import { readInstallmentReminderSettings, saveInstallmentReminderSetting } from '@/lib/luxorInstallmentReminderCopyServer'
import { areLuxorFinalPaymentRemindersEnabled } from '@/lib/luxorPaymentRemindersServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'emails') || !memberCan(member, 'finances')) throw new CustomWorkflowServiceError('Email and finance access are required.', 403)
  return session.email
}
function errorResponse(error: unknown) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
  if (error instanceof Error && /^(Enter |Unknown reminder|Use only|subject must|title must|greeting must|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  return NextResponse.json({ error: 'Installment reminder settings are unavailable.' }, { status: 500, headers })
}
export async function GET() {
  try {
    await authorize()
    const [{ settings, installed }, remindersEnabled] = await Promise.all([
      readInstallmentReminderSettings(),
      areLuxorFinalPaymentRemindersEnabled().catch(() => null),
    ])
    const schedulingEnabled = process.env.LUXOR_PAYMENT_INSTALLMENT_ALLOCATIONS_READY === 'true' && process.env.LUXOR_PAYMENT_INSTALLMENT_REMINDERS_READY === 'true'
    return NextResponse.json({ settings, installed, canEdit: installed && canControlLiveLuxorAutomations(), defaults: INSTALLMENT_REMINDER_DEFAULTS, remindersEnabled, schedulingEnabled }, { headers })
  } catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) throw new CustomWorkflowServiceError('Live automation editing is unavailable in this preview.', 409)
    const input = await request.json() as { key?: unknown; copy?: unknown; revision?: unknown }
    if (typeof input.key !== 'string' || !INSTALLMENT_REMINDER_KEYS.includes(input.key as InstallmentReminderKey)) return NextResponse.json({ error: 'Unknown reminder.' }, { status: 400, headers })
    if (input.copy === undefined) return NextResponse.json({ error: 'Select copy or restore the default.' }, { status: 400, headers })
    return NextResponse.json({ setting: await saveInstallmentReminderSetting(input.key as InstallmentReminderKey, input.copy, input.revision, actor) }, { headers })
  } catch (error) { return errorResponse(error) }
}
