'use client'

import Link from 'next/link'
import { PortalModal } from '@/components/portal/PortalUI'

export type FinanceBrowseView = 'overview' | 'invoices' | 'payments' | 'expenses' | 'reports' | 'revenue' | 'schedules' | 'monthly' | 'receivables' | 'history'

const links: Array<{ id: FinanceBrowseView; label: string; href: string; group: string }> = [
  { id: 'overview', label: 'Financial Overview', href: '/portal/finances', group: 'Financial Overview' },
  { id: 'revenue', label: 'Revenue Dashboard', href: '/portal/finances/revenue', group: 'Revenue & Collections' },
  { id: 'schedules', label: 'Payment Schedules', href: '/portal/finances/schedules', group: 'Revenue & Collections' },
  { id: 'monthly', label: 'Monthly Collections', href: '/portal/finances/monthly', group: 'Revenue & Collections' },
  { id: 'receivables', label: 'Accounts Receivable', href: '/portal/finances/receivables', group: 'Revenue & Collections' },
  { id: 'history', label: 'Payment History', href: '/portal/finances/history', group: 'Revenue & Collections' },
  { id: 'invoices', label: 'Invoices Ledger', href: '/portal/finances?view=invoices', group: 'Existing ledgers' },
  { id: 'payments', label: 'Payments Log', href: '/portal/finances?view=payments', group: 'Existing ledgers' },
  { id: 'expenses', label: 'Expense Ledger', href: '/portal/finances?view=expenses', group: 'Existing ledgers' },
  { id: 'reports', label: 'Financial Reports', href: '/portal/finances?view=reports', group: 'Existing ledgers' },
]

const groups = ['Financial Overview', 'Revenue & Collections', 'Existing ledgers']
const linkClass = 'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm font-medium text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60'

export function FinanceBrowseViews({
  open,
  close,
  currentView,
  onLegacySelect,
}: {
  open: boolean
  close: () => void
  currentView: FinanceBrowseView
  onLegacySelect?: (view: Extract<FinanceBrowseView, 'invoices' | 'payments' | 'expenses' | 'reports'>) => void
}) {
  return (
    <PortalModal isOpen={open} onClose={close} title="Browse views" description="Choose a Financial Center view." maxWidth="max-w-xl" animateClose>
      <nav aria-label="Financial Center views" className="space-y-1 divide-y divide-[color:var(--portal-border)]">
        {groups.map((group) => (
          <section key={group} className="py-1">
            <h3 className="px-3 pt-3 text-xs font-semibold text-[color:var(--portal-muted)]">{group}</h3>
            {links.filter((item) => item.group === group).map((item) => {
              const isCurrent = item.id === currentView
              if (onLegacySelect && ['invoices', 'payments', 'expenses', 'reports'].includes(item.id)) {
                return <button key={item.id} type="button" aria-current={isCurrent ? 'page' : undefined} onClick={() => { onLegacySelect(item.id as 'invoices' | 'payments' | 'expenses' | 'reports'); close() }} className={linkClass}><span>{item.label}</span>{isCurrent && <span className="text-xs text-[color:var(--portal-muted)]">Current view</span>}</button>
              }
              return <Link key={item.id} href={item.href} onClick={close} aria-current={isCurrent ? 'page' : undefined} className={linkClass}><span>{item.label}</span>{isCurrent && <span className="text-xs text-[color:var(--portal-muted)]">Current view</span>}</Link>
            })}
          </section>
        ))}
        <section className="py-1"><h3 className="px-3 pt-3 text-xs font-semibold text-[color:var(--portal-muted)]">Bills &amp; Vendors</h3><Link href="/portal/operations?tab=bills" onClick={close} className={linkClass}><span>Open Operations bills</span><span className="text-xs text-[color:var(--portal-muted)]">Operations access</span></Link></section>
        <section className="py-1"><h3 className="px-3 pt-3 text-xs font-semibold text-[color:var(--portal-muted)]">Other sections</h3><p className="px-3 py-2 text-sm text-[color:var(--portal-muted)]">Event Profitability, Budgeting, and Accounting are planned for later phases.</p></section>
      </nav>
    </PortalModal>
  )
}
