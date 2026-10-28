import 'server-only'

import type { LuxorBooking, LuxorInvoice, LuxorPaymentInstallment, LuxorProposalPaymentPlan } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { calculateLuxorPaymentSchedule, paymentPlanFromSchedule } from './luxorPaymentSchedule'
import { luxorCalendarDate } from './luxorProposalTerms'

const FIRST_DEPOSIT_SCHEDULE_POLICY = 'first_deposit_paid_at_v1'

function planFrom(invoice: LuxorInvoice) {
  const context = (invoice.proposal_context || {}) as Record<string, unknown>
  return { context, plan: context.payment_plan as Record<string, unknown> | null | undefined }
}

export async function listLuxorPaymentInstallments(bookingId: string) {
  if (!bookingId) return []
  return supabaseRest<LuxorPaymentInstallment[]>(`luxor_payment_installments?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&status=neq.void&order=installment_order.asc&limit=24`)
}

async function updateScheduleState(invoiceId: string, state: 'ready' | 'review_required', bookingDate?: string, reason?: string) {
  const [invoice] = await supabaseRest<LuxorInvoice[]>(`luxor_invoices?select=*&id=eq.${encodeURIComponent(invoiceId)}&limit=1`)
  if (!invoice) return
  const context = (invoice.proposal_context || {}) as Record<string, unknown>
  const rawPlan = context.payment_plan && typeof context.payment_plan === 'object' ? context.payment_plan as Record<string, unknown> : null
  if (rawPlan?.schedule_anchor_policy !== FIRST_DEPOSIT_SCHEDULE_POLICY) return
  const nextPlan: Record<string, unknown> = { ...rawPlan, schedule_status: state }
  if (bookingDate) nextPlan.booking_date = bookingDate
  if (state === 'review_required' && reason) nextPlan.schedule_review_reason = reason
  else delete nextPlan.schedule_review_reason
  const rawSelection = context.pricing_selection && typeof context.pricing_selection === 'object' ? context.pricing_selection as Record<string, unknown> : {}
  const rawSelectedPlan = rawSelection.paymentPlan && typeof rawSelection.paymentPlan === 'object' ? rawSelection.paymentPlan as Record<string, unknown> : {}
  await supabaseRest<LuxorInvoice[]>(`luxor_invoices?id=eq.${encodeURIComponent(invoice.id)}&updated_at=eq.${encodeURIComponent(invoice.updated_at)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      proposal_context: {
        ...context,
        payment_plan: nextPlan,
        pricing_selection: { ...rawSelection, paymentPlan: { ...rawSelectedPlan, ...nextPlan } },
      },
      updated_at: new Date().toISOString(),
    }),
  })
}

export function usesFirstDepositScheduleAnchor(invoice: LuxorInvoice) {
  return planFrom(invoice).plan?.schedule_anchor_policy === FIRST_DEPOSIT_SCHEDULE_POLICY
}

/** Creates or refreshes only unpaid scheduled event installments. */
export async function syncLuxorPaymentInstallments(input: { booking: LuxorBooking; invoice: LuxorInvoice }) {
  const { context, plan } = planFrom(input.invoice)
  const eventDate = typeof context.event_date === 'string' ? context.event_date : input.booking.event_date
  const existing = await listLuxorPaymentInstallments(input.booking.id)
  const persistedAnchor = existing.find((item) => item.metadata?.schedule_anchor_policy === FIRST_DEPOSIT_SCHEDULE_POLICY)?.metadata?.schedule_anchor_date
  const depositPaidAt = typeof input.booking.metadata?.deposit_paid_at === 'string' ? input.booking.metadata.deposit_paid_at : null
  const firstDepositSchedule = usesFirstDepositScheduleAnchor(input.invoice)
  const hasConfirmedDepositAnchor = Boolean(depositPaidAt || typeof persistedAnchor === 'string')
  if (firstDepositSchedule && !depositPaidAt && typeof persistedAnchor !== 'string') return []
  if (plan?.mode === 'pay_in_full') return []
  const anchorTimestamp = depositPaidAt
  const bookingDate = firstDepositSchedule
    ? typeof persistedAnchor === 'string' ? persistedAnchor : anchorTimestamp ? luxorCalendarDate(new Date(anchorTimestamp)) : ''
    : input.booking.created_at.slice(0, 10)
  const venue = Number(context.venue_services_total || 0)
  const scheduledVenue = Math.min(venue, Number(input.invoice.total || 0))
  const event = Math.max(0, Number(input.invoice.total || 0) - scheduledVenue)
  const count = plan && typeof plan === 'object' && Number.isInteger(Number(plan.payment_count)) ? Number(plan.payment_count) : 4
  const cadence = plan && typeof plan === 'object' && (plan.payment_cadence === 'biweekly' || plan.payment_cadence === 'monthly' || plan.payment_cadence === 'evenly_spaced')
    ? plan.payment_cadence
    : 'evenly_spaced'
  const bookingPaymentAmount = plan && typeof plan === 'object' && Number.isFinite(Number(plan.booking_payment_amount))
    ? Number(plan.booking_payment_amount)
    : undefined
  if (!eventDate || !Number.isFinite(venue) || !Number.isFinite(event)) {
    if (firstDepositSchedule && hasConfirmedDepositAnchor) await updateScheduleState(input.invoice.id, 'review_required', bookingDate || undefined, 'invalid_schedule_inputs')
    return []
  }
  const schedule = calculateLuxorPaymentSchedule({ eventDate, bookingDate, venueServicesTotal: scheduledVenue, eventServicesTotal: event, paymentCount: count, paymentCadence: cadence, bookingPaymentAmount })
  if (!schedule || !bookingDate) {
    if (firstDepositSchedule && hasConfirmedDepositAnchor) await updateScheduleState(input.invoice.id, 'review_required', bookingDate || undefined, 'deadline_window')
    return []
  }
  const rows: LuxorPaymentInstallment[] = []
  for (const row of schedule.rows) {
    const current = existing.find((item) => item.installment_order === row.installment_order && item.status !== 'void')
    if (current?.status === 'paid' || current?.status === 'partial') { rows.push(current); continue }
    const payload = {
      booking_id: input.booking.id,
      invoice_id: input.invoice.id,
      inquiry_id: input.invoice.inquiry_id,
      label: row.label,
      installment_order: row.installment_order,
      amount: row.amount,
      due_at: `${row.due_at}T12:00:00.000Z`,
      status: firstDepositSchedule && row.installment_order === 1 ? 'paid' : 'scheduled',
      ...(firstDepositSchedule && row.installment_order === 1 && anchorTimestamp ? { paid_at: anchorTimestamp } : {}),
      metadata: {
        payment_bucket: row.payment_bucket,
        allocation: row.allocation,
        schedule_version: firstDepositSchedule ? 2 : 1,
        ...(firstDepositSchedule ? { schedule_anchor_policy: FIRST_DEPOSIT_SCHEDULE_POLICY, schedule_anchor_date: bookingDate } : {}),
      },
      updated_at: new Date().toISOString(),
    }
    if (current) {
      const [updated] = await supabaseRest<LuxorPaymentInstallment[]>(`luxor_payment_installments?id=eq.${encodeURIComponent(current.id)}&status=in.(scheduled,sent)&updated_at=eq.${encodeURIComponent(current.updated_at)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
      if (updated) rows.push(updated)
      else {
        const fresh = (await listLuxorPaymentInstallments(input.booking.id)).find((item) => item.id === current.id)
        if (!fresh) throw new Error('Payment installment changed while the schedule was being updated.')
        rows.push(fresh)
      }
    } else {
      try {
        const [created] = await supabaseRest<LuxorPaymentInstallment[]>('luxor_payment_installments?select=*', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) })
        if (!created) throw new Error('Payment installment could not be saved.')
        rows.push(created)
      } catch (error) {
        if (!(error instanceof Error) || !/duplicate key|unique constraint/i.test(error.message)) throw error
        const fresh = (await listLuxorPaymentInstallments(input.booking.id)).find((item) => item.installment_order === row.installment_order)
        if (!fresh) throw error
        rows.push(fresh)
      }
    }
  }

  if (firstDepositSchedule && rows.length === schedule.rows.length) {
    const [freshInvoice] = await supabaseRest<LuxorInvoice[]>(`luxor_invoices?select=*&id=eq.${encodeURIComponent(input.invoice.id)}&limit=1`)
    const latestContext = (freshInvoice?.proposal_context || {}) as Record<string, unknown>
    const latestPlan = latestContext.payment_plan && typeof latestContext.payment_plan === 'object'
      ? latestContext.payment_plan as Record<string, unknown>
      : null
    if (freshInvoice && latestPlan?.schedule_anchor_policy === FIRST_DEPOSIT_SCHEDULE_POLICY) {
      const scheduledPlan = paymentPlanFromSchedule(schedule, FIRST_DEPOSIT_SCHEDULE_POLICY)
      const rowsForContext = schedule.rows.map((scheduled) => {
        const saved = rows.find((item) => item.installment_order === scheduled.installment_order)
        const savedDate = typeof saved?.due_at === 'string' ? saved.due_at.slice(0, 10) : scheduled.due_at
        const savedBucket = saved?.metadata?.payment_bucket
        return {
          installment_order: scheduled.installment_order,
          label: saved?.label || scheduled.label,
          description: scheduled.description,
          amount: Number.isFinite(Number(saved?.amount)) ? Number(saved?.amount) : scheduled.amount,
          due_at: savedDate,
          payment_bucket: savedBucket === 'event' ? 'event' as const : savedBucket === 'venue' ? 'venue' as const : scheduled.payment_bucket,
        }
      })
      const nextPlan: Record<string, unknown> = { ...latestPlan, ...scheduledPlan, schedule_rows: rowsForContext, schedule_status: 'ready' }
      delete nextPlan.schedule_review_reason
      const nextPricingSelection = latestContext.pricing_selection && typeof latestContext.pricing_selection === 'object'
        ? latestContext.pricing_selection as Record<string, unknown>
        : {}
      const currentRows = Array.isArray(latestPlan.schedule_rows) ? latestPlan.schedule_rows : []
      const sameRows = JSON.stringify(currentRows) === JSON.stringify(rowsForContext)
      if (!sameRows || latestPlan.booking_date !== bookingDate || latestPlan.payment_count !== schedule.payment_count || latestPlan.schedule_status !== 'ready' || latestPlan.schedule_review_reason) {
        const nextContext = {
          ...latestContext,
          payment_plan: nextPlan as unknown as LuxorProposalPaymentPlan,
        pricing_selection: {
          ...nextPricingSelection,
          paymentPlan: {
            ...(nextPricingSelection.paymentPlan && typeof nextPricingSelection.paymentPlan === 'object' ? nextPricingSelection.paymentPlan as Record<string, unknown> : {}),
            ...nextPlan,
          },
        },
        }
        await supabaseRest<LuxorInvoice[]>(`luxor_invoices?id=eq.${encodeURIComponent(freshInvoice.id)}&updated_at=eq.${encodeURIComponent(freshInvoice.updated_at)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ proposal_context: nextContext, updated_at: new Date().toISOString() }),
        })
      }
    }
  }
  return rows
}
