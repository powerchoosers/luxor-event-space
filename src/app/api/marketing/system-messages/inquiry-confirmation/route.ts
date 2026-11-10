import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { INQUIRY_CONFIRMATION_DEFAULT, renderInquiryConfirmation } from '@/lib/luxorSystemMessageTemplates'
import { readInquiryConfirmationTemplate, saveInquiryConfirmationTemplate } from '@/lib/luxorSystemMessageTemplatesServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'messages')) throw new CustomWorkflowServiceError('Messages permission is required.', 403)
  return session.email
}
function errorResponse(error: unknown, validation = false) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (validation && error instanceof Error && /^(Enter the inquiry|Keep the message|Use only|Invalid restore|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  return NextResponse.json({ error: 'Message settings are unavailable.' }, { status: 500, headers })
}
export async function GET() {
  try {
    await authorize()
    const { template, installed } = await readInquiryConfirmationTemplate()
    return NextResponse.json({
      template,
      installed,
      canEdit: installed && canControlLiveLuxorAutomations(),
      defaultBody: INQUIRY_CONFIRMATION_DEFAULT,
      preview: renderInquiryConfirmation(template.body_template, {
        fullName: 'Sarah Jenkins',
        eventType: 'Wedding Reception',
        guestCount: 150,
        targetDate: '2026-10-24',
      }),
    }, { headers })
  } catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) throw new CustomWorkflowServiceError('Live automation editing is unavailable in this preview.', 409)
    const input = await request.json() as { body?: unknown; revision?: unknown; restoreDefault?: unknown }
    if (input.restoreDefault !== undefined && typeof input.restoreDefault !== 'boolean') throw new Error('Invalid restore selection.')
    const template = await saveInquiryConfirmationTemplate(input.restoreDefault === true ? INQUIRY_CONFIRMATION_DEFAULT : input.body, input.revision, actor)
    return NextResponse.json({ template }, { headers })
  } catch (error) {
    if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
    return errorResponse(error, true)
  }
}
