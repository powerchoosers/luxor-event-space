import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'

type BulkResource = 'inquiries' | 'calls' | 'bookings' | 'marketing_campaigns' | 'text_campaigns' | 'invoices'
type BulkBody = {
  resource?: BulkResource
  action?: string
  ids?: string[]
  value?: string | boolean | null
}

const RESOURCE_TABLES: Record<BulkResource, string> = {
  inquiries: 'luxor_inquiries',
  calls: 'luxor_calls',
  bookings: 'luxor_bookings',
  marketing_campaigns: 'luxor_marketing_campaigns',
  text_campaigns: 'luxor_text_campaigns',
  invoices: 'luxor_invoices',
}

const INQUIRY_STATUSES = new Set(['new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent', 'booked', 'closed_lost'])
const BOOKING_STATUSES = new Set(['draft', 'tentative', 'confirmed', 'completed', 'cancelled'])
const CAMPAIGN_STATUSES = new Set(['draft', 'scheduled', 'paused', 'cancelled'])
const CALL_OUTCOMES = new Set(['', 'connected', 'left_voicemail', 'tour_scheduled', 'follow_up', 'booked', 'not_interested', 'wrong_number'])
const INVOICE_STATUSES = new Set(['draft', 'sent', 'overdue', 'cancelled'])

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const body = await request.json() as BulkBody
    const resource = body.resource
    const action = String(body.action || '')
    const ids = normalizeIds(body.ids)

    if (!resource || !(resource in RESOURCE_TABLES)) {
      return NextResponse.json({ error: 'Unknown record type.' }, { status: 400 })
    }
    if (!ids.length) return NextResponse.json({ error: 'Select at least one record.' }, { status: 400 })
    if (ids.length > 1000) return NextResponse.json({ error: 'Bulk actions are limited to 1,000 records at a time.' }, { status: 400 })

    if (action === 'delete') return deleteRecords(resource, ids)

    const updates = getUpdates(resource, action, body.value)
    if (!updates) return NextResponse.json({ error: 'That bulk action is not allowed for these records.' }, { status: 400 })

    const rows = await supabaseRest<Array<{ id: string }>>(`${RESOURCE_TABLES[resource]}?select=id&${idFilter(ids)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(updates),
    })

    return NextResponse.json({ success: true, affected: rows.length, ids: rows.map((row) => row.id) })
  } catch (error) {
    console.error('[portal-bulk-action] failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The bulk action failed.' }, { status: 500 })
  }
}

function getUpdates(resource: BulkResource, action: string, value: BulkBody['value']) {
  if (resource === 'inquiries' && action === 'set_status' && typeof value === 'string' && INQUIRY_STATUSES.has(value)) {
    return { status: value, pipeline_stage: stageForStatus(value), updated_at: new Date().toISOString() }
  }
  if (resource === 'calls' && action === 'mark_read') return { is_read: true, updated_at: new Date().toISOString() }
  if (resource === 'calls' && action === 'mark_unread') return { is_read: false, updated_at: new Date().toISOString() }
  if (resource === 'calls' && action === 'set_outcome' && typeof value === 'string' && CALL_OUTCOMES.has(value)) {
    return { outcome: value || null, updated_at: new Date().toISOString() }
  }
  if (resource === 'bookings' && action === 'set_status' && typeof value === 'string' && BOOKING_STATUSES.has(value)) {
    return { status: value, updated_at: new Date().toISOString() }
  }
  if (resource === 'marketing_campaigns' && action === 'set_status' && typeof value === 'string' && CAMPAIGN_STATUSES.has(value)) {
    return { status: value, updated_at: new Date().toISOString() }
  }
  if (resource === 'invoices' && action === 'set_status' && typeof value === 'string' && INVOICE_STATUSES.has(value)) {
    return { status: value, paid_at: null, updated_at: new Date().toISOString() }
  }
  return null
}

async function deleteRecords(resource: BulkResource, ids: string[]) {
  if (resource === 'invoices') {
    return NextResponse.json({ error: 'Invoice deletion must use the protected invoice workflow.' }, { status: 400 })
  }
  if (resource === 'bookings') {
    const payments = await supabaseRest<Array<{ booking_id: string }>>(`luxor_payments?select=booking_id&${foreignIdFilter('booking_id', ids)}&status=eq.paid`)
    const protectedIds = new Set(payments.map((payment) => payment.booking_id))
    const deletableIds = ids.filter((id) => !protectedIds.has(id))
    const deleted = deletableIds.length ? await deleteByIds(RESOURCE_TABLES[resource], deletableIds) : []
    return NextResponse.json({
      success: true,
      affected: deleted.length,
      ids: deleted.map((row) => row.id),
      blockedIds: [...protectedIds],
      warning: protectedIds.size ? `${protectedIds.size} event record${protectedIds.size === 1 ? ' was' : 's were'} kept because paid payment history is attached.` : undefined,
    })
  }

  if (resource === 'marketing_campaigns') {
    const activeJobs = await supabaseRest<Array<{ id: string; metadata: Record<string, unknown> | null }>>(
      `luxor_email_jobs?select=id,metadata&status=in.(queued,processing)&job_type=eq.marketing_campaign`
    )
    const protectedIds = new Set(activeJobs.map((job) => String(job.metadata?.campaign_id || '')).filter((id) => ids.includes(id)))
    const deletableIds = ids.filter((id) => !protectedIds.has(id))
    const deleted = deletableIds.length ? await deleteByIds(RESOURCE_TABLES[resource], deletableIds) : []
    return NextResponse.json({
      success: true,
      affected: deleted.length,
      ids: deleted.map((row) => row.id),
      blockedIds: [...protectedIds],
      warning: protectedIds.size ? `${protectedIds.size} campaign${protectedIds.size === 1 ? ' was' : 's were'} kept because sending is still in progress.` : undefined,
    })
  }

  if (resource === 'text_campaigns') {
    const activeJobs = await supabaseRest<Array<{ campaign_id: string | null }>>(
      `luxor_text_jobs?select=campaign_id&${foreignIdFilter('campaign_id', ids)}&status=in.(queued,sending)`,
    )
    const protectedIds = new Set(activeJobs.map((job) => job.campaign_id).filter((id): id is string => Boolean(id)))
    const deletableIds = ids.filter((id) => !protectedIds.has(id))
    const deleted = deletableIds.length ? await deleteByIds(RESOURCE_TABLES[resource], deletableIds) : []
    return NextResponse.json({
      success: true,
      affected: deleted.length,
      ids: deleted.map((row) => row.id),
      blockedIds: [...protectedIds],
      warning: protectedIds.size ? `${protectedIds.size} text campaign${protectedIds.size === 1 ? ' was' : 's were'} kept because delivery is still queued or sending.` : undefined,
    })
  }

  const deleted = await deleteByIds(RESOURCE_TABLES[resource], ids)
  return NextResponse.json({ success: true, affected: deleted.length, ids: deleted.map((row) => row.id) })
}

function deleteByIds(table: string, ids: string[]) {
  return supabaseRest<Array<{ id: string }>>(`${table}?select=id&${idFilter(ids)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
}

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((id) => String(id || '').trim()).filter((id) => /^[a-zA-Z0-9-]{1,128}$/.test(id))))
}

function idFilter(ids: string[]) {
  return foreignIdFilter('id', ids)
}

function foreignIdFilter(column: string, ids: string[]) {
  return `${column}=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})`
}

function stageForStatus(status: string) {
  if (status === 'tour_requested' || status === 'tour_confirmed') return 'tour'
  if (status === 'proposal_sent') return 'proposal'
  if (status === 'booked') return 'contract'
  if (status === 'closed_lost') return 'closed_lost'
  return 'inquiry'
}
