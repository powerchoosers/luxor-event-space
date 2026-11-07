'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowClockwise, CreditCard, List } from '@phosphor-icons/react'
import { FinanceBrowseViews, type FinanceBrowseView } from '@/components/portal/FinanceBrowseViews'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'

export const REVENUE_COLLECTION_VIEWS: Record<Extract<FinanceBrowseView, 'revenue' | 'schedules' | 'monthly' | 'receivables' | 'history'>, { title: string; description: string }> = {
  revenue: { title: 'Revenue Dashboard', description: 'Collected payments, remaining obligations, and upcoming collections.' },
  schedules: { title: 'Payment Schedules', description: 'Contractual payment obligations for eligible bookings.' },
  monthly: { title: 'Monthly Collections', description: 'Collected and expected payments by month.' },
  receivables: { title: 'Accounts Receivable', description: 'Remaining balances tied to valid, due payment obligations.' },
  history: { title: 'Payment History', description: 'Recorded incoming payments, refunds, and their references.' },
}

const revenueCollectionLinks: Array<{ view: keyof typeof REVENUE_COLLECTION_VIEWS; href: string }> = [
  { view: 'revenue', href: '/portal/finances/revenue' },
  { view: 'schedules', href: '/portal/finances/schedules' },
  { view: 'monthly', href: '/portal/finances/monthly' },
  { view: 'receivables', href: '/portal/finances/receivables' },
  { view: 'history', href: '/portal/finances/history' },
]

export function RevenueCollectionsShell({
  view,
  onRefresh,
  refreshing = false,
  children,
}: {
  view: Extract<FinanceBrowseView, 'revenue' | 'schedules' | 'monthly' | 'receivables' | 'history'>
  onRefresh?: () => void
  refreshing?: boolean
  children: React.ReactNode
}) {
  const [browseOpen, setBrowseOpen] = useState(false)
  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col">
      <PortalPageHeader
        icon={<CreditCard size={18} weight="regular" />}
        title="Revenue & Collections"
        description="Manage incoming revenue, payment schedules, and client collections."
        actions={(
          <div className="flex items-center gap-2">
            {onRefresh ? <PortalButton onClick={onRefresh} disabled={refreshing} aria-label="Refresh revenue and collections"><ArrowClockwise size={16} weight="regular" className={refreshing ? 'animate-spin' : ''} /> Refresh</PortalButton> : null}
            <PortalButton onClick={() => setBrowseOpen(true)} aria-haspopup="dialog"><List size={16} weight="regular" /> Browse views</PortalButton>
          </div>
        )}
      />
      <FinanceBrowseViews open={browseOpen} close={() => setBrowseOpen(false)} currentView={view} />
      <nav aria-label="Revenue and collections views" className="hidden overflow-x-auto border-b border-[color:var(--portal-border)] px-4 lg:block lg:px-6">
        <div className="flex min-w-max items-stretch gap-1">
          {revenueCollectionLinks.map((item) => {
            const active = item.view === view
            const label = REVENUE_COLLECTION_VIEWS[item.view].title
            return <Link
              key={item.view}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex min-h-12 items-center px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/55 ${active ? 'text-[color:var(--portal-text)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[#a8792f] dark:after:bg-[#e6c77f]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
            >{label}</Link>
          })}
        </div>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-6 portal-scrollbar">
        {children}
      </div>
    </PortalPageFrame>
  )
}
