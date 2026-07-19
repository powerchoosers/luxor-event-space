'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, X } from 'lucide-react'

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
  return <div className={`mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-6 ${processedClassName}`}>{children}</div>
}

export function PortalPageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon?: React.ReactNode
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {icon ? <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-[#caa24c] shadow-[0_0_20px_rgba(202,162,76,0.14)]">{icon}</div> : null}
          <h1 className="text-2xl font-bold tracking-tight text-white/90 sm:text-3xl">{title}</h1>
        </div>
        <p className="max-w-2xl text-sm font-medium leading-6 text-zinc-500">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
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
    primary: 'border-[#caa24c] bg-[#caa24c] text-black shadow-lg shadow-[#caa24c]/15 hover:border-[#dfbd68] hover:bg-[#dfbd68]',
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
    <nav ref={containerRef} aria-label={ariaLabel} className={`relative inline-flex shrink-0 min-w-max items-end gap-5 ${className}`}>
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
            className={`relative inline-flex shrink-0 items-center gap-2 px-0 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
              isActive
                ? 'text-[#a8792f]'
                : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            } ${buttonClassName}`}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[8px] ${
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
}: {
  activeKey: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, y: 12, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
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
}: {
  controls?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <section className={`nodal-void-card portal-render-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl shadow-black/30 backdrop-blur-xl ${className}`}>
      {controls ? <div className="shrink-0 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] py-3 px-4 sm:px-6">{controls}</div> : null}
      <div className="portal-scrollbar flex-1 overflow-auto" data-portal-table-scroller>
        {children}
      </div>
      {footer ? <div className="shrink-0 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] py-4 px-4 sm:px-6 flex items-center">{footer}</div> : null}
    </section>
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
    <table className="w-full text-left" style={{ minWidth }}>
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
      {icon ? <div className="mb-4 text-zinc-700">{icon}</div> : null}
      <h3 className="text-base font-bold text-white/90">{title}</h3>
      <p className="mt-2 max-w-md text-xs leading-5 text-zinc-500">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

export function PortalStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    contacted: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
    tour_requested: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    tour_confirmed: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    proposal_sent: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
    booked: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    tentative: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    confirmed: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    completed: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
    closed_lost: 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20',
    draft: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
    sent: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    paid: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    overdue: 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]',
    cancelled: 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20',
  }

  const formatStatus = (s: string) => {
    return s
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  const normalized = status.toLowerCase().replace(/\s+/g, '_')
  const badgeStyle = styles[normalized] ?? 'bg-zinc-500/10 text-zinc-300 border border-zinc-500/20'

  return (
    <span className={`inline-flex items-center rounded-sm px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${badgeStyle}`}>
      {formatStatus(status)}
    </span>
  )
}

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
          <h4 className="text-xs font-bold text-white/90 uppercase tracking-widest">{title}</h4>
          <span className="text-[10px] text-zinc-600 font-mono">{time}</span>
          {badge ? <div className="ml-auto">{badge}</div> : null}
        </div>
        {children ? <div className="mt-2 text-xs leading-relaxed text-zinc-400">{children}</div> : null}
      </div>
    </div>
  )
}

export function PortalModal({
  isOpen,
  onClose,
  title,
  description,
  ariaLabel,
  children,
  maxWidth = 'max-w-lg',
}: {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  ariaLabel?: string
  children: React.ReactNode
  maxWidth?: string
}) {
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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
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
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className={`relative z-10 flex max-h-[calc(100dvh-2rem)] w-full ${maxWidth} transform-gpu flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] shadow-2xl outline-none sm:max-h-[90vh]`}
          >
            {title ? (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <h3 id={titleId} className="text-sm font-bold uppercase tracking-widest text-[color:var(--portal-text)]">{title}</h3>
                    {description ? <p className="mt-1 max-w-xl text-[11px] leading-5 text-[color:var(--portal-muted)]">{description}</p> : null}
                  </div>
                  <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[color:var(--portal-muted)] transition-all hover:border-[color:var(--portal-border)] hover:bg-black/5 hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
                    <X size={16} />
                  </button>
                </div>
                <div className="overflow-y-auto p-5 portal-scrollbar sm:p-6">{children}</div>
              </>
            ) : (
              children
            )}
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
  placeholder = 'Select option...',
  disabled = false,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  className?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const selectedOption = options.find((opt) => opt.value === value)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })

  const updateCoords = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownHeight = dropdownRef.current ? dropdownRef.current.offsetHeight : 180
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      
      let top = rect.bottom + 6
      if (spaceBelow < dropdownHeight + 6 && spaceAbove > dropdownHeight + 6) {
        top = rect.top - dropdownHeight - 6
      }

      const nextCoords = {
        top,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        width: rect.width,
      }
      setCoords((current) => {
        if (current.top === nextCoords.top && current.left === nextCoords.left && current.width === nextCoords.width) {
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
        onClick={() => {
          if (disabled) return
          updateCoords()
          setIsOpen((current) => !current)
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-[color:var(--portal-border,rgba(202,162,76,0.18))] bg-[color:var(--portal-soft,rgba(10,9,8,0.96))] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[color:var(--portal-text,#f7efe3)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[color:var(--portal-border,rgba(202,162,76,0.26))] hover:bg-[color:var(--portal-soft,rgba(13,11,10,0.98))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_30px_-18px_rgba(0,0,0,0.75)] focus:outline-none focus:ring-1 focus:ring-[#caa24c]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[color:var(--portal-text,#f7efe3)]"
      >
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <span className={`text-[10px] text-[color:var(--portal-muted,#d7c29a)] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      <AnimatePresence>
        {isOpen ? (
          <>
            {createPortal(
              <>
                <motion.div
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="fixed inset-0 z-[9990] cursor-default"
                  onClick={() => setIsOpen(false)}
                />
                <motion.div
                  ref={dropdownRef}
                  role="listbox"
                  data-portal-popover="true"
                  initial={{ opacity: 0, y: -8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.985 }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  className="portal-scrollbar fixed z-[9999] max-h-60 overflow-y-auto rounded-md border border-[color:var(--portal-border,rgba(202,162,76,0.18))] p-1.5 shadow-2xl shadow-black/35 ring-1 ring-black/5"
                  style={{ 
                    top: `${coords.top}px`,
                    left: `${coords.left}px`,
                    width: `${coords.width}px`,
                    backgroundColor: 'color-mix(in srgb, var(--portal-bg, #080706) 82%, transparent)',
                    backdropFilter: 'blur(24px)', 
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
                              ? 'border-[#caa24c]/24 bg-[#caa24c]/12 text-[#f1d27a] shadow-[0_0_0_1px_rgba(202,162,76,0.08)]'
                              : 'border-transparent text-[color:var(--portal-muted,#d7c29a)] hover:border-[color:var(--portal-border,rgba(202,162,76,0.16))] hover:bg-white/5 hover:text-[color:var(--portal-text,#f7efe3)]'
                          }`}
                        >
                          <span>{opt.label}</span>
                          <span className={`text-[9px] transition-opacity duration-150 ${isSelected ? 'text-[#f1d27a]' : 'text-[color:var(--portal-muted,#d7c29a)] opacity-0 group-hover:opacity-100'}`}>
                            ●
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              </>,
              document.body
            )}
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function PortalDatePicker({
  value,
  onChange,
  className = '',
  placeholder = 'Select Date...',
}: {
  value: string
  onChange: (val: string) => void
  className?: string
  placeholder?: string
}) {
  const [isOpen, setIsOpen] = React.useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const updateCoords = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownHeight = dropdownRef.current ? dropdownRef.current.offsetHeight : 290
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      
      let top = rect.bottom + 6
      if (spaceBelow < dropdownHeight + 6 && spaceAbove > dropdownHeight + 6) {
        top = rect.top - dropdownHeight - 6
      }

      const nextCoords = {
        top,
        left: Math.max(8, Math.min(rect.right - 256, window.innerWidth - 264)),
      }
      setCoords((current) => {
        if (current.top === nextCoords.top && current.left === nextCoords.left) {
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
        event.stopImmediatePropagation()
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])
  
  // Current navigation view month and year
  const [viewDate, setViewDate] = React.useState(() => {
    const initial = value ? new Date(value) : new Date()
    return isNaN(initial.getTime()) ? new Date() : initial
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth() // 0-indexed

  // Format a date to YYYY-MM-DD
  const formatYYYYMMDD = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  // First day of current view month
  const firstDayOfMonth = new Date(year, month, 1)
  const startingDayOfWeek = firstDayOfMonth.getDay() // 0: Sunday, 1: Monday...

  // Total days in current view month
  const totalDays = new Date(year, month + 1, 0).getDate()

  // Create the day grid array (including padding for empty cells)
  const dayCells = React.useMemo(() => {
    const cells: (Date | null)[] = []
    for (let i = 0; i < startingDayOfWeek; i++) {
      cells.push(null)
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push(new Date(year, month, d))
    }
    return cells
  }, [month, startingDayOfWeek, totalDays, year])

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1))
  }

  const handleSelectDay = (date: Date) => {
    onChange(formatYYYYMMDD(date))
    setIsOpen(false)
  }

  const formattedDisplay = value
    ? new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : placeholder

  return (
    <div className={`relative min-w-[140px] select-none ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          updateCoords()
          setIsOpen((current) => !current)
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-[color:var(--portal-border,rgba(202,162,76,0.18))] bg-[color:var(--portal-soft,rgba(10,9,8,0.96))] px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-[color:var(--portal-text,#f7efe3)] transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[color:var(--portal-border,rgba(202,162,76,0.26))] hover:bg-[color:var(--portal-soft,rgba(13,11,10,0.98))] focus:outline-none focus:ring-1 focus:ring-[#caa24c]/30"
      >
        <span>{formattedDisplay}</span>
        <Calendar size={13} className="text-[#caa24c]/80" />
      </button>
      
      <AnimatePresence>
        {isOpen ? (
          <>
            {createPortal(
              <>
                <motion.div
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="fixed inset-0 z-[9990] cursor-default"
                  onClick={() => setIsOpen(false)}
                />
                <motion.div
                  ref={dropdownRef}
                  role="dialog"
                  data-portal-popover="true"
                  initial={{ opacity: 0, y: -8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.985 }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  className="portal-scrollbar fixed z-[9999] w-64 rounded-md border border-[color:var(--portal-border,rgba(202,162,76,0.18))] p-4 text-xs shadow-2xl shadow-black/35 ring-1 ring-black/5"
                  style={{ 
                    top: `${coords.top}px`,
                    left: `${coords.left}px`,
                    width: '256px',
                    backgroundColor: 'color-mix(in srgb, var(--portal-bg, #080706) 82%, transparent)',
                    backdropFilter: 'blur(24px)', 
                    WebkitBackdropFilter: 'blur(24px)' 
                  }}
                >
                  {/* Header navigation */}
                  <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-2">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="cursor-pointer rounded p-1 text-[color:var(--portal-muted,#d7c29a)] transition-colors hover:bg-black/5 hover:text-[color:var(--portal-text,#f7efe3)]"
                    >
                      ◀
                    </button>
                    <span className="font-bold uppercase tracking-wider text-[color:var(--portal-text)]">
                      {monthNames[month]} {year}
                    </span>
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="cursor-pointer rounded p-1 text-[color:var(--portal-muted,#d7c29a)] transition-colors hover:bg-black/5 hover:text-[color:var(--portal-text,#f7efe3)]"
                    >
                      ▶
                    </button>
                  </div>

                  {/* Weekday Labels */}
                  <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>

                  {/* Day Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {dayCells.map((day, idx) => {
                      if (!day) return <span key={`empty-${idx}`} />

                      const isSelected = value && formatYYYYMMDD(day) === value
                      const isToday = formatYYYYMMDD(day) === formatYYYYMMDD(new Date())
                      
                      return (
                        <button
                          key={day.getTime()}
                          type="button"
                          onClick={() => handleSelectDay(day)}
                          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md font-mono transition-all border ${
                            isSelected
                              ? 'border-[#caa24c]/40 hover:border-[#caa24c]/60 bg-[#caa24c]/20 font-bold text-[#f1d27a] shadow'
                              : isToday
                              ? 'border-blue-500/30 hover:border-[#caa24c]/50 font-bold text-blue-500 hover:bg-black/5'
                              : 'border-transparent hover:border-[#caa24c]/50 text-[color:var(--portal-text,#f7efe3)] hover:bg-black/5 hover:text-[color:var(--portal-text,#f7efe3)]'
                          }`}
                        >
                          {day.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              </>,
              document.body
            )}
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function PortalContactAvatar({
  name,
  size = 'md',
  className = '',
}: {
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
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
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 font-serif font-semibold text-[#caa24c] shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)] transition-all duration-300 ${sizeClasses[size]} ${className}`}
    >
      {initials}
    </div>
  )
}

