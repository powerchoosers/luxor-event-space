'use client'

import { useRouter } from 'next/navigation'
import { BookOpen, CreditCard, CurrencyDollar, FileText, TrendDown, TrendUp, Wallet } from '@phosphor-icons/react'
import { PortalAnimatedTabs } from '@/components/portal/PortalUI'

export type FinanceMainTab = 'dashboard' | 'revenue' | 'receivables' | 'invoices' | 'payments' | 'expenses' | 'reports' | 'books'

const tabs = [
  { id: 'dashboard', label: 'Financial Overview', icon: <TrendUp size={16} weight="regular" /> },
  { id: 'revenue', label: 'Revenue', icon: <CurrencyDollar size={16} weight="regular" /> },
  { id: 'receivables', label: 'Payment Schedules', icon: <Wallet size={16} weight="regular" /> },
  { id: 'invoices', label: 'Invoices Ledger', icon: <FileText size={16} weight="regular" /> },
  { id: 'payments', label: 'Payments Log', icon: <CreditCard size={16} weight="regular" /> },
  { id: 'expenses', label: 'Expenses Tracking', icon: <TrendDown size={16} weight="regular" /> },
  { id: 'books', label: 'Books & records', icon: <BookOpen size={16} weight="regular" /> },
] as const

export function FinanceMainTabs({ activeTab, onLocalSelect }: { activeTab: FinanceMainTab; onLocalSelect?: (tab: FinanceMainTab) => void }) {
  const router = useRouter()
  return <div className="hidden min-w-0 shrink-0 overflow-x-auto xl:flex">
    <PortalAnimatedTabs variant="slider" ariaLabel="Finances sections" tabs={tabs} activeTab={activeTab} onTabChange={(tab) => {
      if (onLocalSelect) onLocalSelect(tab)
      else router.push(tab === 'dashboard' ? '/portal/finances' : `/portal/finances?view=${tab}`)
    }} />
  </div>
}
