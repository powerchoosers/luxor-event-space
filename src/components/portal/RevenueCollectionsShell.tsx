'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowClockwise, CreditCard } from '@phosphor-icons/react'
import { ChevronDown, Menu } from '@/lib/icons/phosphor-compat'
import { FinanceMainTabs } from '@/components/portal/FinanceMainTabs'
import { FinanceBrowseViews, type FinanceBrowseView } from '@/components/portal/FinanceBrowseViews'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'

export const REVENUE_COLLECTION_VIEWS: Record<Extract<FinanceBrowseView, 'revenue' | 'schedules' | 'monthly' | 'receivables' | 'history'>, { title: string; description: string }> = {
  revenue: { title: 'Revenue', description: 'Collected payments, remaining obligations, and upcoming collections.' },
  schedules: { title: 'Payment Schedules', description: 'Contractual payment obligations for eligible bookings.' },
  monthly: { title: 'Monthly Collections', description: 'Collected and expected payments by month.' },
  receivables: { title: 'Payment Schedules', description: 'Remaining balances tied to valid, due payment obligations.' },
  history: { title: 'Payment History', description: 'Recorded incoming payments, refunds, and their references.' },
}

const revenueCollectionLinks: Array<{ view: keyof typeof REVENUE_COLLECTION_VIEWS; href: string }> = [
  { view: 'revenue', href: '/portal/finances/revenue' },
  { view: 'receivables', href: '/portal/finances/receivables' },
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
  const currentTitle = REVENUE_COLLECTION_VIEWS[view].title
  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-4 max-md:pt-4">
      <PortalPageHeader
        icon={<CreditCard size={18} weight="regular" />}
        title={currentTitle}
        description={view === 'receivables' ? undefined : REVENUE_COLLECTION_VIEWS[view].description}
        mobileActionsInline
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setBrowseOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={browseOpen}
              aria-label={`Browse views. Currently viewing ${currentTitle}`}
              className="hidden md:inline-flex min-h-10 items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-1.5 text-left text-[color:var(--portal-text)] shadow-xs transition-colors hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
            >
              <Menu size={16} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)] leading-none">Browse views</span>
                <span className="mt-0.5 block truncate text-xs font-bold leading-tight max-w-[130px] lg:max-w-[170px]">
                  {currentTitle}
                </span>
              </span>
              <ChevronDown size={15} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
            </button>
            {onRefresh ? (
              <PortalButton onClick={onRefresh} disabled={refreshing} aria-label="Refresh revenue and collections">
                <ArrowClockwise size={15} weight="regular" className={refreshing ? 'animate-spin' : ''} /> Refresh Ledger
              </PortalButton>
            ) : null}
          </div>
        )}
      />

      {/* Mobile-only condensed view picker button */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setBrowseOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={browseOpen}
          className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-[color:var(--portal-text)] shadow-xs transition-colors hover:border-[#caa24c]/45"
        >
          <Menu size={18} className="text-[#a8792f] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span>
            <span className="mt-0.5 block truncate text-sm font-bold">
              {currentTitle}
            </span>
          </span>
          <ChevronDown size={17} className="text-[color:var(--portal-muted)] shrink-0" aria-hidden="true" />
        </button>
      </div>

      <FinanceBrowseViews open={browseOpen} close={() => setBrowseOpen(false)} currentView={view} />
      {view === 'receivables' ? <FinanceMainTabs activeTab="receivables" /> : <nav aria-label="Revenue and collections views" className="hidden overflow-x-auto border-b border-[color:var(--portal-border)] px-4 lg:block lg:px-6">
        <div className="flex min-w-max items-stretch gap-1">
          <Link
            href="/portal/finances"
            className="relative inline-flex min-h-11 items-center px-3.5 text-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/55"
          >
            Financial Overview
          </Link>
          {revenueCollectionLinks.map((item) => {
            const active = item.view === view
            const label = REVENUE_COLLECTION_VIEWS[item.view].title
            return <Link
              key={item.view}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex min-h-11 items-center px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/55 ${active ? 'text-[color:var(--portal-text)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-[#a8792f] dark:after:bg-[#e6c77f]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
            >{label}</Link>
          })}
        </div>
      </nav>}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-6 portal-scrollbar">
        {children}
      </div>
    </PortalPageFrame>
  )
}
