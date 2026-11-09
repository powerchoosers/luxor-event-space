import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession, getVerifiedLuxorPortalSession, isAuthorizedLuxorPortalEmail } from '@/lib/luxorPortalAuth'
import { supabaseRest, supabaseRestStrict } from '@/lib/supabaseRestServer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'no-store' }

export async function GET(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401, headers })
  const verified = await getVerifiedLuxorPortalSession()
  const enabled = process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED === 'true'
  const canResolve = enabled && Boolean(verified && verified.email === session.email && isAuthorizedLuxorPortalEmail(session.email))
  const unavailableDetail = enabled ? 'An authorized staff session is required to stop this workflow.' : 'Workflow resolution is currently disabled.'
  const inquiryId = request.nextUrl.searchParams.get('inquiryId') || ''
  if (!UUID.test(inquiryId)) return NextResponse.json({ error: 'Invalid inquiry.' }, { status: 400, headers })
  try {
    if (!enabled) {
      // Review remains read-only while ordered workflows are disabled. Use the
      // tolerant GET helper only for optional review tables; unrelated database
      // errors still reach the 503 below.
      const [slots, customHolds, audit] = await Promise.all([
        supabaseRest<Array<{ id: string }>>(`luxor_workflow_contact_slots?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&status=eq.held&limit=2`),
        supabaseRest<Array<{ id: string }>>(`luxor_custom_workflow_enrollments?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&status=eq.held&limit=2`),
        supabaseRest<Array<{ actor_email: string; action_kind: string; action_status: string; reason: string; created_at: string }>>(`luxor_workflow_resolution_audit?select=actor_email,action_kind,action_status,reason,created_at&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=5`),
      ])
      const review = slots.length || customHolds.length ? 'A workflow action needs review before it can continue.' : null
      return NextResponse.json({ review, resolution: null, audit }, { headers })
    }
    const [slots, enrollments, customHolds, audit, deferred] = await Promise.all([
      supabaseRestStrict<Array<{ id: string; workflow_kind: string; enrollment_id: string; action_kind: 'call' | 'email' | 'text'; action_id: string | null }>>(`luxor_workflow_contact_slots?select=id,workflow_kind,enrollment_id,action_kind,action_id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&status=eq.held&limit=2`),
      supabaseRestStrict<Array<{ id: string }>>(`luxor_follow_up_enrollments?select=id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&ordered_progression_required=eq.true&status=eq.active&limit=10`),
      supabaseRestStrict<Array<{ id: string; current_step_id: string }>>(`luxor_custom_workflow_enrollments?select=id,current_step_id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&call_completion_required=eq.true&status=eq.held&limit=2`),
      supabaseRestStrict<Array<{ actor_email: string; action_kind: string; action_status: string; reason: string; created_at: string }>>(`luxor_workflow_resolution_audit?select=actor_email,action_kind,action_status,reason,created_at&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc&limit=5`),
      // The initial drain-fence table has no status column. The optional replay
      // migration adds it later, so selecting/filtering by status breaks review
      // as soon as ordered workflows are enabled on the initial schema.
      enabled ? supabaseRestStrict<Array<{ status?: unknown }>>(`luxor_ordered_deferred_enrollment_draft?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1000`) : Promise.resolve([]),
    ])
    if (!slots.length && customHolds.length === 1 && customHolds[0].current_step_id) {
      const held = customHolds[0]
        slots.push(...await supabaseRestStrict<typeof slots>(`luxor_workflow_contact_slots?select=id,workflow_kind,enrollment_id,action_kind,action_id&inquiry_id=eq.${encodeURIComponent(inquiryId)}&workflow_kind=eq.custom&enrollment_id=eq.${encodeURIComponent(held.id)}&step_key=eq.${encodeURIComponent(held.current_step_id)}&status=eq.completed&limit=2`))
    }
    if (slots.length || customHolds.length) {
      let resolution: { slotId?: string; enrollmentId?: string; workflowKind?: string; canStop: boolean; detail: string } | null = null
      const slot = slots.length === 1 ? slots[0] : null
      if (slot && UUID.test(slot.id) && ['call','email','text'].includes(slot.action_kind)) {
        const table = slot.action_kind === 'call' ? 'luxor_tasks' : slot.action_kind === 'email' ? 'luxor_email_jobs' : 'luxor_text_jobs'
        const [action] = slot.action_id && UUID.test(slot.action_id)
          ? await supabaseRestStrict<Array<{ status: string }>>(`${table}?select=status&id=eq.${encodeURIComponent(slot.action_id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`)
          : []
        const status = slot.action_id ? action?.status : 'not_created'
        const terminal = slot.action_kind === 'call' ? ['completed','cancelled'] : slot.action_kind === 'email' ? ['sent','failed','cancelled'] : ['sent','delivered','undelivered','failed','cancelled','skipped']
        const terminalAction = status === 'not_created' || Boolean(status && terminal.includes(status))
        const canStop = canResolve && terminalAction
        const detail = !terminalAction ? 'This action is pending, sending, or unavailable. Establish its outcome before stopping.'
          : !canResolve ? unavailableDetail
          : status === 'failed' && slot.action_kind !== 'call' ? 'The send failed or its outcome is uncertain. Check provider history before taking any further action.'
            : status === 'not_created' ? 'No task or message was created for this action.'
              : `Current ${slot.action_kind} status: ${status}.`
        resolution = { slotId: slot.id, canStop, detail }
      }
      if (!slot && !slots.length && customHolds.length === 1 && UUID.test(customHolds[0].id)) {
        const enrollmentId = customHolds[0].id
        const status = await supabaseRest<string>('rpc/luxor_workflow_enrollment_review_status', { method: 'POST', body: JSON.stringify({ p_inquiry_id: inquiryId, p_enrollment_id: enrollmentId, p_kind: 'custom' }) })
        resolution = { enrollmentId, workflowKind: 'custom', canStop: canResolve && status === 'ready', detail: status !== 'ready' ? 'A task or message may still be active. Establish its outcome before stopping.' : !canResolve ? unavailableDetail : 'No active task or message remains in this workflow. Review the contact and delivery history before stopping.' }
      }
      return NextResponse.json({ review: 'A workflow action needs review before it can continue.', resolution, audit }, { headers })
    }
    // Unknown or truncated states fail closed rather than reporting no hold.
    if (deferred.length >= 1000 || deferred.some((item) => item.status !== undefined && item.status !== 'pending' && item.status !== 'completed')) {
      return NextResponse.json({ review: 'A deferred brochure follow-up needs review before it can be started.', resolution: null, audit }, { headers })
    }
    if (deferred.some((item) => item.status === undefined || item.status === 'pending')) {
      return NextResponse.json({ review: 'A brochure follow-up is waiting for workflow processing. Its schedule is not yet set.', resolution: null, audit }, { headers })
    }
    if (!enrollments.length) return NextResponse.json({ review: null, audit }, { headers })
    const ids = enrollments.map((enrollment) => enrollment.id).filter((id) => UUID.test(id)).join(',')
    if (!ids) return NextResponse.json({ review: null, audit }, { headers })
    const states = await supabaseRest<Array<{ enrollment_id: string; reason: string }>>(`luxor_ordered_brochure_recovery_state?select=enrollment_id,reason&enrollment_id=in.(${ids})&limit=10`)
    const reason = states.find((state) => ['identity_review', 'legacy_work_present'].includes(state.reason))?.reason
    const review = reason === 'identity_review'
      ? 'This contact needs identity review before the workflow can continue.'
      : reason === 'legacy_work_present'
        ? 'Existing follow-up work must be reviewed before this workflow can continue.'
        : states.some((state) => ['setup_incomplete', 'missing_inquiry', 'terminal_step', 'progression_error'].includes(state.reason))
          ? 'The workflow could not advance and needs review.' : null
    let resolution: { enrollmentId: string; workflowKind: string; canStop: boolean; detail: string } | null = null
    if (review && states.length === 1 && UUID.test(states[0].enrollment_id)) {
      const enrollmentId = states[0].enrollment_id
      const status = await supabaseRest<string>('rpc/luxor_workflow_enrollment_review_status', { method: 'POST', body: JSON.stringify({ p_inquiry_id: inquiryId, p_enrollment_id: enrollmentId, p_kind: 'system' }) })
      resolution = { enrollmentId, workflowKind: 'system', canStop: canResolve && status === 'ready', detail: status !== 'ready' ? 'A task or message may still be active. Establish its outcome before stopping.' : !canResolve ? unavailableDetail : 'No active task or message remains in this workflow. Existing follow-up work is left as it is.' }
    }
    return NextResponse.json({ review, resolution, audit }, { headers })
  } catch {
    return NextResponse.json({ error: 'Workflow review status could not be loaded.' }, { status: 503, headers })
  }
}

export async function POST(request: NextRequest) {
  const verified = await getVerifiedLuxorPortalSession()
  const session = verified ? await getLuxorPortalSession() : null
  if (!verified || !session || verified.email !== session.email || !isAuthorizedLuxorPortalEmail(session.email)) {
    return NextResponse.json({ error: 'An authorized staff session is required.' }, { status: 401, headers })
  }
  if (request.headers.get('origin') !== request.nextUrl.origin || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers })
  }
  if (process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED !== 'true') return NextResponse.json({ error: 'Workflow resolution is disabled.' }, { status: 409, headers })
  try {
    const body = await request.json() as { inquiryId?: unknown; slotId?: unknown; enrollmentId?: unknown; workflowKind?: unknown; acknowledged?: unknown }
    const validSlot = typeof body.slotId === 'string' && UUID.test(body.slotId)
    const validEnrollment = typeof body.enrollmentId === 'string' && UUID.test(body.enrollmentId) && (body.workflowKind === 'custom' || body.workflowKind === 'system')
    if (typeof body.inquiryId !== 'string' || !UUID.test(body.inquiryId) || validSlot === validEnrollment || body.acknowledged !== true) {
      return NextResponse.json({ error: 'Review and confirm the workflow action.' }, { status: 400, headers })
    }
    const result = await supabaseRest<string>(validSlot ? 'rpc/luxor_workflow_stop_reviewed_slot' : 'rpc/luxor_workflow_stop_reviewed_enrollment', {
      method: 'POST', body: JSON.stringify(validSlot ? { p_inquiry_id: body.inquiryId, p_slot_id: body.slotId, p_actor_email: session.email } : { p_inquiry_id: body.inquiryId, p_enrollment_id: body.enrollmentId, p_kind: body.workflowKind, p_actor_email: session.email }),
    })
    if (result !== 'stopped') return NextResponse.json({ error: 'The workflow changed or its action is not ready to stop. Refresh and review its current status.' }, { status: 409, headers })
    return NextResponse.json({ stopped: true }, { headers })
  } catch {
    return NextResponse.json({ error: 'Workflow resolution could not be saved.' }, { status: 503, headers })
  }
}
