import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { CustomWorkflowServiceError, requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'

export const dynamic = 'force-dynamic'
const PAGE_SIZE = 25
const STATUSES = ['active', 'paused', 'completed', 'stopped'] as const
type Inquiry = { id: string; full_name: string | null; email: string | null }
type Enrollment = { id: string; inquiry_id: string; status: typeof STATUSES[number]; started_at: string; ended_reason: string | null; luxor_inquiries: Inquiry }
type Action = { enrollment_id: string; step_key: string; scheduled_at: string; status: string; channel: string }

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    await requireCustomWorkflowOperator(session.email)
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'leads')) throw new CustomWorkflowServiceError('Lead access is required.', 403)
    if (request.nextUrl.searchParams.get('id') !== 'brochure_lead') return NextResponse.json({ error: 'This automation does not have enrollment tracking.' }, { status: 404 })
    const rawPage = request.nextUrl.searchParams.get('page') || '1'
    if (!/^[1-9]\d{0,5}$/.test(rawPage)) return NextResponse.json({ error: 'Invalid page.' }, { status: 400 })
    const page = Number(rawPage)
    const base = 'luxor_follow_up_enrollments?automation_key=eq.brochure_lead&luxor_inquiries.is_test=eq.false'
    const select = 'select=id,inquiry_id,status,started_at,ended_reason,luxor_inquiries!inner(id,full_name,email,is_test)'
    const [enrollments, counts, templates] = await Promise.all([
      supabaseRestStrict<Enrollment[]>(`${base}&${select}&order=started_at.desc,id.desc&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
      Promise.all(STATUSES.map((status) => supabaseRestCount(`${base}&select=id,luxor_inquiries!inner(is_test)&status=eq.${status}`))),
      supabaseRestStrict<Array<{ step_key: string; name: string }>>('luxor_follow_up_templates?select=step_key,name&automation_key=eq.brochure_lead'),
    ])
    const ids = enrollments.map((enrollment) => enrollment.id)
    // Each enrollment has at most nine saved actions; scope this query to the current page.
    const actions = ids.length ? await supabaseRestStrict<Action[]>(`luxor_follow_up_actions?select=enrollment_id,step_key,scheduled_at,status,channel&enrollment_id=in.(${ids.map(encodeURIComponent).join(',')})&status=in.(scheduled,processing,email_queued,task_created,failed)&order=scheduled_at.asc,id.asc&limit=${PAGE_SIZE * 9}`) : []
    const contacts = enrollments.map((enrollment) => {
      const next = actions.find((action) => action.enrollment_id === enrollment.id)
      return { id: enrollment.id, inquiryId: enrollment.inquiry_id, name: enrollment.luxor_inquiries.full_name, email: enrollment.luxor_inquiries.email, status: enrollment.status, startedAt: enrollment.started_at, nextAction: next ? { name: templates.find((template) => template.step_key === next.step_key)?.name || next.step_key.replaceAll('_', ' '), scheduledAt: next.scheduled_at, status: next.status, channel: next.channel } : null }
    })
    return NextResponse.json({ contacts, counts: Object.fromEntries(STATUSES.map((status, index) => [status, counts[index]])), pageSize: PAGE_SIZE }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof CustomWorkflowServiceError ? error.message : 'Automation contacts could not be loaded.' }, { status: error instanceof CustomWorkflowServiceError ? error.status : 500 })
  }
}
