'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, CreditCard, CurrencyDollar, FileText, TrendUp, Wallet } from '@phosphor-icons/react'
import { PortalAnimatedTabs } from '@/components/portal/PortalUI'

export type FinanceMainTab = 'dashboard' | 'revenue' | 'receivables' | 'invoices' | 'payments' | 'expenses' | 'reports' | 'books'

const tabs = [
  { id: 'dashboard', label: 'Financial Overview', icon: <TrendUp size={16} weight="regular" /> },
  { id: 'revenue', label: 'Revenue', icon: <CurrencyDollar size={16} weight="regular" /> },
  { id: 'receivables', label: 'Payment Schedules', icon: <Wallet size={16} weight="regular" /> },
  { id: 'invoices', label: 'Invoices Ledger', icon: <FileText size={16} weight="regular" /> },
  { id: 'payments', label: 'Payments Log', icon: <CreditCard size={16} weight="regular" /> },
  { id: 'books', label: 'Books & records', icon: <BookOpen size={16} weight="regular" /> },
] as const

export function FinanceMainTabs({ activeTab, onLocalSelect, bare = false }: { activeTab: FinanceMainTab; onLocalSelect?: (tab: FinanceMainTab) => void; bare?: boolean }) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current) }, [])

  const selectTab = (tab: FinanceMainTab) => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    const scrollers = new Set<HTMLElement>()
    const container = containerRef.current
    for (let element = container?.parentElement; element; element = element.parentElement) {
      if (element.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(element).overflowY)) scrollers.add(element)
    }
    container?.closest('[id^="route-transition-"]')?.querySelectorAll<HTMLElement>('.portal-scrollbar').forEach((element) => {
      if (element.offsetParent !== null && element.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(element).overflowY)) scrollers.add(element)
    })
    const page = document.scrollingElement as HTMLElement | null
    if (page && page.scrollTop > 0) scrollers.add(page)
    const positions = [...scrollers].map((element) => ({ element, top: element.scrollTop }))
    const open = () => {
      frameRef.current = null
      if (onLocalSelect) onLocalSelect(tab)
      else router.push(tab === 'dashboard' ? '/portal/finances' : `/portal/finances?view=${tab}`)
    }
    if (!positions.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      positions.forEach(({ element }) => { element.scrollTop = 0 })
      open()
      return
    }
    let start: number | null = null
    const scroll = (now: number) => {
      if (start === null) start = now
      const progress = Math.min((now - start) / 320, 1)
      const remaining = (1 - progress) ** 3
      positions.forEach(({ element, top }) => { element.scrollTop = top * remaining })
      if (progress < 1) frameRef.current = requestAnimationFrame(scroll)
      else open()
    }
    frameRef.current = requestAnimationFrame(scroll)
  }

  return <div ref={containerRef} className="hidden min-w-0 shrink-0 overflow-x-auto xl:flex">
    <PortalAnimatedTabs variant="slider" ariaLabel="Finances sections" tabs={tabs} activeTab={activeTab} className={bare ? '!rounded-none !border-0 !bg-transparent !p-0' : ''} onTabChange={(tab) => {
      selectTab(tab)
    }} />
  </div>
}
