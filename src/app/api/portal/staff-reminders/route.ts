import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRestCount, supabaseRestStrict } from '@/lib/supabaseRestServer'
import { luxorMailProvider } from '@/lib/luxorMailConfig'

const owner = 'a.patterson@luxoratlaspalmas.com'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export async function GET() {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const [pending, history, pendingCount] = await Promise.all([
      supabaseRestStrict<unknown[]>('luxor_email_jobs?select=id,subject,status,scheduled_for,last_error,metadata&job_type=eq.inquiry_notification&metadata->>notificationKind=eq.staff_reminder&status=in.(queued,sending)&order=scheduled_for.asc&limit=100'),
      supabaseRestStrict<unknown[]>('luxor_email_jobs?select=id,subject,status,scheduled_for,last_error,metadata&job_type=eq.inquiry_notification&metadata->>notificationKind=eq.staff_reminder&status=in.(sent,cancelled,failed)&order=updated_at.desc&limit=20'),
      supabaseRestCount('luxor_email_jobs?select=id&job_type=eq.inquiry_notification&metadata->>notificationKind=eq.staff_reminder&status=in.(queued,sending)'),
    ])
    return NextResponse.json({ reminders: [...pending, ...history], pendingCount })
  } catch { return NextResponse.json({ error: 'Reminders could not be loaded.' }, { status: 500 }) }
}

export async function POST(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  try {
    const body = await request.json()
    const { kind, sourceId, scheduledFor } = body
    if (!['task', 'promotion'].includes(kind) || typeof sourceId !== 'string' || !uuid.test(sourceId) || typeof scheduledFor !== 'string' || !Number.isFinite(Date.parse(scheduledFor)) || Date.parse(scheduledFor) <= Date.now()) return NextResponse.json({ error: 'Choose an item and a future reminder time.' }, { status: 400 })
    const requestedFor = new Date(scheduledFor).toISOString()
    const hash = createHash('sha256').update(`luxor-staff-reminder/v1/${kind}/${sourceId.toLowerCase()}/${requestedFor}/${owner}`).digest('hex')
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    let name: string
    let sourceDate: string | null
    let sourceTime: string | null = null
    let leadId: string | null = null
    let leadName: string | null = null
    if (kind === 'task') {
      const [task] = await supabaseRestStrict<Array<{ title: string; status: string; due_date: string | null; due_at: string | null; inquiry_id: string | null }>>(`luxor_tasks?select=title,status,due_date,due_at,inquiry_id&id=eq.${encodeURIComponent(sourceId)}&limit=1`)
      if (!task || task.status !== 'pending') return NextResponse.json({ error: 'Choose an open task.' }, { status: 409 })
      name = task.title
      sourceDate = task.due_date
      sourceTime = task.due_at
      leadId = task.inquiry_id
      if (leadId) {
        if (!uuid.test(leadId)) throw new Error('Invalid task lead.')
        const [lead] = await supabaseRestStrict<Array<{ full_name: string }>>(`luxor_inquiries?select=full_name&id=eq.${encodeURIComponent(leadId)}&limit=1`)
        if (!lead) return NextResponse.json({ error: 'The task’s linked lead is unavailable.' }, { status: 409 })
        leadName = lead.full_name
      }
    } else {
      const [promotion] = await supabaseRestStrict<Array<{ name: string; active: boolean; expires_on: string | null }>>(`luxor_promotions?select=name,active,expires_on&id=eq.${encodeURIComponent(sourceId)}&limit=1`)
      if (!promotion?.active || !promotion.expires_on) return NextResponse.json({ error: 'Choose an active promotion with an expiration date.' }, { status: 409 })
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(scheduledFor))
      const part = (type: string) => parts.find(item => item.type === type)?.value
      if (`${part('year')}-${part('month')}-${part('day')}` > promotion.expires_on) return NextResponse.json({ error: 'Choose a reminder on or before the promotion expires.' }, { status: 400 })
      name = promotion.name
      sourceDate = promotion.expires_on
    }
    const subject = `${kind === 'task' ? 'Follow-up reminder' : 'Promotion reminder'}: ${leadName ? `${leadName} — ` : ''}${name}`.replace(/[\r\n]+/g, ' ').slice(0, 250)
    const link = leadId ? `https://www.luxoratlaspalmas.com/portal/leads/${leadId}` : kind === 'task' ? 'https://www.luxoratlaspalmas.com/portal/calendar' : 'https://www.luxoratlaspalmas.com/portal/settings'
    const content = `<p>${leadName ? `${escape(leadName)} — ` : ''}${escape(name)}</p><p>${kind === 'task' ? 'Task due' : 'Promotion expires'}: ${escape(sourceDate || 'Not set')}</p><p><a href="${link}">Open Luxor portal</a></p>`
    const rows = await supabaseRestStrict<Array<{ id: string }>>('luxor_email_jobs?on_conflict=id&select=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ id, job_type: 'inquiry_notification', status: 'queued', inquiry_id: null, recipient_email: owner, subject, body: content, scheduled_for: requestedFor, metadata: { notificationKind: 'staff_reminder', notificationRendered: true, notificationProvider: luxorMailProvider(), sourceKind: kind, sourceId, sourceDate, sourceTime, sourceName: name, leadId, leadName, requestedFor } }) })
    if (!rows.length) {
      const [existing] = await supabaseRestStrict<Array<{ status: string; recipient_email: string; metadata: Record<string, unknown> }>>(`luxor_email_jobs?select=status,recipient_email,metadata&id=eq.${encodeURIComponent(id)}&limit=1`)
      if (existing?.recipient_email === owner && existing.metadata?.notificationKind === 'staff_reminder' && existing.metadata.sourceKind === kind && existing.metadata.sourceId === sourceId && existing.metadata.requestedFor === requestedFor && existing.metadata.sourceDate === sourceDate && existing.metadata.sourceTime === sourceTime && existing.metadata.sourceName === name && existing.metadata.leadId === leadId && existing.metadata.leadName === leadName && ['queued', 'sending', 'sent'].includes(existing.status)) return NextResponse.json({ id })
      return NextResponse.json({ error: 'A reminder for this item and time already exists with different details or needs review. Choose another time.' }, { status: 409 })
    }
    return NextResponse.json({ id }, { status: 201 })
  } catch { return NextResponse.json({ error: 'Reminder could not be saved.' }, { status: 500 }) }
}

export async function DELETE(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid reminder.' }, { status: 400 })
  try {
    const rows = await supabaseRestStrict<unknown[]>(`luxor_email_jobs?select=id&id=eq.${encodeURIComponent(id)}&job_type=eq.inquiry_notification&metadata->>notificationKind=eq.staff_reminder&status=eq.queued`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'cancelled', last_error: 'Cancelled by staff.', updated_at: new Date().toISOString() }) })
    if (!rows.length) return NextResponse.json({ error: 'This reminder is no longer pending.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Reminder could not be cancelled.' }, { status: 500 }) }
}
