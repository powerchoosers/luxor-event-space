import 'server-only'

import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { listLuxorBookingsWithPayments } from '@/lib/luxorBookingsServer'
import type { LuxorBookingWithPayments } from '@/lib/luxorBookingsServer'
import { luxorPlannerDateKey } from '@/lib/luxorPlannerDates'

export type PlannerSection = 'overview' | 'events' | 'tasks' | 'meetings' | 'design-library' | 'vendors' | 'files' | 'search'
export type PlannerRecord = Record<string, unknown> & { id: string }

export class PlannerMutationOutcomeUnknownError extends Error {
  constructor(message: string, readonly originalError: unknown) {
    super(message)
    this.name = 'PlannerMutationOutcomeUnknownError'
  }
}

function plannerBookingView(booking: LuxorBookingWithPayments) {
  const contractTotal = Number(booking.contract_total || 0)
  const paidTotal = Number(booking.paid_total || 0)
  const balanceDue = Number(booking.balance_due || 0)
  const paymentStatus = contractTotal <= 0 ? 'Payment status unavailable' : balanceDue <= 0 ? 'Paid' : paidTotal > 0 ? 'Partially paid' : 'Payment due'
  return {
    id: booking.id,
    inquiry_id: booking.inquiry_id,
    lead_event_id: booking.lead_event_id || null,
    client_name: booking.client_name,
    event_type: booking.event_type,
    event_date: booking.event_date,
    start_time: booking.start_time,
    end_time: booking.end_time,
    guest_count: booking.guest_count,
    package_name: booking.package_name,
    status: booking.status,
    booked_at: booking.booked_at,
    created_at: booking.created_at,
    final_payment_due_date: booking.final_payment_due_date,
    payment_status: paymentStatus,
  }
}

export async function listPlannerBookings() {
  const bookings = await listLuxorBookingsWithPayments(1000, true)
  return bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
}

function escapeFilter(value: string) {
  return encodeURIComponent(value)
}

function plannerDocumentMatches(file: PlannerRecord, requirement: string) {
  const needle = requirement.toLowerCase().replaceAll('_', ' ')
  const category = String(file.category || '').toLowerCase().replaceAll('_', ' ')
  const title = String(file.title || '').toLowerCase()
  if (needle.includes('insurance')) return category === 'insurance' || title.includes('insurance')
  if (needle.includes('agreement') || needle.includes('contract')) return category === 'vendor agreements' || title.includes('agreement') || title.includes('contract')
  if (needle.includes('permit')) return category === 'permits' || title.includes('permit')
  return category === needle || title.includes(needle)
}

export async function listPlannerSection(section: PlannerSection, bookingId?: string, query = '') {
  if (section === 'search') {
    const term = query.trim().toLowerCase()
    if (term.length < 2) return { bookings: [], tasks: [], designs: [], vendors: [], files: [] }
    const [bookings, tasks, designs, vendors, files] = await Promise.all([
      listPlannerBookings(),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_tasks?select=id,booking_id,title,due_date,status&order=due_date.asc.nullslast&limit=2000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_designs?select=id,booking_id,name,design_kind,status&archived_at=is.null&order=name.asc&limit=1000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_vendors?select=id,business_name,category&archived_at=is.null&order=business_name.asc&limit=1000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_files?select=id,title,file_name,booking_id,content_type,category&category=neq.design_revision_snapshot&order=created_at.desc&limit=2000'),
    ])
    const bookingViews = bookings.map(plannerBookingView)
    const bookingById = new Map(bookingViews.map((booking) => [booking.id, booking]))
    const includes = (row: PlannerRecord, keys: string[]) => keys.some((key) => String(row[key] ?? '').toLowerCase().includes(term))
    return {
      bookings: bookingViews.filter((booking) => includes(booking, ['client_name','event_type','package_name'])).slice(0, 8),
      tasks: tasks.filter((task) => includes(task, ['title'])).slice(0, 8).map((task) => ({ ...task, booking: bookingById.get(String(task.booking_id)) })),
      designs: designs.filter((design) => includes(design, ['name'])).slice(0, 8),
      vendors: vendors.filter((vendor) => includes(vendor, ['business_name','category'])).slice(0, 8),
      files: files.filter((file) => includes(file, ['title','file_name'])).slice(0, 8),
    }
  }
  if (section === 'events' || section === 'overview') {
      const [bookings, tasks, meetings, designs, templates] = await Promise.all([
      listPlannerBookings(),
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_tasks?select=*&order=due_date.asc.nullslast&limit=1000${bookingId ? `&booking_id=eq.${escapeFilter(bookingId)}` : ''}`),
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_meetings?select=*&order=starts_at.asc&limit=500${bookingId ? `&booking_id=eq.${escapeFilter(bookingId)}` : ''}`),
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_designs?select=*&archived_at=is.null&order=updated_at.desc&limit=300${bookingId ? `&booking_id=eq.${escapeFilter(bookingId)}` : ''}`),
      bookingId
        ? supabaseRestStrict<PlannerRecord[]>('luxor_planner_designs?select=*&design_kind=eq.template&booking_id=is.null&archived_at=is.null&order=updated_at.desc&limit=1000')
        : Promise.resolve([] as PlannerRecord[]),
    ])
    if (bookingId) {
      const booking = bookings.find((row) => row.id === bookingId)
      const [vendors, assignments, baseFiles] = await Promise.all([
        supabaseRestStrict<PlannerRecord[]>('luxor_planner_vendors?select=*&archived_at=is.null&order=business_name.asc&limit=1000'),
        supabaseRestStrict<PlannerRecord[]>(`luxor_planner_event_vendors?select=*&booking_id=eq.${escapeFilter(bookingId)}&order=created_at.desc&limit=1000`),
        supabaseRestStrict<PlannerRecord[]>(`luxor_planner_files?select=*&booking_id=eq.${escapeFilter(bookingId)}&order=created_at.desc&limit=1000`),
      ])
      const assignmentIds = assignments.map((item) => item.id)
      const attachedFiles = assignmentIds.length
        ? await supabaseRestStrict<PlannerRecord[]>(`luxor_planner_files?select=*&event_vendor_id=in.(${assignmentIds.map(escapeFilter).join(',')})&order=created_at.desc&limit=1000`)
        : []
      const eventDesignIds = designs.filter((design) => design.design_kind === 'event_concept').map((design) => design.id)
      const eventDesignFiles = eventDesignIds.length
        ? await supabaseRestStrict<PlannerRecord[]>(`luxor_planner_files?select=*&design_id=in.(${eventDesignIds.map(escapeFilter).join(',')})&category=neq.design_revision_snapshot&order=created_at.desc&limit=1000`)
        : []
      const templateIds = templates.map((design) => design.id)
      const templateFiles = templateIds.length
        ? await supabaseRestStrict<PlannerRecord[]>(`luxor_planner_files?select=*&design_id=in.(${templateIds.map(escapeFilter).join(',')})&category=neq.design_revision_snapshot&order=created_at.desc&limit=1000`)
        : []
      const files = [...baseFiles, ...attachedFiles, ...eventDesignFiles]
      const bookingView = booking ? plannerBookingView(booking) : null
      return { booking: bookingView, bookings: bookingView ? [bookingView] : [], tasks, meetings, designs: designs.filter((design) => design.design_kind === 'event_concept'), templates, templateFiles, vendors, assignments, files }
    }
    const eventHistory = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
    const todayChicago = luxorPlannerDateKey()
    const activeBookings = bookings.filter((booking) => booking.status === 'confirmed' && booking.event_date)
    const upcoming = activeBookings.filter((booking) => booking.event_date! >= todayChicago).sort((a, b) => a.event_date!.localeCompare(b.event_date!)).slice(0, 3)
    const now = new Date().toISOString()
    const nextMeeting = meetings.find((meeting) => meeting.status === 'scheduled' && String(meeting.starts_at) >= now) ?? null
    const bookingMap = new Map(bookings.map((booking) => [booking.id, plannerBookingView(booking)]))
    const overdueTasks = tasks.filter((task) => task.status !== 'completed' && typeof task.due_date === 'string' && task.due_date < todayChicago)
    const revisionDesigns = designs.filter((design) => design.design_kind === 'event_concept' && design.status === 'revision_requested')
    const [assignments, plannerFiles, vendorRows, designFiles] = section === 'overview' ? await Promise.all([
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_event_vendors?select=*&status=neq.cancelled&limit=1000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_files?select=*&event_vendor_id=not.is.null&limit=2000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_vendors?select=id,business_name&archived_at=is.null&limit=1000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_files?select=*&design_id=not.is.null&category=neq.design_revision_snapshot&order=created_at.desc&limit=1000'),
    ]) : [[],[],[],[]]
    const vendorById = new Map(vendorRows.map((vendor) => [vendor.id, String(vendor.business_name || 'Vendor')]))
    const vendorAttention = assignments.flatMap((assignment) => {
      const required = Array.isArray(assignment.required_documents) ? assignment.required_documents.filter((item): item is string => typeof item === 'string') : []
      const booking = bookingMap.get(String(assignment.booking_id))
      if (!booking) return []
      return required.flatMap((requirement) => {
        const matching = plannerFiles.filter((candidate) => candidate.event_vendor_id === assignment.id && plannerDocumentMatches(candidate, requirement))
        const validFile = matching.find((candidate) => typeof candidate.expires_at !== 'string' || candidate.expires_at >= todayChicago)
        if (validFile) return []
        const expiredFile = matching.find((candidate) => typeof candidate.expires_at === 'string')
        return [{ id: assignment.id, type: 'vendor', title: `${vendorById.get(String(assignment.vendor_id)) || 'Vendor'} · ${requirement} ${expiredFile ? 'expired' : 'missing'}`, booking, dueDate: expiredFile?.expires_at || null }]
      })
    })
    const allAttention = [
      ...overdueTasks.map((task) => ({ id: task.id, type: 'task', title: String(task.title), booking: bookingMap.get(String(task.booking_id)), dueDate: task.due_date })),
      ...revisionDesigns.map((design) => ({ id: design.id, type: 'design', title: `${String(design.name)} needs revisions`, booking: bookingMap.get(String(design.booking_id)), dueDate: null })),
      ...vendorAttention,
    ].filter((item) => item.booking)
    const attention = allAttention.slice(0, 5)
    const events = eventHistory.sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
    return {
      bookings: events.map(plannerBookingView),
      upcoming: upcoming.map(plannerBookingView),
      tasks,
      meetings,
      nextMeeting,
      recentDesigns: designs.filter((design) => design.design_kind === 'event_concept').slice(0, 3),
      attention,
      attentionCount: allAttention.length,
      upcomingCount: activeBookings.filter((booking) => booking.event_date! >= todayChicago).length,
      files: designFiles,
    }
  }

  if (section === 'tasks') {
    const [tasks, checklists, checklistItems, bookings, meetings, files, designs, assignments] = await Promise.all([
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_tasks?select=*&order=due_date.asc.nullslast&limit=2000${bookingId ? `&booking_id=eq.${escapeFilter(bookingId)}` : ''}`),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_checklists?select=*&archived_at=is.null&order=name.asc&limit=500'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_checklist_items?select=*&order=sort_order.asc&limit=2000'),
      listPlannerBookings(),
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_meetings?select=id,booking_id,title,starts_at&order=starts_at.asc&limit=1000${bookingId ? `&booking_id=eq.${escapeFilter(bookingId)}` : ''}`),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_files?select=id,booking_id,design_id,event_vendor_id,title,file_name,category&category=neq.design_revision_snapshot&order=created_at.desc&limit=2000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_designs?select=id,booking_id,name,revision&archived_at=is.null&order=name.asc&limit=1000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_event_vendors?select=id,booking_id&status=neq.cancelled&limit=1000'),
    ])
    return { tasks, checklists, checklistItems, bookings: bookings.map(plannerBookingView), meetings, files, designs, assignments }
  }
  if (section === 'meetings') {
    const [meetings, bookings] = await Promise.all([
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_meetings?select=*&order=starts_at.asc&limit=1000${bookingId ? `&booking_id=eq.${escapeFilter(bookingId)}` : ''}`),
      listPlannerBookings(),
    ])
    return { meetings, bookings: bookings.map(plannerBookingView) }
  }
  if (section === 'design-library') {
    const [designs, bookings, files] = await Promise.all([
      // Preserve every legacy unlinked design record in the gallery. Older
      // Planner versions did not consistently mark reusable designs as
      // `template`; the gallery can still edit, archive, or copy them forward.
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_designs?select=*&booking_id=is.null&order=updated_at.desc&limit=1000`),
      listPlannerBookings(),
      Promise.resolve([] as PlannerRecord[]),
    ])
    const designIds = designs.map((design) => design.id)
    const designFiles = designIds.length
      ? await supabaseRestStrict<PlannerRecord[]>(`luxor_planner_files?select=*&design_id=in.(${designIds.map(escapeFilter).join(',')})&category=neq.design_revision_snapshot&order=created_at.desc&limit=2000`)
      : files
    return { designs, bookings: bookings.map(plannerBookingView), files: designFiles }
  }
  if (section === 'vendors') {
    const [vendors, assignments, bookings, files] = await Promise.all([
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_vendors?select=*&archived_at=is.null&order=business_name.asc&limit=1000'),
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_event_vendors?select=*&order=created_at.desc&limit=1000${bookingId ? `&booking_id=eq.${escapeFilter(bookingId)}` : ''}`),
      listPlannerBookings(),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_files?select=*&event_vendor_id=not.is.null&order=created_at.desc&limit=1000'),
    ])
    return { vendors, assignments, bookings: bookings.map(plannerBookingView), files }
  }
  if (section === 'files') {
    const [files, bookings, vendors, designs, assignments] = await Promise.all([
      supabaseRestStrict<PlannerRecord[]>(`luxor_planner_files?select=*&category=neq.design_revision_snapshot&order=created_at.desc&limit=1000${bookingId ? `&booking_id=eq.${escapeFilter(bookingId)}` : ''}`),
      listPlannerBookings(),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_vendors?select=id,business_name&archived_at=is.null&order=business_name.asc&limit=1000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_designs?select=id,name,revision&archived_at=is.null&order=name.asc&limit=1000'),
      supabaseRestStrict<PlannerRecord[]>('luxor_planner_event_vendors?select=id,booking_id,vendor_id&order=created_at.desc&limit=1000'),
    ])
    const designRevision = new Map(designs.map((design) => [String(design.id), Number(design.revision || 1)]))
    return { files: files.map((file) => file.design_id ? { ...file, design_revision: designRevision.get(String(file.design_id)) } : file), bookings: bookings.map(plannerBookingView), vendors, designs, assignments }
  }
  return null
}

export async function getPlannerBooking(bookingId: string): Promise<ReturnType<typeof plannerBookingView> | null> {
  const bookings = await listPlannerBookings()
  const booking = bookings.find((row) => row.id === bookingId)
  return booking ? plannerBookingView(booking) : null
}

export async function savePlannerRecord(table: string, value: Record<string, unknown>, id?: string, conflict?: string, expectedRevision?: number) {
  const path = id
    ? `${table}?select=*&id=eq.${escapeFilter(id)}${Number.isInteger(expectedRevision) ? `&revision=eq.${expectedRevision}` : ''}`
    : conflict ? `${table}?on_conflict=${conflict}&select=*` : `${table}?select=*`
  const [saved] = await supabaseRestStrict<PlannerRecord[]>(path, {
    method: id ? 'PATCH' : 'POST',
    headers: { Prefer: conflict ? 'resolution=ignore-duplicates,return=representation' : 'return=representation' },
    body: JSON.stringify(value),
  })
  return saved ?? null
}

export async function deletePlannerRecord(table: string, id: string) {
  await supabaseRestStrict<unknown>(`${table}?id=eq.${escapeFilter(id)}`, { method: 'DELETE' })
}

export async function listPlannerChecklistItems(checklistId: string) {
  return supabaseRestStrict<PlannerRecord[]>(`luxor_planner_checklist_items?select=*&checklist_id=eq.${escapeFilter(checklistId)}&order=sort_order.asc`)
}

export async function getPlannerDesign(id: string) {
  const [design] = await supabaseRestStrict<PlannerRecord[]>(`luxor_planner_designs?select=*&id=eq.${escapeFilter(id)}&limit=1`)
  return design ?? null
}

export async function getPlannerRecord(table: string, id: string) {
  const [record] = await supabaseRestStrict<PlannerRecord[]>(`${table}?select=*&id=eq.${escapeFilter(id)}&limit=1`)
  return record ?? null
}

export async function snapshotPlannerDesignAssets(designId: string, revision: number, email: string, excludeFileId?: string) {
  const files = await supabaseRestStrict<PlannerRecord[]>(`luxor_planner_files?select=*&design_id=eq.${escapeFilter(designId)}&category=neq.design_revision_snapshot&order=created_at.asc`)
  const snapshotSources = files.filter((file) => file.id !== excludeFileId)
  if (!snapshotSources.length) return { assets: [], cleanup: async () => undefined }
  const storageUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!storageUrl || !key) throw new Error('Private Planner file storage is not configured.')
  const objects: string[] = []
  const metadata: string[] = []
  const assets: Record<string, unknown>[] = []
  const cleanup = async () => {
    if (metadata.length) await supabaseRestStrict<unknown>(`luxor_planner_files?id=in.(${metadata.map(encodeURIComponent).join(',')})`, { method: 'DELETE' }).catch(() => undefined)
    await Promise.all(objects.map((path) => fetch(`${storageUrl}/storage/v1/object/luxor-planner-files/${path}`, { method:'DELETE', headers:{apikey:key,Authorization:`Bearer ${key}`}, cache:'no-store' }).catch(() => undefined)))
  }
  try {
    for (const file of snapshotSources) {
      const sourcePath = String(file.storage_path || '')
      const source = await fetch(`${storageUrl}/storage/v1/object/luxor-planner-files/${sourcePath}`, { headers:{apikey:key,Authorization:`Bearer ${key}`}, cache:'no-store' })
      if (!source.ok) throw new Error('A current design attachment could not be read for revision history.')
      const snapshotId = crypto.randomUUID()
      const filename = String(file.file_name || 'design-file').replace(/[^a-zA-Z0-9 ._-]/g,'_').trim().slice(0,180) || 'design-file'
      const snapshotPath = `${snapshotId}/${encodeURIComponent(filename)}`
      const stored = await fetch(`${storageUrl}/storage/v1/object/luxor-planner-files/${snapshotPath}`, { method:'POST', headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':String(file.content_type),'x-upsert':'false'}, body:new Uint8Array(await source.arrayBuffer()), cache:'no-store' })
      if (!stored.ok) throw new Error('A design attachment could not be snapshotted.')
      objects.push(snapshotPath)
      const [saved] = await supabaseRestStrict<PlannerRecord[]>('luxor_planner_files?select=*', { method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify({
        id:snapshotId,booking_id:null,vendor_id:null,design_id:designId,event_vendor_id:null,category:'design_revision_snapshot',
        title:`Revision ${revision}: ${String(file.title || filename)}`.slice(0,200),file_name:filename,storage_path:snapshotPath,
        content_type:file.content_type,size_bytes:file.size_bytes,expires_at:null,internal_only:true,uploaded_by:email,
        created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      }) })
      if (!saved) throw new Error('Design revision attachment metadata could not be saved.')
      metadata.push(String(saved.id))
      assets.push({id:saved.id,source_file_id:file.id,title:file.title,file_name:filename,content_type:file.content_type,size_bytes:file.size_bytes,storage_path:snapshotPath})
    }
    return { assets, cleanup }
  } catch (error) { await cleanup(); throw error }
}

export function buildPlannerDesignRevisionSnapshot(
  prior: Record<string, unknown>,
  revision: number,
  assets: Record<string, unknown>[],
  savedAt = new Date().toISOString(),
) {
  const currentContent = prior.content && typeof prior.content === 'object' && !Array.isArray(prior.content)
    ? { ...(prior.content as Record<string, unknown>) }
    : {}
  delete currentContent.revision_history
  return {
    revision,
    saved_at: savedAt,
    name: prior.name,
    event_type: prior.event_type,
    design_style: prior.design_style,
    palette: prior.palette,
    guest_count_min: prior.guest_count_min,
    guest_count_max: prior.guest_count_max,
    description: prior.description,
    internal_notes: prior.internal_notes,
    status: prior.status,
    approved_revision: prior.approved_revision,
    approved_at: prior.approved_at,
    content: currentContent,
    assets,
  }
}

export async function commitPlannerDesignAttachmentChange(input: {
  designId: string
  expectedRevision: number
  operation: 'upload' | 'delete'
  snapshot: Record<string, unknown>
  file?: Record<string, unknown>
  fileId?: string
}) {
  try {
    return await supabaseRestStrict<{
      committed: boolean
      reason?: string
      current_revision?: number
      design?: PlannerRecord
      file?: PlannerRecord | null
      deleted_storage_path?: string | null
    }>('rpc/luxor_planner_commit_attachment_change', {
      method: 'POST',
      body: JSON.stringify({
        p_design_id: input.designId,
        p_expected_revision: input.expectedRevision,
        p_operation: input.operation,
        p_revision_snapshot: input.snapshot,
        p_file: input.file ?? null,
        p_file_id: input.fileId ?? null,
      }),
    })
  } catch (error) {
    throw new PlannerMutationOutcomeUnknownError('Planner attachment commit outcome is unknown.', error)
  }
}

export async function commitPlannerDesignRevision(input: {
  designId: string
  expectedRevision: number
  snapshot: Record<string, unknown>
  design: Record<string, unknown>
}) {
  try {
    return await supabaseRestStrict<{
      committed: boolean
      reason?: string
      current_revision?: number
      design?: PlannerRecord
    }>('rpc/luxor_planner_save_design_revision', {
      method: 'POST',
      body: JSON.stringify({
        p_design_id: input.designId,
        p_expected_revision: input.expectedRevision,
        p_revision_snapshot: input.snapshot,
        p_design: input.design,
      }),
    })
  } catch (error) {
    throw new PlannerMutationOutcomeUnknownError('Planner design commit outcome is unknown.', error)
  }
}

export async function publishPlannerDesignCopy(design: Record<string, unknown>, files: Record<string, unknown>[]) {
  try {
    return await supabaseRestStrict<{
      published: boolean
      design?: PlannerRecord
      files?: PlannerRecord[]
    }>('rpc/luxor_planner_publish_design_copy', {
      method: 'POST',
      body: JSON.stringify({ p_design: design, p_files: files }),
    })
  } catch (error) {
    // A timeout can arrive after Postgres committed. The caller must retain
    // the staged private storage objects unless the transaction is confirmed
    // to have failed, since published rows may already reference them.
    throw new PlannerMutationOutcomeUnknownError('Planner design copy publication outcome is unknown.', error)
  }
}
