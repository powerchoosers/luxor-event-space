'use client'

import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Settings,
  Search,
  X,
} from '@/lib/icons/phosphor-compat'
import {
  Tab,
  PortalSettingsManager,
  SETTINGS_NAVIGATION,
  AGENT_SETTINGS_NAVIGATION,
  SETTINGS_TAB_COPY,
  AGENT_TAB_COPY,
  AGENT_TABS,
} from './PortalSettingsManager'

const emptySubscribe = () => () => {}
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

export function PortalSettingsModal({
  isOpen,
  onClose,
  initialTab = 'business',
  portalRole = 'owner',
}: {
  isOpen: boolean
  onClose: () => void
  initialTab?: Tab
  portalRole?: 'owner' | 'admin' | 'agent'
}) {
  const isAgent = portalRole === 'agent'
  const [activeTab, setActiveTab] = useState<Tab>(isAgent ? 'team' : initialTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  const mounted = useMounted()
  const reduceMotion = useReducedMotion()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setActiveTab(isAgent && !AGENT_TABS.includes(initialTab) ? 'team' : initialTab)
      setSearchQuery('')
    }
  }

  // Scroll lock and Escape / Tab key focus trap
  useEffect(() => {
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
      dialogRef.current?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
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
  }, [isOpen, onClose])

  const settingsNavigation = isAgent ? AGENT_SETTINGS_NAVIGATION : SETTINGS_NAVIGATION
  const allNavItems = useMemo(() => settingsNavigation.flatMap((group) => group.items), [settingsNavigation])

  const filteredNavItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return allNavItems
    return allNavItems.filter((item) => {
      return (
        item.label.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query)
      )
    })
  }, [allNavItems, searchQuery])

  const activeCopy = (isAgent ? AGENT_TAB_COPY[activeTab] : undefined) || SETTINGS_TAB_COPY[activeTab]

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 sm:p-6 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="All settings"
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12, filter: 'blur(6px)' }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12, filter: 'blur(6px)' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-[min(700px,calc(100dvh-5rem))] w-[min(960px,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl outline-none"
          >
            <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)]">
              {/* Left Navigation Rail */}
              <aside className="flex h-full min-h-0 flex-col border-r border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-3.5">
                {/* Search settings input */}
                <div className="relative mb-3">
                  <label htmlFor="modal-settings-search" className="sr-only">Search settings</label>
                  <div className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-2.5 py-1.5 transition-colors focus-within:border-[#caa24c]/50 focus-within:ring-1 focus-within:ring-[#caa24c]/20">
                    <Search size={14} className="text-[color:var(--portal-muted)] shrink-0" />
                    <input
                      id="modal-settings-search"
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search settings..."
                      className="w-full bg-transparent text-xs text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Brand Header */}
                <div className="mb-2 flex items-center gap-2 px-1 py-1">
                  <Settings size={15} className="text-[#caa24c]" />
                  <span className="text-xs font-bold tracking-tight text-[color:var(--portal-text)]">Luxor settings</span>
                </div>

                {/* Category Buttons List */}
                <nav aria-label="Settings categories" className="min-h-0 flex-1 overflow-y-auto portal-scrollbar space-y-1 pr-1">
                  {filteredNavItems.map((item) => {
                    const isSelected = activeTab === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-[#caa24c]/15 text-[#9a6d26] dark:text-[#f1d27a] font-semibold border border-[#caa24c]/30 shadow-xs'
                            : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] border border-transparent'
                        }`}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                  {filteredNavItems.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-[color:var(--portal-muted)]">No settings found.</p>
                  )}
                </nav>
              </aside>

              {/* Right Content Area */}
              <div className="flex h-full min-h-0 flex-col min-w-0 bg-[color:var(--portal-bg)]">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-6 py-4">
                  <div>
                    <h2 className="text-base font-bold text-[color:var(--portal-text)] tracking-tight">{activeCopy.title}</h2>
                    <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">{activeCopy.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close settings"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Scrollable Tab Content */}
                <div className="min-h-0 flex-1 overflow-y-auto portal-scrollbar p-6">
                  <PortalSettingsManager
                    activeTab={activeTab}
                    onSelectTab={setActiveTab}
                    portalRole={portalRole}
                    isModal
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
