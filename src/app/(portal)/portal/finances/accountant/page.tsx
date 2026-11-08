import Link from 'next/link'
import { PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'

export default function AccountantExportsPage() {
  return (
    <PortalPageFrame>
      <PortalPageHeader title="Accountant exports" description="Download saved expense records and their payment history for review." />
      <Link href="/portal/finances" className="w-fit text-sm font-semibold text-[#9a712e] underline-offset-4 hover:underline dark:text-[#e6c77f]">Financial Center</Link>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
        <h2 className="font-sans text-base font-bold text-[color:var(--portal-text)] sm:text-lg">Expense records</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--portal-muted)]">Includes planned, incurred, paid, and cancelled expenses, with links to saved bills, bookings, and receipts by ID. Unknown amounts stay blank. Bills that are not linked to an expense are not included.</p>
        <a href="/api/portal/accountant-expenses?file=expenses" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-[color:var(--portal-border)] px-4 text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c]">Download expenses CSV</a>
      </section>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
        <h2 className="font-sans text-base font-bold text-[color:var(--portal-text)] sm:text-lg">Expense payment history</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--portal-muted)]">Contains saved payment, refund, and reversal records. Older paid expenses without payment history are flagged in the expense file; no payment is invented for them.</p>
        <a href="/api/portal/accountant-expenses?file=payments" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-[color:var(--portal-border)] px-4 text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c]">Download payment history CSV</a>
      </section>
      <p className="max-w-3xl text-sm leading-6 text-[color:var(--portal-muted)]">These are operational records for review, not a general ledger or a closed accounting period. The files include all saved dates and exclude identified test records. Review receipts and any missing details in <Link href="/portal/finances/expenses" className="font-semibold underline underline-offset-2">Expenses</Link>.</p>
    </PortalPageFrame>
  )
}
