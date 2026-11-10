import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { canControlLiveLuxorAutomations } from '@/lib/luxorAutomationEnvironment'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { INVOICE_REMINDER_DEFAULTS, type InvoiceReminderTemplateKey } from '@/lib/luxorSystemMessageTemplates'
import { readInvoiceReminderTemplate, saveInvoiceReminderTemplate } from '@/lib/luxorSystemMessageTemplatesServer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
function isKey(value: unknown): value is InvoiceReminderTemplateKey { return value === 'invoice_due_reminder' || value === 'invoice_overdue_reminder' || value === 'invoice_payment_request' }
async function authorize() {
  const session = await getLuxorPortalSession()
  if (!session) throw new CustomWorkflowServiceError('Portal login required.', 401)
  await requireCustomWorkflowOperator(session.email)
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'messages') || !memberCan(member, 'finances')) throw new CustomWorkflowServiceError('Messages and finances permissions are required.', 403)
  return session.email
}
function errorResponse(error: unknown, validation = false) {
  if (error instanceof CustomWorkflowServiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
  if (validation && error instanceof Error && /^(Enter the invoice|Keep the message|Include \{\{amount\}\}|Use only|Use \{\{payment_url\}\}|Reload the message)/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400, headers })
  if (error instanceof Error && /changed\. Reload/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409, headers })
  return NextResponse.json({ error: 'Message settings are unavailable.' }, { status: 500, headers })
}
export async function GET(request: NextRequest) {
  try {
    await authorize()
    const key = request.nextUrl.searchParams.get('key')
    if (!isKey(key)) return NextResponse.json({ error: 'Unknown invoice reminder.' }, { status: 400, headers })
    const { template, installed } = await readInvoiceReminderTemplate(key)
    return NextResponse.json({ template, installed, canEdit: installed && canControlLiveLuxorAutomations(), defaultBody: INVOICE_REMINDER_DEFAULTS[key] }, { headers })
  } catch (error) { return errorResponse(error) }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await authorize()
    if (!canControlLiveLuxorAutomations()) return NextResponse.json({ error: 'Live automation editing is unavailable in this preview.' }, { status: 409, headers })
    const input = await request.json() as { key?: unknown; body?: unknown; revision?: unknown; restoreDefault?: unknown }
    if (!isKey(input.key) || (input.restoreDefault !== undefined && typeof input.restoreDefault !== 'boolean')) return NextResponse.json({ error: 'Invalid reminder selection.' }, { status: 400, headers })
    const template = await saveInvoiceReminderTemplate(input.key, input.restoreDefault === true ? INVOICE_REMINDER_DEFAULTS[input.key] : input.body, input.revision, actor)
    return NextResponse.json({ template }, { headers })
  } catch (error) { return errorResponse(error, true) }
}
