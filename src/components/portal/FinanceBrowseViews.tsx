'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarBlank,
  CalendarDots,
  CreditCard,
  CurrencyCircleDollar,
  Eye,
  FileText,
  Receipt,
  TrendDown,
  TrendUp,
  Wallet,
} from '@phosphor-icons/react'
import { ChevronRight, X } from '@/lib/icons/phosphor-compat'

export type FinanceBrowseView =
  | 'overview'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'expense-dashboard'
  | 'recurring-expenses'
  | 'business-expenses'
  | 'event-expenses'
  | 'expense-receipts'
  | 'reports'
  | 'revenue'
  | 'schedules'
  | 'monthly'
  | 'receivables'
  | 'history'
  | 'profitability'
  | 'accountant'
  | 'budgets'
  | 'bills'

type BrowseItem = {
  id: FinanceBrowseView
  label: string
  description: string
  href: string
  group: string
  icon: React.ReactNode
}

const links: BrowseItem[] = [
  {
    id: 'overview',
    label: 'Financial Overview',
    description: 'Revenue, expenses, active client payment plans, and obligations',
    href: '/portal/finances',
    group: 'Overview',
    icon: <TrendUp size={16} weight="regular" />,
  },
  {
    id: 'profitability',
    label: 'Event profitability',
    description: 'Compare accepted event obligations and collections with direct costs',
    href: '/portal/finances/profitability',
    group: 'Overview',
    icon: <CalendarDots size={16} weight="regular" />,
  },
  {
    id: 'schedules',
    label: 'Payment Schedules',
    description: 'Client installment plans, due dates, and manual payment logging',
    href: '/portal/finances/schedules',
    group: 'Revenue & Collections',
    icon: <CalendarBlank size={16} weight="regular" />,
  },
  {
    id: 'receivables',
    label: 'Accounts Receivable',
    description: 'Confirmed booking balances and remaining client obligations',
    href: '/portal/finances/receivables',
    group: 'Revenue & Collections',
    icon: <Wallet size={16} weight="regular" />,
  },
  {
    id: 'revenue',
    label: 'Revenue Dashboard',
    description: 'Collected payments, expected revenue, and period performance',
    href: '/portal/finances/revenue',
    group: 'Revenue & Collections',
    icon: <CurrencyCircleDollar size={16} weight="regular" />,
  },
  {
    id: 'monthly',
    label: 'Monthly Collections',
    description: 'Rolling 12-month collected and expected schedule breakdown',
    href: '/portal/finances/monthly',
    group: 'Revenue & Collections',
    icon: <CalendarDots size={16} weight="regular" />,
  },
  {
    id: 'history',
    label: 'Payment History',
    description: 'Recorded incoming payments, refunds, and processor references',
    href: '/portal/finances/history',
    group: 'Revenue & Collections',
    icon: <CreditCard size={16} weight="regular" />,
  },
  {
    id: 'invoices',
    label: 'Invoices Ledger',
    description: 'Proposals, booking deposits, and final balance invoices',
    href: '/portal/finances?view=invoices',
    group: 'Ledgers & Reports',
    icon: <FileText size={16} weight="regular" />,
  },
  {
    id: 'payments',
    label: 'Payments Log',
    description: 'All recorded transactions and manual payment entries',
    href: '/portal/finances?view=payments',
    group: 'Ledgers & Reports',
    icon: <Receipt size={16} weight="regular" />,
  },
  {
    id: 'expense-dashboard',
    label: 'Expense Dashboard',
    description: 'Paid spending, upcoming obligations, and expense trends',
    href: '/portal/finances/expenses',
    group: 'Expense Management',
    icon: <TrendDown size={16} weight="regular" />,
  },
  {
    id: 'recurring-expenses',
    label: 'Recurring Expenses',
    description: 'Fixed and variable expenses generated from active templates',
    href: '/portal/finances/expenses/recurring',
    group: 'Expense Management',
    icon: <CalendarBlank size={16} weight="regular" />,
  },
  {
    id: 'business-expenses',
    label: 'Business Expenses',
    description: 'Record and manage general operating costs',
    href: '/portal/finances/expenses/business',
    group: 'Expense Management',
    icon: <Wallet size={16} weight="regular" />,
  },
  {
    id: 'event-expenses',
    label: 'Event Expenses',
    description: 'Track costs linked to individual bookings',
    href: '/portal/finances/expenses/events',
    group: 'Expense Management',
    icon: <CalendarDots size={16} weight="regular" />,
  },
  {
    id: 'expense-receipts',
    label: 'Receipts & Records',
    description: 'Search and review expense documentation',
    href: '/portal/finances/expenses/receipts',
    group: 'Expense Management',
    icon: <FileText size={16} weight="regular" />,
  },
  {
    id: 'reports',
    label: 'Financial Reports',
    description: 'Revenue summaries, collection status, and ledger breakdowns',
    href: '/portal/finances?view=reports',
    group: 'Ledgers & Reports',
    icon: <Eye size={16} weight="regular" />,
  },
  {
    id: 'accountant',
    label: 'Accountant exports',
    description: 'Download expense records and payment history for review',
    href: '/portal/finances/accountant',
    group: 'Ledgers & Reports',
    icon: <FileText size={16} weight="regular" />,
  },
  {
    id: 'budgets',
    label: 'Budgets and reports',
    description: 'Compare monthly spending targets with recorded payments',
    href: '/portal/finances/budgets',
    group: 'Ledgers & Reports',
    icon: <Wallet size={16} weight="regular" />,
  },
]

const groups = ['Overview', 'Revenue & Collections', 'Ledgers & Reports', 'Expense Management', 'Bills & Vendors']

function getFinanceGroup(view: FinanceBrowseView) {
  if (view === 'bills') return 'Bills & Vendors'
  if (view === 'expenses') return 'Expense Management'
  return links.find((item) => item.id === view)?.group ?? 'Overview'
}

export const FINANCE_VIEW_LABELS: Record<FinanceBrowseView, string> = {
  overview: 'Financial Overview',
  revenue: 'Revenue Dashboard',
  schedules: 'Payment Schedules',
  monthly: 'Monthly Collections',
  receivables: 'Accounts Receivable',
  history: 'Payment History',
  invoices: 'Invoices Ledger',
  payments: 'Payments Log',
  expenses: 'Expenses Tracking',
  'expense-dashboard': 'Expense Dashboard',
  'recurring-expenses': 'Recurring Expenses',
  'business-expenses': 'Business Expenses',
  'event-expenses': 'Event Expenses',
  'expense-receipts': 'Receipts & Records',
  reports: 'Financial Reports',
  profitability: 'Event profitability',
  accountant: 'Accountant exports',
  budgets: 'Budgets and reports',
  bills: 'Bills and vendors',
}

export function FinanceBrowseViews({
  open,
  close,
  currentView,
  onLegacySelect,
}: {
  open: boolean
  close: () => void
  currentView: FinanceBrowseView
  onLegacySelect?: (view: 'dashboard' | 'invoices' | 'payments' | 'expenses' | 'reports') => void
}) {
  const currentGroup = getFinanceGroup(currentView)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const activeExpandedGroup = expandedGroup ?? currentGroup
  const handleClose = useCallback(() => {
    setExpandedGroup(null)
    close()
  }, [close])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={close}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-browse-views-title"
            className="flex max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl"
            initial={{ opacity: 0, y: 56, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.985 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-5 py-4 backdrop-blur-xl">
              <div>
                <h2 id="finance-browse-views-title" className="text-base font-bold text-[color:var(--portal-text)]">
                  Browse views
                </h2>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Choose a Financial Center workspace view.</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close views menu"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
              >
                <X size={15} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6 portal-scrollbar">
              <nav aria-label="Financial Center views" className="space-y-2">
                {[currentGroup, ...groups.filter((group) => group !== currentGroup)].map((group) => {
                  const expanded = activeExpandedGroup === group
                  const groupLinks = links.filter((item) => item.group === group)
                  return (
                  <section key={group} className="overflow-hidden rounded-xl border border-[color:var(--portal-border)]">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={expanded ? `finance-views-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined}
                      onClick={() => setExpandedGroup(expanded ? '' : group)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 bg-[color:var(--portal-card)] px-3.5 py-3 text-left text-sm font-semibold text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45"
                    >
                      <span>{group}</span>
                      <ChevronRight size={16} className={`shrink-0 text-[color:var(--portal-muted)] transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
                    </button>
                    {expanded ? <div id={`finance-views-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="divide-y divide-[color:var(--portal-border)] border-t border-[color:var(--portal-border)]">
                      {group === 'Bills & Vendors' ? (
                        <Link
                          href="/portal/finances/bills"
                          onClick={handleClose}
                          aria-current={currentView === 'bills' ? 'page' : undefined}
                          className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 ${currentView === 'bills' ? 'bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#e0bd67]' : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'}`}
                        >
                          <FileText size={16} weight="regular" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold">Bills and vendors</span>
                            <span className="mt-0.5 block text-[11px] text-[color:var(--portal-muted)]">Balances, payment history, reminders, and vendor profiles</span>
                          </span>
                          <ChevronRight size={16} className="shrink-0 text-[color:var(--portal-faint)]" aria-hidden="true" />
                        </Link>
                      ) : groupLinks.map((item) => {
                          const isCurrent = item.id === currentView
                          const itemClass = `flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 ${
                            isCurrent
                              ? 'bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#e0bd67]'
                              : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'
                          }`
                          const content = (
                            <>
                              <span className="shrink-0">{item.icon}</span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 text-sm font-bold">
                                  <span>{item.label}</span>
                                  {isCurrent ? (
                                    <span className="rounded-full bg-[#caa24c]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#9a6d26] dark:text-[#f1d27a]">
                                      Current
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 block text-[11px] text-[color:var(--portal-muted)]">
                                  {item.description}
                                </span>
                              </span>
                              <ChevronRight size={16} className="shrink-0 text-[color:var(--portal-faint)]" aria-hidden="true" />
                            </>
                          )

                          if (
                            onLegacySelect &&
                            (item.id === 'overview' ||
                              item.id === 'invoices' ||
                              item.id === 'payments' ||
                              item.id === 'expenses' ||
                              item.id === 'reports')
                          ) {
                            const legacyTab = item.id === 'overview' ? 'dashboard' : item.id
                            return (
                              <button
                                key={item.id}
                                type="button"
                                aria-current={isCurrent ? 'page' : undefined}
                                onClick={() => {
                                  onLegacySelect(legacyTab)
                                  handleClose()
                                }}
                                className={itemClass}
                              >
                                {content}
                              </button>
                            )
                          }

                          return (
                            <Link
                              key={item.id}
                              href={item.href}
                              onClick={handleClose}
                              aria-current={isCurrent ? 'page' : undefined}
                              className={itemClass}
                            >
                              {content}
                            </Link>
                          )
                        })}
                    </div> : null}
                  </section>
                )})}
              </nav>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
