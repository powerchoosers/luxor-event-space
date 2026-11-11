'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
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
import {
  PortalCloseButton,
  PORTAL_MODAL_BACKDROP_CLOSE_DURATION,
  PORTAL_MODAL_BACKDROP_OPEN_DURATION,
  PORTAL_MODAL_EASE,
  PORTAL_MODAL_EXIT_EASE,
  PORTAL_SHEET_CLOSE_DURATION,
  PORTAL_SHEET_OPEN_DURATION,
  PORTAL_SIDE_PANEL_EASE,
  acquirePortalScrollLock,
} from '@/components/portal/PortalUI'

export type FinanceBrowseView =
  | 'overview'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'expense-dashboard'
  | 'bill-review'
  | 'bill-providers'
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
  | 'books'
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
    id: 'receivables',
    label: 'Payment Schedules',
    description: 'Confirmed booking balances and remaining client obligations',
    href: '/portal/finances?view=receivables',
    group: 'Revenue & Collections',
    icon: <Wallet size={16} weight="regular" />,
  },
  {
    id: 'revenue',
    label: 'Revenue',
    description: 'Collected payments, expected revenue, and period performance',
    href: '/portal/finances?view=revenue',
    group: 'Revenue & Collections',
    icon: <CurrencyCircleDollar size={16} weight="regular" />,
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
    href: '/portal/finances?view=expenses',
    group: 'Expense Management',
    icon: <TrendDown size={16} weight="regular" />,
  },
  {
    id: 'bill-review',
    label: 'Bills',
    description: 'Review incoming bills, confirm details, and prepare payments',
    href: '/portal/finances?view=bill-review',
    group: 'Expense Management',
    icon: <FileText size={16} weight="regular" />,
  },
  {
    id: 'recurring-expenses',
    label: 'Recurring costs',
    description: 'Set up repeating costs and see each expected bill',
    href: '/portal/finances?view=expense-recurring',
    group: 'Expense Management',
    icon: <CalendarDots size={16} weight="regular" />,
  },
  {
    id: 'business-expenses',
    label: 'Business Expenses',
    description: 'Record and manage general operating costs',
    href: '/portal/finances?view=expense-business',
    group: 'Expense Management',
    icon: <Wallet size={16} weight="regular" />,
  },
  {
    id: 'event-expenses',
    label: 'Event Expenses',
    description: 'Track costs linked to individual bookings',
    href: '/portal/finances?view=expense-events',
    group: 'Expense Management',
    icon: <CalendarDots size={16} weight="regular" />,
  },
  {
    id: 'expense-receipts',
    label: 'Receipts & Records',
    description: 'Search and review expense documentation',
    href: '/portal/finances?view=expense-receipts',
    group: 'Expense Management',
    icon: <FileText size={16} weight="regular" />,
  },
  {
    id: 'books',
    label: 'Books & records',
    description: 'Review reconciliation items and download accountant records',
    href: '/portal/finances/books',
    group: 'Ledgers & Reports',
    icon: <Receipt size={16} weight="regular" />,
  },
  {
    id: 'accountant',
    label: 'Accountant exports',
    description: 'Opens Books & records export section',
    href: '/portal/finances/books#exports',
    group: 'Ledgers & Reports',
    icon: <FileText size={16} weight="regular" />,
  },
  {
    id: 'budgets',
    label: 'Monthly plan',
    description: 'Compare monthly spending targets with recorded payments',
    href: '/portal/finances/budgets',
    group: 'Ledgers & Reports',
    icon: <Wallet size={16} weight="regular" />,
  },
]

const groups = ['Overview', 'Revenue & Collections', 'Expense Management', 'Ledgers & Reports']

export const FINANCE_VIEW_LABELS: Record<FinanceBrowseView, string> = {
  overview: 'Financial Overview',
  revenue: 'Revenue',
  schedules: 'Schedule details',
  monthly: 'Monthly Collections',
  receivables: 'Payment Schedules',
  history: 'Payment History',
  invoices: 'Invoices Ledger',
  payments: 'Payments Log',
  expenses: 'Expenses Tracking',
  'expense-dashboard': 'Expense Dashboard',
  'bill-review': 'Bills',
  'bill-providers': 'Recurring costs',
  'recurring-expenses': 'Recurring costs',
  'business-expenses': 'Business Expenses',
  'event-expenses': 'Event Expenses',
  'expense-receipts': 'Receipts & Records',
  reports: 'Financial Reports',
  profitability: 'Event profitability',
  accountant: 'Accountant exports',
  books: 'Books & records',
  budgets: 'Monthly plan',
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
  onLegacySelect?: (view: 'dashboard' | 'revenue' | 'receivables' | 'invoices' | 'payments' | 'expenses' | 'reports' | 'bill-review' | 'bill-providers') => void
}) {
  const handleClose = useCallback(() => close(), [close])
  const reduceMotion = useReducedMotion()
  const releaseScrollLockRef = useRef<(() => void) | null>(null)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!releaseScrollLockRef.current) {
      releaseScrollLockRef.current = acquirePortalScrollLock()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleClose])

  useEffect(() => {
    return () => {
      releaseScrollLockRef.current?.()
      releaseScrollLockRef.current = null
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence
      initial={!reduceMotion}
      onExitComplete={() => {
        if (openRef.current) return
        releaseScrollLockRef.current?.()
        releaseScrollLockRef.current = null
      }}
    >
      {open ? (
        <motion.div
          key="finance-browse-views-backdrop"
          data-portal-backdrop="true"
          aria-hidden="true"
          className="portal-modal-backdrop fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { duration: reduceMotion ? 0.06 : PORTAL_MODAL_BACKDROP_OPEN_DURATION, ease: PORTAL_MODAL_EASE },
          }}
          exit={{
            opacity: 0,
            pointerEvents: 'none',
            transition: { duration: reduceMotion ? 0.05 : PORTAL_MODAL_BACKDROP_CLOSE_DURATION, ease: PORTAL_MODAL_EXIT_EASE },
          }}
          onMouseDown={close}
        />
      ) : null}
      {open ? (
        <motion.section
          key="finance-browse-views-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-browse-views-title"
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[70] mx-auto flex max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-auto max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl will-change-transform sm:inset-0 sm:m-auto sm:h-fit"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 44, scale: 0.985 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { duration: reduceMotion ? 0.06 : PORTAL_SHEET_OPEN_DURATION, ease: PORTAL_SIDE_PANEL_EASE },
          }}
          exit={reduceMotion
            ? { opacity: 0, pointerEvents: 'none', transition: { duration: 0.05 } }
            : { opacity: 0, y: 36, scale: 0.985, pointerEvents: 'none', transition: { duration: PORTAL_SHEET_CLOSE_DURATION, ease: PORTAL_SIDE_PANEL_EASE } }}
          onMouseDown={(event) => event.stopPropagation()}
        >
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-5 py-4 backdrop-blur-xl">
              <div>
                <h2 id="finance-browse-views-title" className="text-base font-bold text-[color:var(--portal-text)]">
                  Browse views
                </h2>
                <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Choose a Financial Center workspace view.</p>
              </div>
              <PortalCloseButton
                onClick={close}
                aria-label="Close views menu"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6 portal-scrollbar">
              <nav aria-label="Financial Center views" className="space-y-4">
                {groups.map((group) => (
                  <section key={group}>
                    <h3 className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-faint)]">{group}</h3>
                    <div className="divide-y divide-[color:var(--portal-border)] overflow-hidden rounded-xl border border-[color:var(--portal-border)]">
                      {
                        links.filter((item) => item.group === group).map((item) => {
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
                                <span className="block text-sm font-bold">{item.label}</span>
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
                              item.id === 'revenue' ||
                              item.id === 'receivables' ||
                              item.id === 'invoices' ||
                              item.id === 'payments' ||
                              item.id === 'expenses' ||
                              item.id === 'bill-review' ||
                              item.id === 'bill-providers' ||
                              item.id === 'reports')
                          ) {
                            const legacyTab = item.id === 'overview' ? 'dashboard' : item.id as 'revenue' | 'receivables' | 'invoices' | 'payments' | 'expenses' | 'reports' | 'bill-review' | 'bill-providers'
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
                        })
                      }
                    </div>
                  </section>
                ))}
              </nav>
            </div>
          </motion.section>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
