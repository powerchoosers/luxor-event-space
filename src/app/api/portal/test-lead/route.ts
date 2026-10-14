import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorTestSettings, resetLuxorTestRun } from '@/lib/luxorTestLeadServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

async function authorizedMember() {
  const session = await getLuxorPortalSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  if (!member || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'settings')) return null
  return member
}

export async function GET() {
  try {
    if (!await authorizedMember()) return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })
    const [settings, leads] = await Promise.all([
      getLuxorTestSettings(),
      supabaseRest<Record<string, unknown>[]>('luxor_inquiries?select=*&is_test=eq.true&limit=1'),
    ])
    const lead = leads[0] ?? null
    const runs = lead ? await supabaseRest<Record<string, unknown>[]>(`luxor_test_runs?select=id,test_lead_id,source,status,started_at,completed_at,reset_at&test_lead_id=eq.${encodeURIComponent(String(lead.id))}&order=started_at.desc&limit=100`) : []
    const activity = runs.length ? await supabaseRest<Record<string, unknown>[]>(`luxor_test_run_activity?select=*&test_run_id=in.(${runs.map((run) => encodeURIComponent(String(run.id))).join(',')})&order=created_at.desc&limit=500`) : []
    return NextResponse.json({ settings, lead, runs, activity })
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
    if (body.action !== 'reset' || typeof body.testRunId !== 'string' || body.confirm !== true) {
      return NextResponse.json({ error: 'Confirm reset for the selected test run.' }, { status: 400 })
    }
    return NextResponse.json({ result: await resetLuxorTestRun(body.testRunId) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to reset test lead.' }, { status: 400 })
  }
}
