import type { ReactNode } from 'react'
import {
  Building2,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  Info,
  Landmark,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react'
import { PortalCalculationSkeleton, PortalSkeleton } from '@/components/portal/PortalUI'
import type { LuxorProposalPaymentPlan } from '@/lib/luxorInquiryTypes'

type DateValue = string | null | undefined

export type ProposalPaymentScheduleProps = {
  /** The approved client-facing event price. The refundable deposit is excluded. */
  finalEventPrice?: number | null
  /** Display-only pricing bucket for the proposal breakdown. */
  venueServicesTotal?: number | null
  /** Display-only pricing bucket for the proposal breakdown. */
  eventServicesTotal?: number | null
  /** Kept separate from the event price and held under the signed agreement. */
  refundableSecurityDeposit?: number | null
  /**
   * The owner-entered terms. A partial plan is rendered as an honest
   * in-progress schedule, while calculation still withholds any amounts until
   * it becomes an approved, complete plan.
   */
  paymentPlan?: Partial<LuxorProposalPaymentPlan> | null
  /** An explicit final-balance date. It wins over the days-before-event term. */
  finalPaymentDueDate?: DateValue
  eventDate?: DateValue
  /** Optional exact copy for the service-bucket explanation. */
  eventServicesPaymentNote?: string | null
  className?: string
}

export type ProposalPaymentScheduleRow = {
  id: 'initial-contract-payment' | 'refundable-security-deposit' | 'final-event-balance'
  number: number
  description: string
  dueDate: string | null
  dueTiming: 'after_signature' | 'final_due_date' | 'not_due'
  amount: number
  collection: string
}

export type ProposalPaymentScheduleCalculation = {
  finalEventPrice: number | null
  venueServicesTotal: number | null
  eventServicesTotal: number | null
  refundableSecurityDeposit: number
  initialContractPayment: number | null
  finalEventBalance: number | null
  amountDueAfterSignature: number | null
  finalPaymentDueDate: string | null
  finalPaymentDueDateSource: 'explicit' | 'event_date' | null
  rows: ProposalPaymentScheduleRow[]
  errors: string[]
}

const DEFAULT_REFUNDABLE_SECURITY_DEPOSIT = 750
const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function normalizedMoney(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100) / 100
}

function toCents(value: number) {
  return Math.round(value * 100)
}

function fromCents(value: number) {
  return Math.round(value) / 100
}

function normalizeDate(value: DateValue) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return `${match[1]}-${match[2]}-${match[3]}`
}

function dateBeforeEvent(eventDate: string | null, daysBeforeEvent: number | null) {
  if (!eventDate || daysBeforeEvent === null || !Number.isInteger(daysBeforeEvent) || daysBeforeEvent < 0) return null
  const [year, month, day] = eventDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - daysBeforeEvent)

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function formatMoney(value: number | null) {
  return value === null ? '—' : moneyFormatter.format(value)
}

function formatDate(value: string | null) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

/**
 * Mirrors the live collection flow: an initial contract payment and the
 * refundable security deposit are collected after signature; the remaining
 * final-event balance is due on the configured final-payment date. It does not
 * invent monthly or equal-installment dates that the backend does not create.
 */
export function calculateProposalPaymentSchedule({
  finalEventPrice,
  venueServicesTotal,
  eventServicesTotal,
  refundableSecurityDeposit = DEFAULT_REFUNDABLE_SECURITY_DEPOSIT,
  paymentPlan,
  finalPaymentDueDate,
  eventDate,
}: ProposalPaymentScheduleProps): ProposalPaymentScheduleCalculation {
  const normalizedFinalEventPrice = normalizedMoney(finalEventPrice)
  const normalizedVenueServicesTotal = normalizedMoney(venueServicesTotal)
  const normalizedEventServicesTotal = normalizedMoney(eventServicesTotal)
  const normalizedSecurityDeposit = normalizedMoney(refundableSecurityDeposit) ?? DEFAULT_REFUNDABLE_SECURITY_DEPOSIT
  const normalizedEventDate = normalizeDate(eventDate)
  const explicitFinalPaymentDueDate = normalizeDate(finalPaymentDueDate)
  const finalPaymentDaysBeforeEvent = typeof paymentPlan?.final_payment_due_days_before_event === 'number'
    ? paymentPlan.final_payment_due_days_before_event
    : null
  const derivedFinalPaymentDueDate = dateBeforeEvent(normalizedEventDate, finalPaymentDaysBeforeEvent)
  const resolvedFinalPaymentDueDate = explicitFinalPaymentDueDate || derivedFinalPaymentDueDate
  const finalPaymentDueDateSource = explicitFinalPaymentDueDate
    ? 'explicit'
    : derivedFinalPaymentDueDate
      ? 'event_date'
      : null
  const errors: string[] = []

  if (normalizedFinalEventPrice === null) {
    errors.push('Final Event Price is needed to calculate the payment schedule.')
  }

  const planMode = paymentPlan?.mode
  if (planMode !== 'pay_in_full' && planMode !== 'deposit_and_balance') {
    errors.push('Choose the owner-approved payment plan.')
  }

  const finalEventPriceCents = normalizedFinalEventPrice === null ? null : toCents(normalizedFinalEventPrice)
  let initialContractPaymentCents: number | null = null
  let finalEventBalanceCents: number | null = null

  if (finalEventPriceCents !== null && planMode === 'pay_in_full') {
    initialContractPaymentCents = finalEventPriceCents
    finalEventBalanceCents = 0
  }

  if (finalEventPriceCents !== null && planMode === 'deposit_and_balance') {
    const bookingPaymentPercent = paymentPlan?.booking_payment_percent ?? Number.NaN
    const hasValidBookingPercent = Number.isFinite(bookingPaymentPercent) && bookingPaymentPercent > 0 && bookingPaymentPercent <= 100

    if (!hasValidBookingPercent) {
      errors.push('Enter the approved initial contract-payment percentage.')
    } else {
      initialContractPaymentCents = Math.round(finalEventPriceCents * bookingPaymentPercent / 100)
      finalEventBalanceCents = Math.max(finalEventPriceCents - initialContractPaymentCents, 0)
    }
  }

  if (finalEventBalanceCents !== null && finalEventBalanceCents > 0 && !resolvedFinalPaymentDueDate) {
    errors.push('Set the final payment due date, or provide an event date and approved days-before-event term.')
  }

  const rows: ProposalPaymentScheduleRow[] = initialContractPaymentCents === null || finalEventBalanceCents === null
    ? []
    : [
      {
        id: 'initial-contract-payment',
        number: 1,
        description: planMode === 'pay_in_full' ? 'Final Event Price paid in full' : `Initial contract payment (${paymentPlan?.booking_payment_percent}%)`,
        dueDate: null,
        dueTiming: 'after_signature',
        amount: fromCents(initialContractPaymentCents),
        collection: 'Stripe link',
      },
      {
        id: 'refundable-security-deposit',
        number: 2,
        description: 'Refundable security deposit — held separately',
        dueDate: null,
        dueTiming: 'after_signature',
        amount: normalizedSecurityDeposit,
        collection: 'Stripe link',
      },
      {
        id: 'final-event-balance',
        number: 3,
        description: finalEventBalanceCents === 0 ? 'Final Event Price balance — paid in full' : 'Final Event Price balance',
        dueDate: finalEventBalanceCents === 0 ? null : resolvedFinalPaymentDueDate,
        dueTiming: finalEventBalanceCents === 0 ? 'not_due' : 'final_due_date',
        amount: fromCents(finalEventBalanceCents),
        collection: finalEventBalanceCents === 0 ? '—' : 'Stripe link',
      },
    ]

  return {
    finalEventPrice: normalizedFinalEventPrice,
    venueServicesTotal: normalizedVenueServicesTotal,
    eventServicesTotal: normalizedEventServicesTotal,
    refundableSecurityDeposit: normalizedSecurityDeposit,
    initialContractPayment: initialContractPaymentCents === null ? null : fromCents(initialContractPaymentCents),
    finalEventBalance: finalEventBalanceCents === null ? null : fromCents(finalEventBalanceCents),
    amountDueAfterSignature: initialContractPaymentCents === null ? null : fromCents(initialContractPaymentCents + toCents(normalizedSecurityDeposit)),
    finalPaymentDueDate: resolvedFinalPaymentDueDate,
    finalPaymentDueDateSource,
    rows,
    errors,
  }
}

function FinancialStat({
  icon,
  label,
  value,
  detail,
  highlighted = false,
  loading = false,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  highlighted?: boolean
  loading?: boolean
}) {
  return (
    <div className={`min-w-0 rounded-xl border p-4 ${highlighted ? 'border-[#caa24c]/35 bg-[#caa24c]/[0.07]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]'}`}>
      <div className="flex items-center gap-2 text-[color:var(--portal-muted)]">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${highlighted ? 'bg-[#caa24c]/12 text-[#8c6529] dark:text-[#f1d27a]' : 'bg-[color:var(--portal-soft)]'}`}>{icon}</span>
        <p className="text-[9px] font-black uppercase tracking-[0.12em]">{label}</p>
      </div>
      {loading ? <PortalSkeleton className="mt-3 h-6 w-24 rounded" /> : <p className={`mt-3 font-mono text-xl font-black tabular-nums ${highlighted ? 'text-[#8c6529] dark:text-[#f1d27a]' : 'text-[color:var(--portal-text)]'}`}>{value}</p>}
      <p className="mt-1 text-[11px] leading-4 text-[color:var(--portal-muted)]">{detail}</p>
    </div>
  )
}

function PaymentTiming({ row }: { row: ProposalPaymentScheduleRow }) {
  if (row.dueTiming === 'after_signature') return <span className="font-medium text-[#8c6529] dark:text-[#f1d27a]">After agreement signature</span>
  if (row.dueTiming === 'not_due') return <span className="font-medium text-[color:var(--portal-muted)]">No balance remains</span>
  if (row.dueDate) return <span className="font-medium text-[color:var(--portal-text)]">{formatDate(row.dueDate)}</span>
  return <span className="font-medium text-amber-800 dark:text-amber-200">Set final due date</span>
}

/**
 * Read-only portal presentation of the approved financial terms. Controls for
 * selecting terms and dates intentionally stay in the proposal builder, which
 * lets this component be reused in review and preview states without changing
 * a proposal's money or collection behavior.
 */
export function ProposalPaymentSchedule({
  finalEventPrice,
  venueServicesTotal,
  eventServicesTotal,
  refundableSecurityDeposit = DEFAULT_REFUNDABLE_SECURITY_DEPOSIT,
  paymentPlan,
  finalPaymentDueDate,
  eventDate,
  eventServicesPaymentNote,
  className = '',
}: ProposalPaymentScheduleProps) {
  const schedule = calculateProposalPaymentSchedule({
    finalEventPrice,
    venueServicesTotal,
    eventServicesTotal,
    refundableSecurityDeposit,
    paymentPlan,
    finalPaymentDueDate,
    eventDate,
  })
  const paymentPlanLabel = paymentPlan?.mode === 'pay_in_full'
    ? 'Final Event Price paid in full after signature'
    : paymentPlan?.mode === 'deposit_and_balance'
      ? 'Initial contract payment + final balance'
      : 'Payment plan not set'
  const isAwaitingFinalPrice = schedule.finalEventPrice === null
  const hasFinalEventBalance = typeof schedule.finalEventBalance === 'number' && schedule.finalEventBalance > 0
  const hasScheduledFinalBalance = hasFinalEventBalance && Boolean(schedule.finalPaymentDueDate)
  const finalBalanceTiming = hasScheduledFinalBalance
    ? `Due ${formatDate(schedule.finalPaymentDueDate)}`
    : schedule.finalEventBalance === 0
      ? 'No final balance'
      : hasFinalEventBalance
        ? 'Set due date in payment terms'
        : 'Complete payment terms'

  return (
    <section aria-label="Proposal payment plan" className={`space-y-5 ${className}`.trim()}>
      <header className="flex flex-col gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#caa24c]">Payment plan</p>
          <h3 className="mt-1 font-serif text-2xl font-semibold text-[color:var(--portal-text)] sm:text-3xl">How this proposal is paid</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--portal-muted)]">The schedule uses the Final Event Price in the signed agreement. The refundable security deposit is separate and never becomes part of that price.</p>
        </div>
        {eventDate ? (
          <div className="flex items-center gap-2 self-start rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-muted)] sm:self-auto">
            <CalendarDays size={14} className="text-[#8c6529] dark:text-[#f1d27a]" />
            <span>Event date</span>
            <span className="font-semibold text-[color:var(--portal-text)]">{formatDate(normalizeDate(eventDate)) || 'Set date'}</span>
          </div>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <FinancialStat icon={<Building2 size={15} />} label="Venue Services" value={formatMoney(schedule.venueServicesTotal)} detail="Proposal pricing bucket" loading={isAwaitingFinalPrice} />
        <FinancialStat icon={<CircleDollarSign size={15} />} label="Event Services" value={formatMoney(schedule.eventServicesTotal)} detail="Proposal pricing bucket" loading={isAwaitingFinalPrice} />
        <FinancialStat icon={<ReceiptText size={15} />} label="Final Event Price" value={formatMoney(schedule.finalEventPrice)} detail="Used for this payment schedule" highlighted loading={isAwaitingFinalPrice} />
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.055] p-4">
        <div className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><ShieldCheck size={16} /></span>
          <div>
            <p className="text-sm font-bold text-[color:var(--portal-text)]">The payment process</p>
            <ol className="mt-2 grid gap-1.5 text-xs leading-5 text-[color:var(--portal-muted)] sm:grid-cols-3 sm:gap-4">
              <li><span className="font-bold text-[color:var(--portal-text)]">1. Proposal accepted.</span> The client accepts this exact package, price, and set of terms.</li>
              <li><span className="font-bold text-[color:var(--portal-text)]">2. Agreement signed.</span> Luxor sends the Event Agreement for the client to review and sign.</li>
              <li><span className="font-bold text-[color:var(--portal-text)]">3. Stripe link sent.</span> The initial payment and refundable deposit are collected only after signature.</li>
            </ol>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <div className="flex flex-col gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color:var(--portal-soft)] text-[#8c6529] dark:text-[#f1d27a]"><Landmark size={16} /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Agreement payment schedule</p>
              <h4 className="mt-0.5 text-base font-bold text-[color:var(--portal-text)]">{paymentPlanLabel}</h4>
              <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">This schedule is calculated from the final agreement price—not by splitting the display buckets or by inventing extra installments.</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[#caa24c]/25 bg-[#caa24c]/[0.06] px-2.5 py-1.5 text-[10px] font-bold text-[#8c6529] dark:text-[#f1d27a]"><CreditCard size={12} /> Stripe after signature</span>
        </div>

        <div className="grid gap-px border-b border-[color:var(--portal-border)] bg-[color:var(--portal-border)] sm:grid-cols-3">
          <div className="bg-[color:var(--portal-card)] px-4 py-3.5 sm:px-5">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Final Event Price</p>
            {isAwaitingFinalPrice ? <PortalSkeleton className="mt-2 h-5 w-24 rounded" /> : <p className="mt-1 font-mono text-lg font-black tabular-nums text-[color:var(--portal-text)]">{formatMoney(schedule.finalEventPrice)}</p>}
          </div>
          <div className="bg-[color:var(--portal-card)] px-4 py-3.5 sm:px-5">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Initial contract payment</p>
            {isAwaitingFinalPrice ? <PortalSkeleton className="mt-2 h-5 w-24 rounded" /> : <p className="mt-1 font-mono text-lg font-black tabular-nums text-[color:var(--portal-text)]">{formatMoney(schedule.initialContractPayment)}</p>}
          </div>
          <div className="bg-[color:var(--portal-card)] px-4 py-3.5 sm:px-5">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Final Event Price balance</p>
            {isAwaitingFinalPrice ? <PortalSkeleton className="mt-2 h-5 w-24 rounded" /> : <p className="mt-1 font-mono text-lg font-black tabular-nums text-[color:var(--portal-text)]">{formatMoney(schedule.finalEventBalance)}</p>}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6529] dark:text-[#f1d27a]">Exact payment schedule</p>
              {hasScheduledFinalBalance ? <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Final balance due <span className="font-semibold text-[color:var(--portal-text)]">{formatDate(schedule.finalPaymentDueDate)}</span>{schedule.finalPaymentDueDateSource === 'event_date' && paymentPlan ? ` (${paymentPlan.final_payment_due_days_before_event} days before the event)` : ''}.</p> : null}
            </div>
          </div>

          {isAwaitingFinalPrice ? (
            <PortalCalculationSkeleton label="Calculating the agreement payment schedule" rows={3} />
          ) : schedule.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-[color:var(--portal-border)]">
              <table className="w-full min-w-[620px] text-left">
                <caption className="sr-only">Final Event Price payment schedule</caption>
                <thead className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Payment</th>
                    <th scope="col" className="px-4 py-3">Description</th>
                    <th scope="col" className="px-4 py-3">Due date</th>
                    <th scope="col" className="px-4 py-3 text-right">Amount</th>
                    <th scope="col" className="px-4 py-3">Collection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--portal-border)] text-sm">
                  {schedule.rows.map((row) => (
                    <tr key={row.id} className="bg-[color:var(--portal-card)]">
                      <td className="px-4 py-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--portal-soft)] font-mono text-[10px] font-black text-[color:var(--portal-text)]">{row.number}</span></td>
                      <td className="px-4 py-3 font-semibold text-[color:var(--portal-text)]">{row.description}</td>
                      <td className="px-4 py-3 text-xs"><PaymentTiming row={row} /></td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-black tabular-nums text-[color:var(--portal-text)]">{formatMoney(row.amount)}</td>
                      <td className="px-4 py-3 text-xs text-[color:var(--portal-muted)]">{row.collection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-5 text-sm leading-6 text-[color:var(--portal-muted)]">Complete the owner-approved payment terms to generate the exact agreement schedule.</div>
          )}

          <div className="mt-4 grid gap-3 rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/[0.055] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#caa24c]/12 text-[#8c6529] dark:text-[#f1d27a]"><ShieldCheck size={16} /></span>
              <div>
                <p className="text-sm font-bold text-[color:var(--portal-text)]">Refundable security deposit</p>
                <p className="mt-0.5 text-xs leading-5 text-[color:var(--portal-muted)]">Collected after agreement signature with the initial payment. It is held through the event and handled after post-event inspection under the Event Agreement.</p>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="font-mono text-lg font-black tabular-nums text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(schedule.refundableSecurityDeposit)}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Separate from Final Event Price</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
        <div className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color:var(--portal-soft)] text-[#8c6529] dark:text-[#f1d27a]"><CircleDollarSign size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">Proposal service breakdown</p>
                <h4 className="mt-0.5 text-base font-bold text-[color:var(--portal-text)]">Venue + Event Services</h4>
              </div>
              {isAwaitingFinalPrice ? <PortalSkeleton className="h-6 w-28 rounded" /> : <p className="font-mono text-xl font-black tabular-nums text-[color:var(--portal-text)]">{formatMoney(schedule.finalEventPrice)}</p>}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--portal-muted)]">{eventServicesPaymentNote?.trim() || 'Venue Services and Event Services are shown above so the proposal is easy to understand. The signed-agreement schedule is calculated from the Final Event Price, so neither display bucket changes the payment amounts by itself.'}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#caa24c]/30 bg-[#caa24c]/[0.045] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8c6529] dark:text-[#f1d27a]">Payment summary</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-lg font-black tabular-nums text-[color:var(--portal-text)]">
              {isAwaitingFinalPrice ? <PortalSkeleton className="h-5 w-20 rounded" /> : <span>{formatMoney(schedule.initialContractPayment)}</span>}
              <span className="text-[color:var(--portal-muted)]">+</span>
              {isAwaitingFinalPrice ? <PortalSkeleton className="h-5 w-20 rounded" /> : <span>{formatMoney(schedule.finalEventBalance)}</span>}
              <span className="text-[color:var(--portal-muted)]">=</span>
              {isAwaitingFinalPrice ? <PortalSkeleton className="h-5 w-24 rounded" /> : <span className="text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(schedule.finalEventPrice)}</span>}
            </div>
            <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Initial contract payment + final balance = Final Event Price</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[380px]">
            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Due after agreement signature</p>
              {isAwaitingFinalPrice ? <PortalSkeleton className="mt-2 h-5 w-24 rounded" /> : <p className="mt-1 font-mono text-lg font-black tabular-nums text-[color:var(--portal-text)]">{formatMoney(schedule.amountDueAfterSignature)}</p>}
              <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">Initial payment + refundable deposit</p>
            </div>
            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Final Event Price balance</p>
              {isAwaitingFinalPrice ? <PortalSkeleton className="mt-2 h-5 w-24 rounded" /> : <p className="mt-1 font-mono text-lg font-black tabular-nums text-[color:var(--portal-text)]">{formatMoney(schedule.finalEventBalance)}</p>}
              <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">{finalBalanceTiming}</p>
            </div>
          </div>
        </div>
      </section>

      {schedule.errors.length > 0 ? (
        <div role="status" className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm leading-6 text-amber-900 dark:text-amber-100">
          <Info size={16} className="mt-1 shrink-0" />
          <div><p className="font-bold">Payment schedule needs a quick review.</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{schedule.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>
        </div>
      ) : null}
    </section>
  )
}
