import Link from 'next/link'
import type { EventProfitability as EventProfitabilityRecord } from '@/lib/luxorEventProfitability'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const linkStyle = 'font-semibold text-[#9a712e] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]'

function amount(value: number | null) { return value === null ? 'Unavailable' : currency.format(value) }

/** A read-only view; its caller supplies the verified, test-filtered finance model. */
export function EventProfitability({ events }: { events: EventProfitabilityRecord[] }) {
  if (!events.length) return <p className="text-sm text-[color:var(--portal-muted)]">No events are available to review yet.</p>
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm leading-6 text-[color:var(--portal-muted)]">Compare each accepted event with its linked direct expenses. Costs that have not been entered are not included; business overhead stays separate.</p>
      {events.map((event) => (
        <section key={event.booking.id} className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-sans text-base font-bold text-[color:var(--portal-text)]">{event.booking.client_name}</h3><p className="mt-1 text-sm text-[color:var(--portal-muted)]">{event.booking.event_type || 'Event'}{event.booking.event_date ? ` · ${event.booking.event_date}` : ' · Date not set'}</p></div>
            <Link className={`${linkStyle} text-sm`} href={`/portal/planner/event/${encodeURIComponent(event.booking.id)}`}>Open event</Link>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            <Value label="Event obligation" value={event.obligation} />
            <Value label="Net collections" value={event.collections} />
            <Value label="Known direct costs" value={event.knownDirectCosts} />
            <Value label="Unpaid commitments" value={event.unpaidCommitments} />
            <Value label="Direct costs paid" value={event.paidDirectCosts} />
            <Value label="Projected contribution" value={event.projectedContribution} />
            <Value label="Cash contribution" value={event.cashContribution} />
          </dl>
          <p className="mt-4 text-xs leading-5 text-[color:var(--portal-muted)]">Projected contribution is the accepted obligation less recorded direct costs. Cash contribution is net collections less direct costs paid; it is not accounting profit. Refundable security deposits and overhead are excluded.</p>
          {event.issues.length > 0 && <ul className="mt-3 list-inside list-disc text-xs leading-5 text-[color:var(--portal-muted)]">{event.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          <details className="mt-4 border-t border-[color:var(--portal-border)] pt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-[color:var(--portal-text)]">View source records</summary>
            <div className="mt-3 space-y-2 text-sm text-[color:var(--portal-muted)]">
              {event.invoiceId && <p><Link className={linkStyle} href="/portal/invoices">Accepted invoice and payment history</Link></p>}
              {event.expenses.length ? event.expenses.map((expense) => <p key={expense.id}><Link className={linkStyle} href={`/portal/finances/expenses/${encodeURIComponent(expense.id)}`}>{expense.description?.trim() || expense.vendor_name || 'Event expense'}</Link> <span className="tabular-nums">· {expense.amount_known === false || (Number(expense.amount) === 0 && expense.metadata?.amount_state === 'variable') ? 'Amount unknown' : amount(Number(expense.amount))}</span></p>) : <p>No direct expenses are linked to this event.</p>}
            </div>
          </details>
        </section>
      ))}
    </div>
  )
}

function Value({ label, value }: { label: string; value: number | null }) {
  return <div><dt className="text-xs text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 text-sm font-bold tabular-nums text-[color:var(--portal-text)]">{amount(value)}</dd></div>
}
