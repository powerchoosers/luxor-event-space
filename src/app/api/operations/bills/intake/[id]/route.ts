import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { broadcastLuxorPortalNotification } from '@/lib/luxorZohoWebhookServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorBillIntake } from '@/lib/luxorInquiryTypes'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid bill intake.' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { action?: string }
    if (body.action !== 'retry' && body.action !== 'ignore') return NextResponse.json({ error: 'Choose retry or ignore.' }, { status: 400 })
    const now = new Date().toISOString()
    const updates = body.action === 'retry'
      ? { status: 'received', lease_until: null, next_attempt_at: now, last_error_code: null, last_error_message: null, updated_at: now }
      : { status: 'ignored', lease_until: null, updated_at: now }
    const [intake] = await supabaseRest<LuxorBillIntake[]>(`luxor_bill_intakes?id=eq.${id}&select=*`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(updates),
    })
    if (!intake) return NextResponse.json({ error: 'Bill intake not found.' }, { status: 404 })
    await broadcastLuxorPortalNotification('bill-intake-updated', { intakeId: id, status: intake.status }).catch(() => {})
    return NextResponse.json(intake)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bill intake action failed.' }, { status: 400 })
  }
}
