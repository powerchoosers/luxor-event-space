import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { CustomWorkflowDefinition } from '@/lib/luxorCustomWorkflowDefinition'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 25
const STATUSES = ['active', 'paused', 'held', 'completed', 'stopped'] as const
type Enrollment = { id: string; inquiry_id: string; workflow_version_id: string; status: typeof STATUSES[number]; current_step_id: string | null; next_run_at: string | null; started_at: string; stop_reason: string | null; last_error: string | null }

export async function GET(request: NextRequest, context: { params: Promise<{ workflowId: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'leads')) throw new CustomWorkflowServiceError('Lead access is required.', 403)
    const { workflowId } = await context.params
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workflowId)) return NextResponse.json({ error: 'Invalid workflow.' }, { status: 400 })
    const rawPage = request.nextUrl.searchParams.get('page') || '1'
    if (!/^[1-9]\d{0,5}$/.test(rawPage)) return NextResponse.json({ error: 'Invalid page.' }, { status: 400 })
    const page = Number(rawPage)
    const id = encodeURIComponent(workflowId)
    const [workflow] = await supabaseRestStrict<Array<{ id: string }>>(`luxor_custom_workflows?select=id&id=eq.${id}&limit=1`)
    if (!workflow) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 })
    const base = `luxor_custom_workflow_enrollments?workflow_id=eq.${id}`
    const [rows, counts] = await Promise.all([
      supabaseRestStrict<Enrollment[]>(`${base}&select=id,inquiry_id,workflow_version_id,status,current_step_id,next_run_at,started_at,stop_reason,last_error&order=started_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
      Promise.all(STATUSES.map((status) => supabaseRestCount(`${base}&status=eq.${status}&select=id`))),
    ])
    const inquiryIds = [...new Set(rows.map((row) => row.inquiry_id))]
    const versionIds = [...new Set(rows.map((row) => row.workflow_version_id))]
    const [inquiries, versions] = await Promise.all([
      inquiryIds.length ? supabaseRestStrict<Array<{ id: string; full_name: string | null; email: string | null }>>(`luxor_inquiries?select=id,full_name,email&id=in.(${inquiryIds.map(encodeURIComponent).join(',')})`) : [],
      versionIds.length ? supabaseRestStrict<Array<{ id: string; definition: CustomWorkflowDefinition }>>(`luxor_custom_workflow_versions?select=id,definition&workflow_id=eq.${id}&id=in.(${versionIds.map(encodeURIComponent).join(',')})`) : [],
    ])
    const contacts = rows.map((row) => {
      const inquiry = inquiries.find((item) => item.id === row.inquiry_id)
      const version = versions.find((item) => item.id === row.workflow_version_id)
      const step = version?.definition.steps.find((item) => item.id === row.current_step_id)
      return { ...row, name: inquiry?.full_name || null, email: inquiry?.email || null, stepName: step?.name || null }
    })
    return NextResponse.json({ contacts, counts: Object.fromEntries(STATUSES.map((status, index) => [status, counts[index]])), page, pageSize: PAGE_SIZE }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof CustomWorkflowServiceError ? error.message : 'Workflow contacts could not be loaded.' }, { status: error instanceof CustomWorkflowServiceError ? error.status : 500 })
  }
}
