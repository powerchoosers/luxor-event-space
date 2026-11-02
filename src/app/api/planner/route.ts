import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import {
  deletePlannerRecord,
  buildPlannerDesignRevisionSnapshot,
  commitPlannerDesignRevision,
  getPlannerBooking,
  getPlannerDesign,
  getPlannerRecord,
  listPlannerChecklistItems,
  listPlannerSection,
  savePlannerRecord,
  snapshotPlannerDesignAssets,
  PlannerMutationOutcomeUnknownError,
  type PlannerSection,
  type PlannerRecord,
} from '@/lib/luxorPlannerServer'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { normalizePlannerEventLayout } from '@/lib/luxorPlannerLayout'

const TABLES = {
  task: 'luxor_planner_tasks', meeting: 'luxor_planner_meetings', design: 'luxor_planner_designs',
  vendor: 'luxor_planner_vendors', event_vendor: 'luxor_planner_event_vendors',
  checklist: 'luxor_planner_checklists', checklist_item: 'luxor_planner_checklist_items',
} as const

type Entity = keyof typeof TABLES
type Body = Record<string, unknown>

function object(value: unknown): value is Body {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function contentWithoutHistory(value: Body) {
  const result = { ...value }
  delete result.revision_history
  return result
}
function str(value: unknown, max = 240) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
}
function validDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function validIso(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function validUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null } catch { return null }
}
function apiError(error: unknown) {
  const text = error instanceof Error ? error.message : 'Planner request failed.'
  const missingTable = /could not find the table|relation .* does not exist/i.test(text)
  if (missingTable) return NextResponse.json({ error: 'Planner storage has not been enabled yet.' }, { status: 503 })
  console.error('Planner request failed:', error)
  return NextResponse.json({ error: 'Planner request failed. Please try again.' }, { status: 500 })
}

async function authorized() {
  const session = await getLuxorPortalSession()
  if (!session) return { response: NextResponse.json({ error: 'Portal sign-in required.' }, { status: 401 }) }
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status !== 'active' || !memberCan(member, 'planner')) {
    return { response: NextResponse.json({ error: 'Planner access is not enabled for this portal account.' }, { status: 403 }) }
  }
  return { session, member }
}

async function validateMilestoneLinks(value: Body) {
  const bookingId = str(value.booking_id, 80)
  if (!bookingId) return { status:400, error:'Milestones must remain linked to an event.' }
  if (value.milestone_meeting_id) {
    const meeting = await getPlannerRecord('luxor_planner_meetings', String(value.milestone_meeting_id))
    if (!meeting) return { status:404, error:'Linked meeting not found.' }
    if (meeting.booking_id !== bookingId) return { status:409, error:'Choose a meeting from this event.' }
  }
  if (value.milestone_file_id) {
    const file = await getPlannerRecord('luxor_planner_files', String(value.milestone_file_id))
    if (!file || file.category === 'design_revision_snapshot') return { status:404, error:'Linked document not found.' }
    let fileBookingId = file.booking_id
    if (file.design_id) fileBookingId = (await getPlannerDesign(String(file.design_id)))?.booking_id
    if (file.event_vendor_id) fileBookingId = (await getPlannerRecord('luxor_planner_event_vendors', String(file.event_vendor_id)))?.booking_id
    if (fileBookingId !== bookingId) return { status:409, error:'Choose a document attached to this event.' }
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorized()
    if ('response' in access) return access.response
    const { searchParams } = new URL(request.url)
    const rawSection = searchParams.get('section')
    const bookingId = searchParams.get('bookingId') || undefined
    const query = searchParams.get('q') || ''
    if (rawSection === 'design_history') {
      const designId = str(searchParams.get('designId'), 80)
      if (!designId || !(await getPlannerDesign(designId))) return NextResponse.json({ error: 'Design not found.' }, { status: 404 })
      const before = Number(searchParams.get('before'))
      const filter = Number.isInteger(before) && before > 0 ? `&revision=lt.${before}` : ''
      const rows = await supabaseRestStrict<PlannerRecord[]>(`luxor_planner_design_revisions?select=id,design_id,revision,saved_at,snapshot&design_id=eq.${encodeURIComponent(designId)}${filter}&order=revision.desc&limit=21`)
      return NextResponse.json({ revisions: rows.slice(0, 20), hasMore: rows.length > 20 }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (!rawSection || !['overview','events','tasks','meetings','design-library','vendors','files','search'].includes(rawSection)) {
      return NextResponse.json({ error: 'Choose a valid Planner section.' }, { status: 400 })
    }
    if (rawSection === 'search' && query.trim().length < 2) return NextResponse.json({ bookings: [], tasks: [], designs: [], vendors: [], files: [] })
    if (bookingId && !(await getPlannerBooking(bookingId))) return NextResponse.json({ error: 'Confirmed event not found.' }, { status: 404 })
    return NextResponse.json(await listPlannerSection(rawSection as PlannerSection, bookingId, query), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return apiError(error) }
}

function cleanRecord(entity: Entity, value: Body, email: string, id?: string) {
  const now = new Date().toISOString()
  const base: Record<string, unknown> = { updated_at: now }
  if (!id) base.created_at = now
  if (!id && ['meeting', 'design', 'vendor', 'checklist'].includes(entity)) base.created_by = email

  if (entity === 'task') {
    const title = str(value.title)
    if (!title || !str(value.booking_id, 80)) throw new Error('Task title and confirmed event are required.')
    const priority = ['low','medium','high'].includes(String(value.priority)) ? value.priority : 'medium'
    const status = ['not_started','in_progress','completed'].includes(String(value.status)) ? value.status : 'not_started'
    return { ...base, booking_id: value.booking_id, title, description: str(value.description, 5000), category: str(value.category, 80), assigned_to: str(value.assigned_to, 240), due_date: validDate(value.due_date) ? value.due_date : null, priority, status, notes: str(value.notes, 10000), milestone_meeting_id: str(value.milestone_meeting_id,80), milestone_file_id: str(value.milestone_file_id,80), completed_at: status === 'completed' ? (id ? value.completed_at || now : now) : null }
  }
  if (entity === 'meeting') {
    const title = str(value.title, 200)
    if (!title || !validIso(value.starts_at)) throw new Error('Meeting title and date/time are required.')
    if (value.booking_id && !str(value.booking_id, 80)) throw new Error('Invalid event.')
    const duration = Number(value.duration_minutes ?? 60)
    if (!Number.isInteger(duration) || duration < 5 || duration > 1440) throw new Error('Meeting duration must be between 5 minutes and 24 hours.')
    const videoUrl = value.video_url ? validUrl(value.video_url) : null
    if (value.video_url && !videoUrl) throw new Error('Enter a valid http or https meeting link.')
    const status = ['scheduled','completed','cancelled'].includes(String(value.status)) ? value.status : 'scheduled'
    return { ...base, booking_id: value.booking_id || null, title, starts_at: value.starts_at, duration_minutes: duration, meeting_type: str(value.meeting_type, 80) || 'design_consultation', video_url: videoUrl, agenda: str(value.agenda, 5000), internal_notes: str(value.internal_notes, 10000), client_decisions: str(value.client_decisions, 10000), status }
  }
  if (entity === 'design') {
    const name = str(value.name, 160)
    const kind = value.design_kind === 'template' ? 'template' : 'event_concept'
    if (!name || (kind === 'event_concept' && !str(value.booking_id, 80))) throw new Error('Design name and event are required.')
    const status = ['draft','ready_to_present','presented','revision_requested','approved'].includes(String(value.status)) ? value.status : 'draft'
    const palette = Array.isArray(value.palette) ? value.palette.slice(0, 12) : []
    const content = object(value.content) ? value.content : {}
    if (Object.prototype.hasOwnProperty.call(content, 'event_layout') && content.event_layout !== null && !normalizePlannerEventLayout(content.event_layout)) {
      throw new Error('Floor plan has an unsupported format.')
    }
    const guestMin = value.guest_count_min === null || value.guest_count_min === '' ? null : Number(value.guest_count_min)
    const guestMax = value.guest_count_max === null || value.guest_count_max === '' ? null : Number(value.guest_count_max)
    if ((guestMin !== null && (!Number.isInteger(guestMin) || guestMin < 0)) || (guestMax !== null && (!Number.isInteger(guestMax) || guestMax < 0)) || (guestMin !== null && guestMax !== null && guestMax < guestMin)) throw new Error('Enter a valid guest range.')
    return { ...base, booking_id: kind === 'template' ? null : value.booking_id, design_kind: kind, source_template_id: value.source_template_id || null, category: str(value.category, 80) || 'design_template', name, event_type: str(value.event_type, 100), design_style: str(value.design_style, 100), palette, guest_count_min: guestMin, guest_count_max: guestMax, description: str(value.description, 10000), content, internal_notes: str(value.internal_notes, 10000), status, revision: Number(value.revision) || 1, approved_revision: status === 'approved' ? Number(value.revision) || 1 : null, approved_at: status === 'approved' ? now : null }
  }
  if (entity === 'vendor') {
    const businessName = str(value.business_name, 200)
    if (!businessName) throw new Error('Vendor business name is required.')
    const emailValue = str(value.email, 240)
    if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) throw new Error('Enter a valid vendor email.')
    const website = value.website ? validUrl(value.website) : null
    if (value.website && !website) throw new Error('Enter a valid vendor website.')
    return { ...base, business_name: businessName, contact_person: str(value.contact_person, 200), email: emailValue, phone: str(value.phone, 60), website, category: str(value.category, 80) || 'other', services: str(value.services, 5000), internal_notes: str(value.internal_notes, 10000) }
  }
  if (entity === 'event_vendor') {
    if (!str(value.booking_id, 80) || !str(value.vendor_id, 80)) throw new Error('Event and vendor are required.')
    const status = ['proposed','contacted','confirmed','documents_pending','ready_for_event','completed','cancelled'].includes(String(value.status)) ? value.status : 'proposed'
    const rawRequirements = Array.isArray(value.required_documents) ? value.required_documents : typeof value.required_documents_text === 'string' ? value.required_documents_text.split(',') : []
    const requiredDocuments = rawRequirements.map((item) => typeof item === 'string' ? item.trim().slice(0, 80) : '').filter(Boolean).slice(0, 12)
    return { ...base, booking_id: value.booking_id, vendor_id: value.vendor_id, services: str(value.services, 5000), arrival_at: validIso(value.arrival_at) ? value.arrival_at : null, setup_at: validIso(value.setup_at) ? value.setup_at : null, departure_at: validIso(value.departure_at) ? value.departure_at : null, access_instructions: str(value.access_instructions, 5000), internal_notes: str(value.internal_notes, 10000), required_documents: requiredDocuments, status }
  }
  if (entity === 'checklist') {
    const name = str(value.name, 160)
    if (!name) throw new Error('Checklist name is required.')
    return { ...base, name, event_type: str(value.event_type, 100), description: str(value.description, 5000) }
  }
  if (entity === 'checklist_item') {
    const title = str(value.title)
    if (!title || !str(value.checklist_id, 80)) throw new Error('Checklist item title is required.')
    const daysBeforeEvent = Number(value.days_before_event)
    return { checklist_id: value.checklist_id, title, description: str(value.description, 5000), category: str(value.category, 80), priority: ['low','medium','high'].includes(String(value.priority)) ? value.priority : 'medium', days_before_event: Number.isInteger(daysBeforeEvent) ? Math.max(-365, Math.min(365, daysBeforeEvent)) : null, sort_order: Number.isInteger(value.sort_order) ? value.sort_order : 0 }
  }
  throw new Error('Unsupported Planner record.')
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorized()
    if ('response' in access) return access.response
    const body: unknown = await request.json()
    if (!object(body) || typeof body.entity !== 'string') return NextResponse.json({ error: 'Invalid Planner record.' }, { status: 400 })
    if (body.entity === 'duplicate_design') {
      const sourceId = str(body.source_id, 80)
      if (!sourceId) return NextResponse.json({ error: 'Choose a design to copy.' }, { status: 400 })
      const source = await getPlannerDesign(sourceId)
      if (!source || source.archived_at) return NextResponse.json({ error: 'Design not found.' }, { status: 404 })
      const asTemplate = body.as_template === true
      const targetBookingId = str(body.target_booking_id, 80)
      if (!asTemplate && !targetBookingId) return NextResponse.json({ error: 'Choose a confirmed event for this design copy.' }, { status: 400 })
      const targetBooking = targetBookingId ? await getPlannerBooking(targetBookingId) : null
      if (targetBookingId && (!targetBooking || targetBooking.status !== 'confirmed')) return NextResponse.json({ error: 'Only a confirmed booking can receive an event concept.' }, { status: 409 })
      const sourceContent = object(source.content) ? source.content : {}
      const copiedContent = contentWithoutHistory(sourceContent)
      const newDesign = await savePlannerRecord('luxor_planner_designs', {
        booking_id: asTemplate ? null : targetBookingId,
        source_template_id: source.design_kind === 'template' ? source.id : source.source_template_id || null,
        design_kind: asTemplate ? 'template' : 'event_concept',
        category: source.category,
        name: `${String(source.name)} copy`.slice(0, 160),
        event_type: source.event_type,
        design_style: source.design_style,
        palette: source.palette,
        guest_count_min: source.guest_count_min,
        guest_count_max: source.guest_count_max,
        description: source.description,
        content: copiedContent,
        internal_notes: source.internal_notes,
        status: 'draft', revision: 1, approved_revision: null, approved_at: null,
        created_by: access.session.email, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      if (!newDesign) return NextResponse.json({ error: 'Design copy could not be created.' }, { status: 500 })

      const copiedObjects: string[] = []
      const copiedMetadata: string[] = []
      let url = ''
      let key = ''
      try {
        const sourceFiles = await supabaseRestStrict<PlannerRecord[]>(`luxor_planner_files?select=*&design_id=eq.${encodeURIComponent(sourceId)}&category=neq.design_revision_snapshot&order=created_at.asc`)
        const storageUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!storageUrl || !serviceKey) throw new Error('Private Planner file storage is not configured.')
        url = storageUrl.replace(/\/$/, '')
        key = serviceKey
        for (const sourceFile of sourceFiles) {
          const sourceObject = await fetch(`${url}/storage/v1/object/luxor-planner-files/${String(sourceFile.storage_path)}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' })
          if (!sourceObject.ok) throw new Error('A source design attachment could not be read.')
          const fileId = crypto.randomUUID()
          const fileName = String(sourceFile.file_name || 'design-file').replace(/[^a-zA-Z0-9 ._-]/g, '_').trim().slice(0, 180) || 'design-file'
          const path = `${fileId}/${encodeURIComponent(fileName)}`
          const stored = await fetch(`${url}/storage/v1/object/luxor-planner-files/${path}`, {
            method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': String(sourceFile.content_type), 'x-upsert': 'false' },
            body: new Uint8Array(await sourceObject.arrayBuffer()), cache: 'no-store',
          })
          if (!stored.ok) throw new Error('A design attachment could not be copied.')
          copiedObjects.push(path)
          const [savedFile] = await supabaseRestStrict<PlannerRecord[]>('luxor_planner_files?select=*', {
            method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
              booking_id: null, vendor_id: null, design_id: newDesign.id, event_vendor_id: null,
              category: sourceFile.category, title: sourceFile.title, file_name: fileName, storage_path: path,
              content_type: sourceFile.content_type, size_bytes: sourceFile.size_bytes, expires_at: sourceFile.expires_at,
              internal_only: true, uploaded_by: access.session.email, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }),
          })
          if (!savedFile) throw new Error('Copied design attachment metadata could not be saved.')
          copiedMetadata.push(savedFile.id)
        }
      } catch (copyError) {
        if (copiedMetadata.length) await supabaseRestStrict<unknown>(`luxor_planner_files?id=in.(${copiedMetadata.map(encodeURIComponent).join(',')})`, { method: 'DELETE' }).catch(() => undefined)
        if (url && key) await Promise.all(copiedObjects.map((path) => fetch(`${url}/storage/v1/object/luxor-planner-files/${path}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }).catch(() => undefined)))
        await deletePlannerRecord('luxor_planner_designs', String(newDesign.id)).catch(() => undefined)
        throw copyError
      }
      return NextResponse.json({ design: newDesign, copiedFiles: copiedMetadata.length }, { status: 201 })
    }
    if (body.entity === 'apply_checklist') {
      const bookingId = str(body.booking_id, 80)
      const checklistId = str(body.checklist_id, 80)
      if (!bookingId || !checklistId) return NextResponse.json({ error: 'Choose an event and checklist.' }, { status: 400 })
      const booking = await getPlannerBooking(bookingId)
      if (!booking || booking.status !== 'confirmed') return NextResponse.json({ error: 'Only confirmed bookings can receive planning checklists.' }, { status: 409 })
      const items = await listPlannerChecklistItems(checklistId)
      const inserted = await Promise.all(items.map((item) => {
        const date = booking.event_date && Number.isInteger(item.days_before_event)
          ? new Date(`${booking.event_date}T12:00:00Z`)
          : null
        if (date) date.setUTCDate(date.getUTCDate() - Number(item.days_before_event))
        return savePlannerRecord('luxor_planner_tasks', {
          booking_id: bookingId, checklist_item_id: item.id, title: item.title, description: item.description,
          category: item.category, priority: item.priority, due_date: date?.toISOString().slice(0, 10) ?? null,
          status: 'not_started', updated_at: new Date().toISOString(),
        }, undefined, 'booking_id,checklist_item_id')
      }))
      return NextResponse.json({ created: inserted.filter(Boolean).length, alreadyApplied: inserted.filter((item) => !item).length })
    }
    const entity = body.entity as Entity
    if (!(entity in TABLES) || !object(body.record)) return NextResponse.json({ error: 'Unsupported Planner record.' }, { status: 400 })
    const record = body.record
    if (entity === 'checklist_item' && record.sort_order === undefined) {
      const checklistId = str(record.checklist_id, 80)
      if (!checklistId) return NextResponse.json({ error: 'Choose a checklist.' }, { status: 400 })
      const existing = await listPlannerChecklistItems(checklistId)
      record.sort_order = existing.reduce((maximum, item) => Math.max(maximum, Number(item.sort_order) || 0), -1) + 1
    }
    if ('booking_id' in record && record.booking_id) {
      const booking = await getPlannerBooking(String(record.booking_id))
      if (!booking) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
      if (booking.status !== 'confirmed') return NextResponse.json({ error: 'Only confirmed events can receive new planning records.' }, { status: 409 })
    }
    if (entity === 'task') {
      const invalidLink = await validateMilestoneLinks(record)
      if (invalidLink) return NextResponse.json({ error:invalidLink.error }, { status:invalidLink.status })
    }
    if (entity === 'event_vendor') {
      const vendor = await supabaseRestStrict<Array<{ id: string }>>(`luxor_planner_vendors?select=id&id=eq.${encodeURIComponent(String(record.vendor_id))}&archived_at=is.null&limit=1`)
      if (!vendor[0]) return NextResponse.json({ error: 'Vendor not found.' }, { status: 404 })
    }
    if (entity === 'design' && record.source_template_id) {
      const source = await getPlannerDesign(String(record.source_template_id))
      if (!source || source.design_kind !== 'template') return NextResponse.json({ error: 'Design template not found.' }, { status: 404 })
      record.content = source.content
      record.palette = source.palette
      record.name = record.name || source.name
      record.design_style = record.design_style || source.design_style
      record.category = source.category
      record.revision = 1
      record.status = 'draft'
      record.design_kind = 'event_concept'
      record.source_template_id = source.id
    }
    const saved = await savePlannerRecord(TABLES[entity], cleanRecord(entity, record, access.session.email), undefined, entity === 'event_vendor' ? 'booking_id,vendor_id' : undefined)
    if (!saved) return NextResponse.json({ error: 'Planner record could not be saved.' }, { status: 500 })
    return NextResponse.json(saved, { status: 201 })
  } catch (error) { return apiError(error) }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await authorized()
    if ('response' in access) return access.response
    const body: unknown = await request.json()
    if (!object(body) || typeof body.entity !== 'string' || !(body.entity in TABLES) || !str(body.id, 80) || !object(body.record)) return NextResponse.json({ error: 'Invalid Planner update.' }, { status: 400 })
    const entity = body.entity as Entity
    const id = str(body.id, 80)!
    const table = TABLES[entity]
    const prior = await getPlannerRecord(table, id)
    if (!prior) return NextResponse.json({ error: 'Planner record not found.' }, { status: 404 })
    const submitted = body.record
    const value: Body = { ...prior, ...submitted }

    // Checklist provenance and event-vendor identity are immutable after create.
    // The task/meeting booking may be changed only with an explicit, valid target.
    if (entity === 'task') value.checklist_item_id = prior.checklist_item_id
    if (entity === 'event_vendor') {
      value.booking_id = prior.booking_id
      value.vendor_id = prior.vendor_id
    }
    if (entity === 'design') {
      value.booking_id = prior.booking_id
      value.design_kind = prior.design_kind
      value.source_template_id = prior.source_template_id
    }
    if (entity === 'checklist_item') value.checklist_id = prior.checklist_id

    if (entity === 'task' || entity === 'meeting') {
      const changedBooking = Object.hasOwn(submitted, 'booking_id') && submitted.booking_id !== prior.booking_id
      if (changedBooking) {
        const bookingId = submitted.booking_id === null && entity === 'meeting' ? null : str(submitted.booking_id, 80)
        if (entity === 'task' && !bookingId) return NextResponse.json({ error: 'Tasks must remain linked to a confirmed event.' }, { status: 400 })
        if (bookingId) {
          const booking = await getPlannerBooking(bookingId)
          if (!booking) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
          if (booking.status !== 'confirmed') return NextResponse.json({ error: 'Only confirmed events can receive planning records.' }, { status: 409 })
        }
        value.booking_id = bookingId
      }
    }
    if (entity === 'task') {
      const invalidLink = await validateMilestoneLinks(value)
      if (invalidLink) return NextResponse.json({ error:invalidLink.error }, { status:invalidLink.status })
    }

    if (entity === 'design') {
      const currentContent = object(prior.content) ? prior.content : {}
      const currentContentFields = contentWithoutHistory(currentContent)
      const submittedContent = object(submitted.content) ? submitted.content : {}
      const submittedContentFields = contentWithoutHistory(submittedContent)
      if (Object.prototype.hasOwnProperty.call(submittedContentFields, 'event_layout')
        && submittedContentFields.event_layout !== null
        && !normalizePlannerEventLayout(submittedContentFields.event_layout)) {
        return NextResponse.json({ error: 'Floor plan has an unsupported format.' }, { status: 400 })
      }
      const priorRevision = Number(prior.revision || 1)
      const editorRevision = Number(submitted.expected_revision)
      if (!Number.isInteger(editorRevision) || editorRevision !== priorRevision) {
        return NextResponse.json({ error: 'This design changed after you opened it. Your edits are still here, but were not saved. Close and reopen the latest revision before trying again.' }, { status: 409 })
      }
      value.revision = priorRevision + 1
      const revisionAssets = await snapshotPlannerDesignAssets(id, priorRevision, access.session.email)
      try {
        value.content = { ...currentContentFields, ...submittedContentFields }
        // Approval is an internal status. A content edit cannot silently carry it
        // forward; the prior exact revision/time remains in the immutable snapshot.
        if (prior.status === 'approved') value.status = 'revision_requested'
        const snapshot = buildPlannerDesignRevisionSnapshot(prior, priorRevision, revisionAssets.assets)
        const committed = await commitPlannerDesignRevision({
          designId: id,
          expectedRevision: editorRevision,
          snapshot,
          design: cleanRecord(entity, value, access.session.email, id),
        })
        if (!committed.committed || !committed.design) {
          await revisionAssets.cleanup()
          return NextResponse.json({ error: 'This design changed while you were editing it. Reload and review the latest revision.' }, { status:409 })
        }
        return NextResponse.json(committed.design)
      } catch (error) {
        if (error instanceof PlannerMutationOutcomeUnknownError) {
          // Even an empty reconciliation read can race a transaction that is
          // still executing. Keep every private staged asset on unknown outcome.
          return NextResponse.json({ error: 'The save may have completed, but its response was not confirmed. Reload this design before retrying.' }, { status:503 })
        }
        await revisionAssets.cleanup()
        throw error
      }
    }

    const saved = await savePlannerRecord(table, cleanRecord(entity, value, access.session.email, id), id)
    if (!saved) return NextResponse.json({ error: 'Planner record not found.' }, { status:404 })
    return NextResponse.json(saved)
  } catch (error) { return apiError(error) }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await authorized()
    if ('response' in access) return access.response
    const { searchParams } = new URL(request.url)
    const entity = searchParams.get('entity') as Entity | null
    const id = searchParams.get('id')
    if (!entity || !(entity in TABLES) || !id) return NextResponse.json({ error: 'Choose a Planner record to remove.' }, { status: 400 })
    if (entity === 'design' || entity === 'vendor' || entity === 'checklist') {
      const table = TABLES[entity]
      const saved = await savePlannerRecord(table, { archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }, id)
      if (!saved) return NextResponse.json({ error: 'Planner record not found.' }, { status: 404 })
    } else await deletePlannerRecord(TABLES[entity], id)
    return NextResponse.json({ ok: true })
  } catch (error) { return apiError(error) }
}
