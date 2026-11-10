import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { RECEIPT_EMAIL_DEFAULTS } from '@/lib/luxorInquiryEmailCopy'
import { readReceiptEmailCopy, saveReceiptEmailCopy, type ReceiptEmailKey } from '@/lib/luxorReceiptEmailCopyServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
function receiptKey(request: NextRequest): ReceiptEmailKey {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== 'tour_request_received' && key !== 'newsletter_confirmation') throw new CustomWorkflowServiceError('Unknown receipt.', 400)
  return key
}
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'emails')) throw new CustomWorkflowServiceError('Emails permission is required.', 403)
  return session.email
}
function errorResponse(error: unknown) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
  if (error instanceof Error && /^(Enter |Unknown inquiry|Use only|subject must|preview must|title must|greeting must|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  return NextResponse.json({ error: 'Receipt email settings are unavailable.' }, { status: 500, headers })
}
export async function GET(request: NextRequest) {
  try { await authorize(); const key = receiptKey(request); const { setting, installed } = await readReceiptEmailCopy(key); return NextResponse.json({ setting, installed, canEdit: installed && canControlLiveLuxorAutomations(), defaultCopy: RECEIPT_EMAIL_DEFAULTS[key] }, { headers }) }
  catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize(); const key = receiptKey(request)
    if (!canControlLiveLuxorAutomations()) throw new CustomWorkflowServiceError('Live automation editing is unavailable in this preview.', 409)
    const input = await request.json() as { copy?: unknown; revision?: unknown }
    if (input.copy === undefined) return NextResponse.json({ error: 'Select copy or restore the default.' }, { status: 400, headers })
    return NextResponse.json({ setting: await saveReceiptEmailCopy(key, input.copy, input.revision, actor) }, { headers })
  } catch (error) { return errorResponse(error) }
}
