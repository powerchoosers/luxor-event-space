import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { enqueueLuxorTestEmail, getLuxorTestSettings, resetLuxorTestRun, simulateLuxorTestTourChange } from '@/lib/luxorTestLeadServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { luxorMailProvider } from '@/lib/luxorMailConfig'
import { buildLuxorTestEmailTemplate, isLuxorTestEmailCategory } from '@/lib/luxorTestEmailTemplates'

async function authorizedMember() {
  const session = await getLuxorPortalSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  if (!member || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'settings')) return null
  return member
}

export async function GET(request: NextRequest) {
  try {
    if (!await authorizedMember()) return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })
    const settings = await getLuxorTestSettings()
    const [lead] = await supabaseRest<Record<string, unknown>[]>(`luxor_inquiries?select=*&id=eq.${encodeURIComponent('00b264d6-a3fb-4ea3-9142-415f76385c39')}&is_test=eq.true&limit=1`)
    if (!settings) return NextResponse.json({ available: false, settings: null, lead: lead?.is_test === true ? lead : null, runs: [], activity: [] })
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Math.min(10000, Number(searchParams.get('page') || 1)))
    const pageSize = 25
    const runs = lead ? await supabaseRest<Record<string, unknown>[]>(`luxor_test_runs?select=id,test_lead_id,source,submitted_email,submitted_phone,submitted_details,status,started_at,completed_at,reset_at&test_lead_id=eq.${encodeURIComponent(String(lead.id))}&order=started_at.desc&limit=${pageSize}&offset=${(page - 1) * pageSize}`) : []
    const [pinRun] = lead ? await supabaseRest<Record<string, unknown>[]>(`luxor_test_runs?select=id,test_lead_id,source,submitted_email,submitted_phone,submitted_details,status,started_at,completed_at,reset_at&test_lead_id=eq.${encodeURIComponent(String(lead.id))}&status=eq.in_progress&order=started_at.desc&limit=1`) : []
    const visibleRuns = pinRun && !runs.some((run) => run.id === pinRun.id) ? [pinRun, ...runs.slice(0, pageSize - 1)] : runs
    const activity = visibleRuns.length ? await supabaseRest<Record<string, unknown>[]>(`luxor_test_run_activity?select=*&test_run_id=in.(${visibleRuns.map((run) => encodeURIComponent(String(run.id))).join(',')})&order=created_at.desc&limit=250`) : []
    const artifacts = visibleRuns.length ? await supabaseRest<Record<string, unknown>[]>(`luxor_test_run_artifacts?select=*&test_run_id=in.(${visibleRuns.map((run) => encodeURIComponent(String(run.id))).join(',')})&order=created_at.asc`) : []
    const emails = visibleRuns.length ? await supabaseRest<Record<string, unknown>[]>(`luxor_test_run_emails?select=*&test_run_id=in.(${visibleRuns.map((run) => encodeURIComponent(String(run.id))).join(',')})&order=created_at.asc`) : []
    return NextResponse.json({
      available: Boolean(settings), settings,
      system: {
        emailProvider: luxorMailProvider(),
        normalizedPhone: settings.identification_phone,
      },
      lead: lead?.is_test === true ? lead : null, runs: visibleRuns, activity, artifacts, emails, page, pageSize, hasMore: runs.length === pageSize,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load test lead.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const member = await authorizedMember()
    if (!member) return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })
    const body = await request.json()
    if (typeof body.enabled !== 'boolean' || typeof body.identificationEmail !== 'string'
      || typeof body.identificationPhone !== 'string' || typeof body.emailRecipient !== 'string'
      || (body.enabled && body.confirmRecipient !== true)) {
      return NextResponse.json({ error: 'Provide valid test identifiers and explicitly confirm the exact email recipient.' }, { status: 400 })
    }
    const { saveLuxorTestSettings } = await import('@/lib/luxorTestLeadServer')
    const settings = await saveLuxorTestSettings({
      identificationEmail: body.identificationEmail,
      identificationPhone: body.identificationPhone,
      emailRecipient: body.emailRecipient,
      emailRecipientConfirmed: body.confirmRecipient === true,
      enabled: body.enabled,
      updatedBy: member.email,
    })
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save test settings.' }, { status: 400 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await authorizedMember()) return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })
    const body = await request.json()
    if (body.action === 'tour_change') {
      if (typeof body.testRunId !== 'string' || typeof body.actionKey !== 'string'
        || !/^[0-9a-f-]{8,160}$/i.test(body.actionKey)
        || !['reschedule', 'cancel'].includes(body.tourAction)) {
        return NextResponse.json({ error: 'A valid active test run, action key, and tour action are required.' }, { status: 400 })
      }
      const action = body.tourAction as 'reschedule' | 'cancel'
      let payload: Record<string, unknown>
      if (action === 'reschedule') {
        const date = typeof body.date === 'string' ? body.date.trim() : ''
        const time = typeof body.time === 'string' ? body.time.trim() : ''
        if (!date || !time) return NextResponse.json({ error: 'Choose a future date and time for the simulated tour.' }, { status: 400 })
        const { buildLuxorTestTourPlan } = await import('@/lib/luxorTestEmailTemplates')
        const plan = await buildLuxorTestTourPlan(body.testRunId, date, time)
        payload = {
          date, time, startUtc: plan.plan.startUtc.toISOString(), endUtc: plan.plan.endUtc.toISOString(),
          location: plan.plan.state.location, templates: plan.emails,
        }
      } else {
        const [lead] = await supabaseRest<Array<{ preferred_tour_date: string | null; preferred_tour_time: string | null }>>(
          `luxor_inquiries?select=preferred_tour_date,preferred_tour_time&id=eq.${encodeURIComponent('00b264d6-a3fb-4ea3-9142-415f76385c39')}&is_test=eq.true&limit=1`,
        )
        const cancellation = await buildLuxorTestEmailTemplate('tour_cancellation', body.testRunId, {
          preferredTourDate: lead?.preferred_tour_date,
          preferredTourTime: lead?.preferred_tour_time,
        })
        payload = { cancellation }
      }
      const result = await simulateLuxorTestTourChange({
        testRunId: body.testRunId,
        action,
        actionKey: body.actionKey,
        payload,
      })
      return NextResponse.json({ result, simulated: true })
    }
    if (body.action === 'send_test_email') {
      if (typeof body.testRunId !== 'string' || typeof body.category !== 'string') {
        return NextResponse.json({ error: 'A test run and email category are required.' }, { status: 400 })
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.testRunId)) {
        return NextResponse.json({ error: 'A valid test run ID is required.' }, { status: 400 })
      }
      const category = String(body.category)
      if (!isLuxorTestEmailCategory(category)) return NextResponse.json({ error: 'Choose a supported test email template.' }, { status: 400 })
      const template = await buildLuxorTestEmailTemplate(category, body.testRunId)
      const result = await enqueueLuxorTestEmail({
        testRunId: body.testRunId,
        category,
        ...template,
        source: 'portal_test_lead',
      })
      return NextResponse.json({ result, queued: true, recipient: 'luxoratlaspalmas@gmail.com' }, { status: 201 })
    }
    if (body.action === 'advance') {
      if (typeof body.testRunId !== 'string' || typeof body.artifactType !== 'string' || typeof body.status !== 'string') {
        return NextResponse.json({ error: 'A run, simulated workflow type, and status are required.' }, { status: 400 })
      }
      const artifact = await supabaseRest('rpc/luxor_advance_test_artifact', {
        method: 'POST',
        body: JSON.stringify({ p_test_run_id: body.testRunId, p_artifact_type: body.artifactType, p_status: body.status, p_details: body.details && typeof body.details === 'object' ? body.details : {} }),
      })
      return NextResponse.json({ artifact, simulated: true })
    }
    if (body.action !== 'reset' || typeof body.testRunId !== 'string' || body.confirm !== true) {
      return NextResponse.json({ error: 'Confirm reset for the selected test run.' }, { status: 400 })
    }
    return NextResponse.json({ result: await resetLuxorTestRun(body.testRunId) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to reset test lead.' }, { status: 400 })
  }
}
