'use client'

import React, { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
const LUXOR_PORTAL_EASE = [0.22, 1, 0.36, 1] as const
import { AlertTriangle, Calendar, ChevronDown, ChevronLeft, ChevronRight, X, Pencil, Loader2, ArrowLeft, Check, Search, SlidersHorizontal } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from '@/components/portal/ToastProvider'
import { LuxorDatePicker } from '@/components/LuxorDatePicker'

export function PortalPageFrame({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  // Replace 'overflow-hidden' with 'overflow-visible' to prevent clipping of the page header icon's glow
  // and table card shadows. Since the content containers (like PortalTableCard) handle their own internal scroll,
  // the page frame can safely allow shadows/glows to overflow into the surrounding page padding.
  const processedClassName = className.replace(/\boverflow-hidden\b/g, 'overflow-visible')
  return <div className={`mx-auto flex min-h-full min-w-0 w-full max-w-[1500px] flex-col gap-4 sm:gap-6 ${processedClassName}`}>{children}</div>
}

export function PortalPageHeader({
  icon,
  title,
  titleAccessory,
  description,
  actions,
  mobileActionsInline = false,
  hideBackButton = false,
  titleClassName,
}: {
  icon?: React.ReactNode
  title: string
  titleAccessory?: React.ReactNode
  description?: string
  actions?: React.ReactNode
  mobileActionsInline?: boolean
  hideBackButton?: boolean
  titleClassName?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const canGoBack = pathname !== '/portal'

  const goBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }

    router.push('/portal')
  }

  return (
    <div className={`flex shrink-0 gap-2 sm:gap-3 ${mobileActionsInline ? 'flex-wrap items-center justify-between gap-x-2 sm:flex-nowrap sm:gap-3' : 'flex-col md:flex-row md:items-start md:justify-between'}`}>
      <div className={`${description ? 'space-y-1 sm:space-y-1.5' : ''} ${mobileActionsInline ? 'min-w-0 shrink-0' : ''}`}>
        <div className={`flex items-center ${mobileActionsInline ? 'gap-2 sm:gap-3' : 'gap-2.5 sm:gap-3'}`}>
          {canGoBack && !hideBackButton ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
              aria-label="Go back"
              title="Go back"
            >
              <ArrowLeft size={14} />
            </button>
          ) : null}
          {icon ? <span className="shrink-0 text-[#caa24c]">{icon}</span> : null}
          <h1 className={`font-serif font-semibold leading-tight text-[color:var(--portal-text)] ${titleClassName || (mobileActionsInline ? 'whitespace-nowrap text-xl sm:text-3xl' : 'text-2xl sm:text-3xl')}`}>{title}</h1>
          {titleAccessory}
        </div>
        {description ? <p className="max-w-2xl text-xs sm:text-sm font-medium leading-relaxed sm:leading-6 text-zinc-500">{description}</p> : null}
      </div>
      {actions ? <div className={`flex flex-wrap items-center gap-3 ${mobileActionsInline ? 'ml-auto shrink-0' : ''}`}>{actions}</div> : null}
    </div>
  )
}

type PortalButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type PortalButtonSize = 'sm' | 'md'

export function PortalButton({
  children,
  className = '',
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PortalButtonVariant
  size?: PortalButtonSize
}) {
  const variantClasses: Record<PortalButtonVariant, string> = {
    primary: 'border-[#caa24c] bg-[#caa24c] text-white shadow-lg shadow-[#caa24c]/15 hover:border-[#dfbd68] hover:bg-[#dfbd68]',
    secondary: 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/25 hover:text-[color:var(--portal-text)]',
    ghost: 'border-transparent bg-transparent text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]',
    danger: 'border-red-500/25 bg-red-500/10 text-red-300 hover:border-red-500/40 hover:bg-red-500/15',
  }
  const sizeClasses: Record<PortalButtonSize, string> = {
    sm: 'min-h-9 px-3 py-2 text-[9px]',
    md: 'min-h-10 px-4 py-2.5 text-[10px]',
  }

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-black uppercase tracking-[0.12em] transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 disabled:pointer-events-none disabled:opacity-40 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function PortalCheckbox({
  checked,
  onChange,
  label,
  sublabel,
  disabled = false,
  className = '',
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: React.ReactNode
  sublabel?: React.ReactNode
  disabled?: boolean
  className?: string
  id?: string
}) {
  return (
    <label className={`inline-flex items-center gap-2.5 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
          checked
            ? 'border-[#caa24c] bg-[#caa24c] text-white shadow-sm'
            : 'border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] hover:border-[#caa24c]/40'
        }`}
      >
        {checked && <Check size={11} strokeWidth={3.5} className="!text-white !stroke-white text-white stroke-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />}
      </div>
      {(label || sublabel) && (
        <div className="flex flex-col">
          {label && <span className="text-xs font-semibold text-[color:var(--portal-text)]">{label}</span>}
          {sublabel && <span className="text-[10px] text-[color:var(--portal-muted)]">{sublabel}</span>}
        </div>
      )}
    </label>
  )
}

type PortalAnimatedTabItem<T extends string> = {
  id: T
  label: string
  icon?: React.ReactNode
  count?: number
}

export function PortalAnimatedTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className = '',
  buttonClassName = '',
  ariaLabel = 'Portal tabs',
}: {
  tabs: readonly PortalAnimatedTabItem<T>[]
  activeTab: T
  onTabChange: (tab: T) => void
  className?: string
  buttonClassName?: string
  ariaLabel?: string
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const buttonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicator, setIndicator] = React.useState({ left: 0, width: 0, visible: false })
  const tabsSignature = tabs.map((tab) => `${tab.id}:${tab.label}:${tab.count ?? ''}`).join('|')

  React.useLayoutEffect(() => {
    let frame = 0

    const updateIndicator = () => {
      const activeButton = buttonRefs.current[activeTab]
      if (!activeButton) return

      const nextIndicator = {
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
        visible: true,
      }

      setIndicator((current) => {
        if (
          current.left === nextIndicator.left &&
          current.width === nextIndicator.width &&
          current.visible === nextIndicator.visible
        ) {
          return current
        }

        return nextIndicator
      })
    }

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateIndicator)
    }

    scheduleUpdate()

    const observer =
      typeof window !== 'undefined' && 'ResizeObserver' in window
        ? new ResizeObserver(scheduleUpdate)
        : null

    if (observer) {
      if (containerRef.current) observer.observe(containerRef.current)
      const activeButton = buttonRefs.current[activeTab]
      if (activeButton) observer.observe(activeButton)
    }

    window.addEventListener('resize', scheduleUpdate)

    return () => {
      window.removeEventListener('resize', scheduleUpdate)
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [activeTab, tabsSignature])

  return (
    <nav ref={containerRef} aria-label={ariaLabel} className={`relative inline-flex shrink-0 min-w-max items-stretch gap-5 ${className}`}>
      <span
        className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-[#caa24c] transition-[left,width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{
          left: indicator.left,
          width: indicator.width,
          opacity: indicator.visible ? 1 : 0,
        }}
      />
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            ref={(node) => {
              buttonRefs.current[tab.id] = node
            }}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-0 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
              isActive
                ? 'text-[#a8792f]'
                : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            } ${buttonClassName}`}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span
                className={`rounded-full px-1.5 py-0.5 tabular-nums font-bold text-[9px] ${
                  isActive ? 'bg-[#caa24c]/12 text-[#a8792f]' : 'bg-black/5 text-[color:var(--portal-muted)]'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

export function PortalTabTransition({
  activeKey,
  children,
  className = '',
  mode = 'wait',
}: {
  activeKey: string
  children: React.ReactNode
  className?: string
  mode?: 'sync' | 'wait' | 'popLayout'
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence mode={mode} initial={false}>
      <motion.div
        key={activeKey}
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0.72, filter: 'blur(10px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, filter: 'blur(10px)' }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: LUXOR_PORTAL_EASE }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export function PortalTableCard({
  controls,
  children,
  footer,
  className = '',
  footerClassName = '',
  mobilePageScroll = false,
  mobilePageScrollUntil = 'md',
  stickyMobileControls = true,
}: {
  controls?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  footerClassName?: string
  /**
   * Lets a card's rows join the page scroll on phones instead of trapping
   * them in a very short nested table area.
   */
  mobilePageScroll?: boolean
  mobilePageScrollUntil?: 'md' | 'lg'
  stickyMobileControls?: boolean
}) {
  const isStickyMobile = mobilePageScroll && stickyMobileControls
  const mobilePageScrollContainerClass = mobilePageScroll
    ? mobilePageScrollUntil === 'lg' ? 'max-lg:flex-none' : 'max-md:flex-none'
    : ''
  const mobilePageScrollContentClass = mobilePageScroll
    ? mobilePageScrollUntil === 'lg' ? 'max-lg:flex-none max-lg:overflow-visible' : 'max-md:flex-none max-md:overflow-visible'
    : ''
  const mobileOverflowClass = mobilePageScroll
    ? mobilePageScrollUntil === 'lg' ? 'max-lg:overflow-visible lg:overflow-hidden' : 'max-md:overflow-visible md:overflow-hidden'
    : 'overflow-hidden'
  const mobileStickyControlsClass = isStickyMobile
    ? mobilePageScrollUntil === 'lg'
      ? 'max-lg:sticky max-lg:top-0 max-lg:z-30 max-lg:bg-[#fffdf9]/85 max-lg:dark:bg-[#080706]/80 max-lg:backdrop-blur-2xl max-lg:shadow-sm'
      : 'max-md:sticky max-md:top-0 max-md:z-30 max-md:bg-[#fffdf9]/85 max-md:dark:bg-[#080706]/80 max-md:backdrop-blur-2xl max-md:shadow-sm'
    : ''

  return (
    <section className={`nodal-void-card flex min-h-0 flex-1 flex-col ${mobileOverflowClass} rounded-none sm:rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl shadow-black/30 ${mobilePageScroll ? 'md:backdrop-blur-xl md:portal-render-surface' : 'backdrop-blur-xl portal-render-surface'} ${mobilePageScrollContainerClass} ${className}`}>
      {controls ? (
        <div
          style={{ WebkitBackdropFilter: isStickyMobile ? 'blur(24px)' : undefined }}
          className={`shrink-0 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] py-3 px-4 sm:px-6 transition-shadow ${mobileStickyControlsClass}`}
        >
          {controls}
        </div>
      ) : null}
      <div className={`portal-scrollbar flex-1 overflow-auto ${mobilePageScrollContentClass}`} data-portal-table-scroller>
        {children}
      </div>
      {footer ? <div className={`shrink-0 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] py-4 px-4 sm:px-6 flex items-center ${footerClassName}`}>{footer}</div> : null}
    </section>
  )
}

export type PortalActiveFilter = {
  id: string
  label: string
  onRemove: () => void
}

export function PortalFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  resultLabel,
  activeFilters = [],
  onClearFilters,
  children,
  defaultExpanded = false,
  className = '',
  searchWidthClassName = 'w-full sm:w-72 md:w-80',
}: {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  resultLabel?: string
  activeFilters?: PortalActiveFilter[]
  onClearFilters?: () => void
  children?: React.ReactNode
  defaultExpanded?: boolean
  className?: string
  searchWidthClassName?: string
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const hasFilterControls = Boolean(children)
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`relative min-w-0 ${searchWidthClassName}`}>
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className={`h-9 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] pl-9 text-xs font-semibold text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 focus:ring-2 focus:ring-[#caa24c]/10 ${
              searchValue && hasFilterControls ? 'pr-16' : hasFilterControls || searchValue ? 'pr-10' : 'pr-4'
            }`}
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {searchValue ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="portal-inline-action inline-flex h-6 w-6 !min-w-0 !min-h-0 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 cursor-pointer"
              >
                <X size={12} />
              </button>
            ) : null}

            {hasFilterControls ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={activeFilters.length ? `Filter options (${activeFilters.length} active)` : 'Filter options'}
                title={activeFilters.length ? `Filters (${activeFilters.length} active)` : 'Filters'}
                onClick={() => setExpanded((current) => !current)}
                className={`portal-inline-action relative inline-flex h-6 w-6 !min-w-0 !min-h-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 cursor-pointer ${
                  expanded || activeFilters.length
                    ? 'bg-[#caa24c]/15 text-[#9a712e] dark:text-[#f1d27a]'
                    : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                }`}
              >
                <SlidersHorizontal size={13} />
                <AnimatePresence initial={false}>
                  {activeFilters.length ? (
                    <motion.span
                      key={activeFilters.length}
                      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.45, y: -2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.55, y: -2 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: [0.23, 1, 0.32, 1] }}
                      aria-hidden="true"
                      className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#caa24c] px-0.5 text-[8px] font-black text-[#18130d] leading-none shadow-xs"
                    >
                      {activeFilters.length}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </button>
            ) : null}
          </div>
        </div>

        {resultLabel ? (
          <span className="shrink-0 px-1 tabular-nums text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">
            {resultLabel}
          </span>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {expanded && hasFilterControls ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-[color:var(--portal-border)] pt-3">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {activeFilters.length ? (
          <motion.div
            key="active-filter-container"
            initial={shouldReduceMotion ? false : { width: 0, height: 0, opacity: 0 }}
            animate={{ width: '100%', height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { width: 0, height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="max-w-full overflow-hidden"
            aria-label="Active filters"
          >
            <motion.div layout className="flex flex-wrap items-center gap-1.5">
              <AnimatePresence initial={false} mode="popLayout">
                {activeFilters.map((filter) => (
                  <motion.span
                    key={`${filter.id}:${filter.label}`}
                    layout
                    initial={shouldReduceMotion ? false : { opacity: 0, width: 0, scale: 0.96 }}
                    animate={{ opacity: 1, width: 'auto', scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, width: 0, scale: 0.96 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
                    className="inline-flex h-7 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border border-[#caa24c]/20 bg-[#caa24c]/8 pl-2.5 pr-1.5 text-[10px] font-semibold text-[#8a652b] dark:text-[#dfbd68]"
                  >
              {filter.label}
              <button
                type="button"
                onClick={filter.onRemove}
                aria-label={`Remove ${filter.label} filter`}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-current transition-colors hover:bg-[#caa24c]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"
              >
                <X size={10} />
              </button>
                  </motion.span>
                ))}
              </AnimatePresence>
              <AnimatePresence initial={false}>
                {activeFilters.length > 1 && onClearFilters ? (
                  <motion.button
                    type="button"
                    onClick={onClearFilters}
                    initial={shouldReduceMotion ? false : { opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, width: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
                    className="h-7 overflow-hidden whitespace-nowrap px-2 text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"
                  >
                    Clear all
                  </motion.button>
                ) : null}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function PortalStickyTable({
  children,
  minWidth = '960px',
}: {
  children: React.ReactNode
  minWidth?: string
}) {
  return (
    <table className="portal-data-table w-full text-left" style={{ minWidth }}>
      {children}
    </table>
  )
}

export function PortalStickyThead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-20 border-b border-[color:var(--portal-border)] shadow-[0_1px_0_rgba(124,91,36,0.08)]">
      {children}
    </thead>
  )
}

export function PortalPagination({
  currentPage,
  totalPages,
  onPageChange,
  scrollToTop = true,
}: {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  scrollToTop?: boolean
}) {
  if (totalPages <= 1) return null

  const handlePageSelect = (page: number) => {
    onPageChange(page)
    if (scrollToTop && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      const portalContentScroller = document.querySelector('main .portal-scrollbar') as HTMLElement | null
      if (portalContentScroller) {
        portalContentScroller.scrollTo({ top: 0, behavior: 'smooth' })
      }
      const tableScroller = document.querySelector('[data-portal-table-scroller]') as HTMLElement | null
      if (tableScroller) {
        tableScroller.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }

  const buttonClass = 'flex h-11 w-11 items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:bg-[#caa24c]/10 hover:text-[color:var(--portal-text)] disabled:pointer-events-none disabled:opacity-35 sm:h-8 sm:w-8'
  const pageOptions = Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1
    return { value: String(page), label: `Page ${page} of ${totalPages}` }
  })

  return (
    <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Pagination">
      <button type="button" aria-label="Previous page" title="Previous page" disabled={currentPage === 1} onClick={() => handlePageSelect(currentPage - 1)} className={buttonClass}>
        <ChevronLeft size={15} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <PortalSelect
        value={String(currentPage)}
        onChange={(value) => handlePageSelect(Number(value))}
        options={pageOptions}
        className="!min-w-0 w-28 sm:w-[124px]"
        buttonClassName="h-11 rounded-md bg-[color:var(--portal-card)] px-2 tabular-nums text-[10px] font-semibold sm:h-8"
      />
      <button type="button" aria-label="Next page" title="Next page" disabled={currentPage === totalPages} onClick={() => handlePageSelect(currentPage + 1)} className={buttonClass}>
        <ChevronRight size={15} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </nav>
  )
}

export function PortalBridgeCard({
  label,
  title,
  description,
  action,
}: {
  label: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <section className="portal-render-surface relative isolate overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-2xl shadow-black/20">
      <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[#caa24c]/10 blur-3xl" />
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#caa24c]">{label}</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-[color:var(--portal-text)]">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--portal-muted)]">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </section>
  )
}

export function PortalEmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description: string
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="portal-render-surface flex flex-col items-center justify-center rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-10 text-center">
      {icon ? <div className="mb-4 text-[color:var(--portal-muted)]">{icon}</div> : null}
      <h3 className="text-base font-bold text-[color:var(--portal-text)]">{title}</h3>
      <p className="mt-2 max-w-md text-xs leading-5 text-[color:var(--portal-muted)]">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

export type PortalStatusTone = 'red' | 'blue' | 'gold' | 'green' | 'purple' | 'neutral'

const STATUS_TONES: Record<string, PortalStatusTone> = {
  overdue: 'red', error: 'red', failed: 'red', no_show: 'red', urgent: 'red',
  new: 'purple', new_lead: 'purple', post_tour: 'purple',
  contacted: 'blue', sent: 'blue', viewed: 'blue', unread: 'blue', active: 'blue', pending: 'blue', scheduled: 'blue',
  tentative: 'gold', tour_requested: 'neutral', tour_confirmed: 'blue', proposal_sent: 'blue', awaiting_signature: 'blue', upcoming: 'gold', needs_outcome: 'gold', needs_schedule: 'neutral', needs_follow_up: 'gold', high: 'gold', partial: 'gold',
  booked: 'green', confirmed: 'green', completed: 'green', attended: 'green', paid: 'green', signed: 'green',
  closed_lost: 'neutral', draft: 'neutral', cancelled: 'neutral', canceled: 'neutral', not_sent: 'neutral', void: 'neutral', refunded: 'neutral',
}

const STATUS_TONE_STYLES: Record<PortalStatusTone, string> = {
  red: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300',
  blue: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-300',
  gold: 'border-[#dfc98f] bg-[#fbf5e7] text-[#76591f] dark:border-[#caa24c]/35 dark:bg-[#caa24c]/10 dark:text-[#f1d27a]',
  green: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  purple: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-300',
  neutral: 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]',
}

function formatStatusText(s: string) {
  return s
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export const PortalStatusBadge = React.memo(function PortalStatusBadge({ status, tone, warning = false }: { status: string; tone?: PortalStatusTone; warning?: boolean }) {
  const normalized = status.toLowerCase().replace(/\s+/g, '_')
  const badgeStyle = STATUS_TONE_STYLES[tone ?? STATUS_TONES[normalized] ?? 'neutral']
  const warningStyle = 'border-dashed border-amber-700 bg-amber-100 text-amber-950 ring-1 ring-amber-500/60 dark:border-amber-300 dark:bg-amber-500/20 dark:text-amber-200'

  return (
    <span aria-label={warning ? `Warning: ${formatStatusText(status)}` : undefined} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${warning ? warningStyle : badgeStyle}`}>
      {warning ? <AlertTriangle size={11} aria-hidden="true" /> : null}
      {formatStatusText(status)}
    </span>
  )
})

export function PortalTimeline({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative space-y-6 border-l border-[color:var(--portal-border)] pl-6">
      {children}
    </div>
  )
}

export function PortalTimelineItem({
  title,
  time,
  icon,
  children,
  badge,
}: {
  title: string
  time: string
  icon?: React.ReactNode
  children?: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="relative">
      <div className="absolute -left-[31px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] shadow-sm">
        {icon ?? <div className="h-1.5 w-1.5 rounded-full bg-zinc-600" />}
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-xs font-bold text-[color:var(--portal-text)] uppercase tracking-widest">{title}</h4>
          <span className="text-[10px] text-[color:var(--portal-muted)] tabular-nums font-semibold">{time}</span>
          {badge ? <div className="ml-auto">{badge}</div> : null}
        </div>
        {children ? <div className="mt-2 text-xs leading-relaxed text-[color:var(--portal-muted)]">{children}</div> : null}
      </div>
    </div>
  )
}

export function PortalCloseButton({
  onClick,
  className = '',
  'aria-label': ariaLabel = 'Close',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`portal-close-button relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 opacity-75 transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 cursor-pointer ${className}`}
      aria-label={ariaLabel}
      {...props}
    >
      <X size={14} />
    </button>
  )
}

const ModalDepthContext = React.createContext(0)

export function PortalModal({
  isOpen,
  onClose,
  title,
  description,
  ariaLabel,
  children,
  footer,
  maxWidth = 'max-w-lg',
  zIndex,
  className = '',
}: {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  ariaLabel?: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
  zIndex?: number
  className?: string
}) {
  const depth = React.useContext(ModalDepthContext)
  const computedZIndex = zIndex ?? (200 + depth * 10)
  const [mounted, setMounted] = React.useState(false)
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null)
  const onCloseRef = React.useRef(onClose)
  const titleId = React.useId()

  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  React.useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      ;(firstFocusable ?? dialogRef.current)?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('[data-portal-popover="true"]')) return
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence initial={false} mode="wait">
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          style={{ zIndex: computedZIndex }}
          className="fixed inset-0 flex items-center justify-center p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 bg-black/75 backdrop-blur-md cursor-default"
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : ariaLabel ?? 'Portal dialog'}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 8, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, y: 8, filter: 'blur(8px)' }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className={`relative z-10 flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)] w-full ${maxWidth} ${className} transform-gpu flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] shadow-2xl outline-none sm:max-h-[90vh]`}
          >
            <ModalDepthContext.Provider value={depth + 1}>
              {title ? (
                <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 sm:px-6 sm:py-4">
                  <div className="min-w-0">
                    <h3 id={titleId} className="text-sm font-bold uppercase tracking-widest text-[color:var(--portal-text)]">{title}</h3>
                    {description ? <p className="mt-1 max-w-xl text-[11px] leading-5 text-[color:var(--portal-muted)]">{description}</p> : null}
                  </div>
                  <PortalCloseButton onClick={onClose} aria-label={`Close ${title}`} />
                </div>
              ) : null}
              {title || footer ? (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 portal-scrollbar sm:p-6">
                    {children}
                  </div>
                  {footer ? (
                    <div className="shrink-0 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-4 sm:px-6 sm:py-4">
                      {footer}
                    </div>
                  ) : null}
                </>
              ) : children}
            </ModalDepthContext.Provider>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export function PortalDetailSection({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="nodal-void-card portal-render-surface rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-xl backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export function PortalSelect({
  value,
  onChange,
  options,
  className = '',
  buttonClassName = '',
  placeholder = 'Select option...',
  disabled = false,
  theme = 'portal',
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  className?: string
  buttonClassName?: string
  placeholder?: string
  disabled?: boolean
  theme?: 'portal' | 'light'
  'aria-label'?: string
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const selectedOption = options.find((opt) => opt.value === value)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number; maxHeight: number }>({ top: 0, left: 0, width: 0, maxHeight: 360 })
  const isLight = theme === 'light'

  const updateCoords = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const viewportPadding = 8
      const width = Math.min(rect.width, Math.max(0, window.innerWidth - viewportPadding * 2))
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding)
      const spaceAbove = Math.max(0, rect.top - viewportPadding)
      const dropdownScrollHeight = dropdownRef.current ? dropdownRef.current.scrollHeight : 220
      const opensAbove = spaceBelow < Math.min(dropdownScrollHeight, 220) + 6 && spaceAbove > spaceBelow
      const availableSpace = Math.max(160, opensAbove ? spaceAbove : spaceBelow)
      const maxHeight = Math.min(380, availableSpace)
      const height = Math.min(dropdownScrollHeight, maxHeight)
      const top = opensAbove ? rect.top - height - 6 : rect.bottom + 6
      const nextCoords = {
        top: Math.max(viewportPadding, Math.min(top, window.innerHeight - height - viewportPadding)),
        left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding)),
        width,
        maxHeight,
      }
      setCoords((current) => {
        if (current.top === nextCoords.top && current.left === nextCoords.left && current.width === nextCoords.width && current.maxHeight === nextCoords.maxHeight) {
          return current
        }
        return nextCoords
      })
    }
  }, [])

  React.useEffect(() => {
    if (isOpen) {
      updateCoords()
      let frame = 0
      const scheduleCoords = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(updateCoords)
      }
      window.addEventListener('resize', scheduleCoords)
      window.addEventListener('scroll', scheduleCoords, true)

      return () => {
        window.removeEventListener('resize', scheduleCoords)
        window.removeEventListener('scroll', scheduleCoords, true)
        cancelAnimationFrame(frame)
      }
    }
  }, [isOpen, updateCoords])

  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        window.requestAnimationFrame(() => buttonRef.current?.focus())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return (
    <div className={`relative min-w-[140px] select-none ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return
          updateCoords()
          setIsOpen((current) => !current)
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`portal-select-trigger flex min-h-11 w-full cursor-pointer items-center justify-between gap-2.5 rounded-lg border px-3 py-1.5 text-xs transition-all duration-150 hover:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/30 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-8 ${isLight ? 'border-[#d8c4a4] bg-[#fffdfa] text-[#3b2b1d]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'} ${buttonClassName}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-[color:var(--portal-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {typeof document !== 'undefined' ? createPortal(
        <AnimatePresence initial={false}>
          {isOpen ? (
            <React.Fragment key="portal-select">
              <motion.div
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                className="fixed inset-0 z-[9990] cursor-default"
                onClick={() => setIsOpen(false)}
              />
              <motion.div
                ref={dropdownRef}
                role="listbox"
                data-portal-popover="true"
                data-scroll-lock="true"
                initial={{ opacity: 0, y: -8, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.985 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className={`portal-scrollbar fixed z-[9999] max-h-[380px] overflow-y-auto overscroll-contain rounded-md border p-1.5 shadow-2xl ring-1 ring-black/5 ${isLight ? 'portal-scrollbar-light border-[#d8c4a4] bg-[#fffdfa] shadow-[#3b2b1d]/15' : 'border-[color:var(--portal-border,rgba(202,162,76,0.18))] shadow-black/35'}`}
                style={{
                  top: `${coords.top}px`,
                  left: `${coords.left}px`,
                  width: `${coords.width}px`,
                  maxHeight: `${coords.maxHeight}px`,
                  backgroundColor: isLight ? '#fffdfa' : 'color-mix(in srgb, var(--portal-bg, #080706) 82%, transparent)',
                  backdropFilter: isLight ? 'none' : 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)'
                }}
              >
                  <div className="space-y-0.5">
                    {options.map((opt) => {
                      const isSelected = opt.value === value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            onChange(opt.value)
                            setIsOpen(false)
                          }}
                            className={`group flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                            isSelected
                              ? isLight ? 'border-[#b98a3d]/40 bg-[#f5ead8] text-[#6f4d1f]' : 'border-[#caa24c]/24 bg-[#caa24c]/12 text-[#f1d27a] shadow-[0_0_0_1px_rgba(202,162,76,0.08)]'
                              : isLight ? 'border-transparent text-[#5b4632] hover:border-[#d8c4a4] hover:bg-[#f8f1e6] hover:text-[#3b2b1d]' : 'border-transparent text-[color:var(--portal-muted,#d7c29a)] hover:border-[color:var(--portal-border,rgba(202,162,76,0.16))] hover:bg-white/5 hover:text-[color:var(--portal-text,#f7efe3)]'
                          }`}
                        >
                          <span>{opt.label}</span>
                          <span className={`text-[9px] transition-opacity duration-150 ${isSelected ? isLight ? 'text-[#8d672b]' : 'text-[#f1d27a]' : isLight ? 'text-[#8d672b] opacity-0 group-hover:opacity-100' : 'text-[color:var(--portal-muted,#d7c29a)] opacity-0 group-hover:opacity-100'}`}>
                            ●
                          </span>
                        </button>
                      )
                    })}
                  </div>
              </motion.div>
            </React.Fragment>
          ) : null}
        </AnimatePresence>,
        document.body
      ) : null}
    </div>
  )
}

export function PortalDatePicker({
  value, onChange, className = '', placeholder = 'Select Date...', theme = 'portal', minDate, maxMonths, availableDates, allowPastDates = true,
}: {
  value: string
  onChange: (val: string) => void
  className?: string
  placeholder?: string
  theme?: 'portal' | 'light'
  minDate?: string
  maxMonths?: number
  availableDates?: Set<string>
  allowPastDates?: boolean
}) {
  return <LuxorDatePicker value={value} onChange={onChange} className={className} placeholder={placeholder} theme={theme} minDate={minDate} maxMonths={maxMonths} availableDates={availableDates} timeZone={maxMonths === undefined ? undefined : 'America/Chicago'} allowPastDates={allowPastDates} openToValue label="Date" />
}

export function PortalContactAvatar({
  name,
  avatarUrl,
  inquiryId,
  size = 'md',
  className = '',
  onAvatarUpdate,
}: {
  name: string
  avatarUrl?: string | null
  inquiryId?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
  onAvatarUpdate?: (newUrl: string) => void
}) {
  const initials = React.useMemo(() => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }, [name])

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
    xl: 'w-16 h-16 text-xl',
    '2xl': 'w-20 h-20 text-2xl',
  }

  const [showEditOverlay, setShowEditOverlay] = useState(false)
  const hoverTimeoutRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const { notify } = useToast()

  const handleMouseEnter = () => {
    if (!inquiryId) return
    hoverTimeoutRef.current = window.setTimeout(() => {
      setShowEditOverlay(true)
    }, 1600)
  }

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setShowEditOverlay(false)
  }

  const handlePencilClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !inquiryId) return

    setIsUploading(true)
    try {
      // 1. Upload to storage
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', `avatar-${inquiryId}`)
      formData.append('category', 'avatar')
      formData.append('makeBrandAsset', 'false')

      const uploadRes = await fetch('/api/portal/upload', {
        method: 'POST',
        body: formData,
      })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed')

      const publicUrl = uploadData.url

      // 2. Fetch current lead metadata
      const leadRes = await fetch(`/api/inquiries?id=${inquiryId}`)
      const leadData = await leadRes.json()
      if (!leadRes.ok) throw new Error(leadData.error || 'Failed to fetch current lead details')

      const updatedMetadata = {
        ...(leadData.metadata || {}),
        avatar_url: publicUrl,
      }

      // 3. PATCH update
      const patchRes = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inquiryId, metadata: updatedMetadata }),
      })
      const patchData = await patchRes.json()
      if (!patchRes.ok) throw new Error(patchData.error || 'Failed to update avatar in database')

      notify({ title: 'Avatar updated successfully', variant: 'success' })
      if (onAvatarUpdate) {
        onAvatarUpdate(publicUrl)
      }
    } catch (err) {
      console.error('Avatar update failed:', err)
      notify({
        title: 'Avatar update failed',
        description: err instanceof Error ? err.message : 'An error occurred during upload.',
        variant: 'error',
      })
    } finally {
      setIsUploading(false)
      setShowEditOverlay(false)
    }
  }

  // Split classes to avoid conflicts when custom overrides are passed
  const sizeClassParts = sizeClasses[size].split(' ')
  const customParts = className.split(' ')

  const hasWidth = customParts.some(p => p.startsWith('w-'))
  const hasHeight = customParts.some(p => p.startsWith('h-'))
  const hasText = customParts.some(p => p.startsWith('text-'))

  const filteredSizeClasses = sizeClassParts.filter(part => {
    if (part.startsWith('w-') && hasWidth) return false
    if (part.startsWith('h-') && hasHeight) return false
    if (part.startsWith('text-') && hasText) return false
    return true
  }).join(' ')

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative flex shrink-0 items-center justify-center rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 font-serif font-semibold text-[#caa24c] shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)] transition-all duration-300 ${filteredSizeClasses} ${
        inquiryId ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* Edit Overlay */}
      {showEditOverlay && (
        <div
          onClick={handlePencilClick}
          className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/60 transition-all duration-200 hover:bg-black/70"
          title="Change avatar"
        >
          {isUploading ? (
            <Loader2 className="animate-spin text-white" size={size === 'sm' ? 12 : size === 'md' ? 14 : 18} />
          ) : (
            <Pencil className="text-white" size={size === 'sm' ? 11 : size === 'md' ? 13 : 16} />
          )}
        </div>
      )}

      {/* Hidden file input */}
      {inquiryId && (
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
          disabled={isUploading}
        />
      )}

      {/* Avatar Content */}
      <div className={`w-full h-full flex items-center justify-center ${showEditOverlay ? 'blur-[1.5px]' : ''}`}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover rounded-full"
          />
        ) : (
          initials
        )}
      </div>
    </div>
  )
}

export function PortalStaggerGroup({
  children,
  className = '',
  staggerDelay = 0.045,
  delayChildren = 0.01,
}: {
  children: React.ReactNode
  className?: string
  staggerDelay?: number
  delayChildren?: number
}) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function PortalStaggerCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      ref={ref}
      variants={{
        hidden: { opacity: 0.55, filter: 'blur(10px)' },
        show: {
          opacity: 1,
          filter: 'blur(0px)',
          transition: {
            duration: 0.32,
            ease: LUXOR_PORTAL_EASE,
          },
        },
      }}
      className={`transform-gpu ${className}`}
      onAnimationComplete={(definition) => {
        if (definition === 'show' && ref.current) {
          ref.current.style.filter = 'none'
          ref.current.style.transform = 'none'
        }
      }}
    >
      {children}
    </motion.div>
  )
}

export function PortalSkeletonTransition({
  loading,
  skeleton,
  children,
  className = '',
  overlap = false,
}: {
  loading: boolean
  skeleton: React.ReactNode
  children: React.ReactNode
  className?: string
  overlap?: boolean
}) {
  const reduceMotion = useReducedMotion()

  if (overlap) {
    return <div className={`grid min-w-0 ${className}`} aria-busy={loading}>
      <AnimatePresence initial={false}>
        {loading && <motion.div key="skeleton" className="col-start-1 row-start-1 z-10 pointer-events-none" initial={false} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(12px)' }} transition={{ duration: reduceMotion ? 0 : 0.28 }}>{skeleton}</motion.div>}
      </AnimatePresence>
      {!loading && <motion.div className="col-start-1 row-start-1 min-w-0" initial={reduceMotion ? false : { opacity: 0.65, filter: 'blur(12px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: LUXOR_PORTAL_EASE }}>{children}</motion.div>}
    </div>
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.div
          key="portal-skeleton-state"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0.75, filter: 'blur(0px)' }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(12px)' }}
          transition={{ duration: reduceMotion ? 0.05 : 0.28, ease: LUXOR_PORTAL_EASE }}
          className={className}
        >
          {skeleton}
        </motion.div>
      ) : (
        <motion.div
          key="portal-content-state"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0.65, filter: 'blur(12px)' }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(12px)' }}
          transition={{ duration: reduceMotion ? 0.05 : 0.32, ease: LUXOR_PORTAL_EASE }}
          onAnimationComplete={(definition) => {
            if (definition === 'animate' && typeof document !== 'undefined') {
              const elements = document.querySelectorAll('[data-portal-blur-cleanup="true"]')
              elements.forEach((el) => {
                ;(el as HTMLElement).style.filter = 'none'
                ;(el as HTMLElement).style.transform = 'none'
              })
            }
          }}
          data-portal-blur-cleanup="true"
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function PortalTourCardSkeleton() {
  return (
    <article className="portal-card-surface relative flex flex-col justify-between rounded-xl border border-[color:var(--portal-border)] p-4 shadow-sm">
      <div className="relative z-10">
        <div className="flex min-w-0 items-start gap-3">
          <PortalSkeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1 space-y-1.5">
                <PortalSkeleton className="h-4 w-36 rounded" />
                <PortalSkeleton className="h-3 w-48 rounded" />
              </div>
              <PortalSkeleton className="h-5 w-24 shrink-0 rounded-full" />
            </div>
            <PortalSkeleton className="mt-2 h-2.5 w-32 rounded" />
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <PortalSkeleton className="h-2.5 w-16 rounded" />
            <PortalSkeleton className="h-4 w-36 rounded" />
            <PortalSkeleton className="h-3 w-28 rounded" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PortalSkeleton className="h-11 w-full rounded-lg" />
            <PortalSkeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex flex-col gap-2.5 border-t border-[color:var(--portal-border)] pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <PortalSkeleton className="h-3 w-8 shrink-0 rounded" />
          <PortalSkeleton className="h-11 flex-1 rounded-lg" />
        </div>
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5">
          <PortalSkeleton className="h-11 min-w-0 rounded-lg" />
          <PortalSkeleton className="h-11 w-16 rounded-lg" />
          <PortalSkeleton className="h-11 w-11 rounded-lg" />
        </div>
      </div>
    </article>
  )
}

export function PortalClientCardSkeleton() {
  return (
    <article className="portal-card-surface relative flex flex-col justify-between rounded-xl border border-[color:var(--portal-border)] p-4 shadow-sm">
      <div className="relative z-10">
        <div className="flex min-w-0 items-start gap-3">
          <PortalSkeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1 space-y-1.5">
                <PortalSkeleton className="h-4 w-36 rounded" />
                <PortalSkeleton className="h-3 w-44 rounded" />
              </div>
              <PortalSkeleton className="h-5 w-20 shrink-0 rounded-full" />
            </div>
            <PortalSkeleton className="mt-2 h-2.5 w-32 rounded" />
          </div>
        </div>
        <div className="mt-3 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
          <PortalSkeleton className="h-3 w-28 rounded" />
          <PortalSkeleton className="h-3 w-32 rounded" />
          <PortalSkeleton className="h-3 w-24 rounded" />
          <PortalSkeleton className="h-3 w-36 rounded" />
        </div>
        <PortalSkeleton className="mt-3 h-3 w-28 rounded" />
      </div>
      <div className="relative mt-3 flex items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">
        <PortalSkeleton className="h-11 flex-1 rounded-lg" />
        <PortalSkeleton className="h-11 w-11 shrink-0 rounded-lg" />
      </div>
    </article>
  )
}

export function PortalKanbanBoardSkeleton({
  columns = [
    { id: 'newsletter', short: 'Newsletter' },
    { id: 'inquiry', short: 'Inquiry' },
    { id: 'tour', short: 'Tour' },
    { id: 'proposal', short: 'Proposal' },
    { id: 'contract', short: 'Contract' },
    { id: 'deposit', short: 'Deposit' },
  ],
}: {
  columns?: { id: string; short: string }[]
}) {
  return (
    <div className="flex flex-1 min-h-0 select-none gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 portal-scrollbar">
      {columns.map((col) => (
        <div
          key={col.id}
          className="portal-card-surface flex h-full min-w-[280px] max-w-[340px] flex-1 flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <div className="flex items-center gap-2">
              <PortalSkeleton className="h-2 w-2 rounded-full" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">{col.short}</span>
            </div>
            <PortalSkeleton className="h-4 w-6 rounded-full" />
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {[0, 1, 2].map((cardIndex) => (
              <div
                key={cardIndex}
                className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5 space-y-2.5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <PortalSkeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <PortalSkeleton className="h-3.5 w-28 rounded" />
                    <PortalSkeleton className="h-2.5 w-20 rounded" />
                  </div>
                </div>
                <PortalSkeleton className="h-3 w-3/4 rounded" />
                <div className="flex items-center justify-between border-t border-[color:var(--portal-border)] pt-2.5">
                  <PortalSkeleton className="h-2.5 w-16 rounded" />
                  <PortalSkeleton className="h-7 w-7 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PortalTableSkeleton({
  cols = 6,
  rows = 10,
}: {
  cols?: number
  rows?: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => {
        if (cols === 8) {
          return (
            <tr key={rowIndex} className="border-b border-[color:var(--portal-border)] h-[4.25rem]">
              <td className="w-14 px-4 py-3 text-center">
                <PortalSkeleton className="h-4 w-4 mx-auto rounded" />
              </td>
              <td className="min-w-[255px] px-4 py-3">
                <div className="flex items-center gap-4">
                  <PortalSkeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <PortalSkeleton className="h-3.5 w-32 rounded" />
                    <PortalSkeleton className="h-2.5 w-44 rounded" />
                  </div>
                </div>
              </td>
              <td className="min-w-[190px] px-4 py-3">
                <PortalSkeleton className="h-7 w-28 rounded-lg" />
              </td>
              <td className="min-w-[185px] px-4 py-3">
                <div className="space-y-1.5">
                  <PortalSkeleton className="h-3.5 w-24 rounded" />
                  <PortalSkeleton className="h-2.5 w-16 rounded" />
                </div>
              </td>
              <td className="min-w-[120px] px-4 py-3">
                <PortalSkeleton className="h-6 w-16 rounded" />
              </td>
              <td className="min-w-[145px] px-6 py-3">
                <div className="space-y-1">
                  <PortalSkeleton className="h-3.5 w-20 rounded" />
                  <PortalSkeleton className="h-2 w-14 rounded" />
                </div>
              </td>
              <td className="min-w-[150px] px-6 py-3">
                <PortalSkeleton className="h-3.5 w-24 rounded" />
              </td>
              <td className="min-w-[235px] px-8 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <PortalSkeleton className="h-8 w-8 rounded-lg" />
                  <PortalSkeleton className="h-8 w-8 rounded-lg" />
                  <PortalSkeleton className="h-8 w-8 rounded-lg" />
                </div>
              </td>
            </tr>
          )
        }

        return (
          <tr key={rowIndex} className="border-b border-[color:var(--portal-border)] h-[4.25rem]">
            <td className="px-6 py-3.5" colSpan={cols}>
              <div className="flex items-center gap-4">
                <PortalSkeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <PortalSkeleton className="h-3.5 w-48 rounded" />
                  <PortalSkeleton className="h-2.5 w-32 rounded" />
                </div>
                <PortalSkeleton className="hidden sm:block h-6 w-24 rounded-full" />
                <PortalSkeleton className="hidden md:block h-3.5 w-28 rounded" />
                <div className="flex items-center gap-2">
                  <PortalSkeleton className="h-8 w-8 rounded-lg" />
                  <PortalSkeleton className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}

export function PortalCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 space-y-4 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <PortalSkeleton className="h-5 w-24 rounded" />
            <PortalSkeleton className="h-6 w-6 rounded-full" />
          </div>
          <PortalSkeleton className="h-8 w-32 rounded" />
          <PortalSkeleton className="h-3 w-40 rounded" />
        </div>
      ))}
    </div>
  )
}

/**
 * The single visual primitive for portal loading placeholders. Keeping the
 * animation here lets lists, cards, and calculated-price surfaces feel like
 * one product in both portal themes.
 */
export function PortalSkeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block luxor-skeleton ${className}`.trim()} />
}

/**
 * A calm, structural placeholder for a calculation whose rows are about to
 * resolve. It intentionally has no spinner so money, package, and schedule
 * surfaces all use the same portal loading language.
 */
export function PortalCalculationSkeleton({
  label = 'Calculating updated details',
  rows = 3,
  className = '',
}: {
  label?: string
  rows?: number
  className?: string
}) {
  return (
    <div role="status" aria-live="polite" className={`overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 ${className}`.trim()}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: Math.max(1, rows) }).map((_, index) => (
        <div key={index} className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${index ? 'border-t border-[color:var(--portal-border)]' : ''}`}>
          <PortalSkeleton className="h-7 w-7 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <PortalSkeleton className={index % 2 ? 'h-3.5 w-2/5 rounded' : 'h-3.5 w-3/5 rounded'} />
            <PortalSkeleton className="h-2.5 w-1/3 rounded" />
          </div>
          <PortalSkeleton className="h-3.5 w-16 shrink-0 rounded" />
        </div>
      ))}
    </div>
  )
}

/**
 * Animated linear progress bar that animates its width smoothly from 0 to the target
 * percentage as it scrolls into view throughout the portal.
 */
export function PortalProgressBar({
  value,
  max = 100,
  min = 0,
  className = 'h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50',
  barClassName = 'h-full rounded-full bg-gradient-to-r from-[#caa24c] to-[#f1d27a]',
  delay = 0,
  duration = 0.85,
}: {
  value: number
  max?: number
  min?: number
  className?: string
  barClassName?: string
  delay?: number
  duration?: number
}) {
  const prefersReducedMotion = useReducedMotion()
  const clamped = Math.max(0, Math.min(100, ((value - min) / Math.max(1, max - min)) * 100))

  return (
    <div className={className}>
      <motion.div
        className={barClassName}
        initial={{ width: prefersReducedMotion ? `${clamped}%` : '0%' }}
        whileInView={{ width: `${clamped}%` }}
        viewport={{ once: true, margin: '0px 0px -30px 0px' }}
        transition={{
          duration: prefersReducedMotion ? 0 : duration,
          delay: prefersReducedMotion ? 0 : delay,
          ease: LUXOR_PORTAL_EASE,
        }}
      />
    </div>
  )
}
