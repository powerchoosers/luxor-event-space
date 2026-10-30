import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { requireCustomWorkflowOperator } from '@/lib/luxorCustomWorkflowsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    await requireCustomWorkflowOperator(session.email)
    const inquiries = await supabaseRest<Array<{
      id: string
      full_name: string | null
      email: string | null
      phone: string | null
      event_type: string | null
      target_date: string | null
      status: string
      created_at: string
    }>>(
      'luxor_inquiries?select=id,full_name,email,phone,event_type,target_date,status,created_at&order=created_at.desc&limit=50',
    )

    return NextResponse.json({ inquiries }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load leads.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
