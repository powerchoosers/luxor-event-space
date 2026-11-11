'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ChevronRight,
  Search,
  Settings,
  X,
} from '@/lib/icons/phosphor-compat'
import {
  AGENT_SETTINGS_NAVIGATION,
  AGENT_TAB_COPY,
  AGENT_TABS,
  PortalSettingsManager,
  SETTINGS_NAVIGATION,
  SETTINGS_TAB_COPY,
  type Tab,
} from './PortalSettingsManager'
import {
  SETTINGS_TAB_ICONS,
  findMatchingSettingsTabs,
  searchSettingsItems,
  type SettingsSearchItem,
} from './PortalSettingsSearch'
import {
  PORTAL_MODAL_EASE,
  PortalCloseButton,
  PortalGhostIconButton,
  PortalModal,
} from '@/components/portal/PortalUI'

const MOBILE_SETTINGS_QUERY = '(max-width: 767px)'
const emptySubscribe = () => () => {}

function subscribeToMobileSettingsViewport(callback: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_SETTINGS_QUERY)
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getMobileSettingsViewportSnapshot() {
  return window.matchMedia(MOBILE_SETTINGS_QUERY).matches
}

function SettingsSearchSuggestions({
  id,
  results,
  activeIndex,
  onHoverIndex,
  onSelect,
}: {
  id: string
  results: SettingsSearchItem[]
  activeIndex: number
  onHoverIndex: (index: number) => void
  onSelect: (item: SettingsSearchItem) => void
}) {
  if (results.length === 0) {
    return (
      <div id={id} role="listbox" className="px-4 py-5 text-center">
        <p className="text-xs font-semibold text-[color:var(--portal-text)]">No matching features</p>
        <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
          Try rates, packages, Elena, Twilio, or notifications.
        </p>
      </div>
    )
  }

  return (
    <div id={id} role="listbox" className="max-h-full overflow-y-auto overscroll-contain portal-scrollbar p-1.5">
      {results.map((item, index) => {
        const Icon = SETTINGS_TAB_ICONS[item.tab]
        const isHighlighted = index === activeIndex
        return (
          <button
            key={`${item.tab}-${item.title}`}
            type="button"
            role="option"
            aria-selected={isHighlighted}
            onMouseEnter={() => onHoverIndex(index)}
            onClick={() => onSelect(item)}
            className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer ${
              isHighlighted ? 'bg-[color:var(--portal-soft)]' : 'hover:bg-[color:var(--portal-soft)]'
            }`}
          >
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#f1d27a]">
              <Icon size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-semibold text-[color:var(--portal-text)]">{item.title}</span>
                <span className="text-[11px] font-medium text-[color:var(--portal-muted)]">{item.section}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-4 text-[color:var(--portal-muted)]">
                {item.description}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
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
  const resolvedInitialTab = isAgent && !AGENT_TABS.includes(initialTab) ? 'team' : initialTab
  const [activeTab, setActiveTab] = useState<Tab>(resolvedInitialTab)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false)
  const [searchActiveIndex, setSearchActiveIndex] = useState(0)
  const [popoverCoords, setPopoverCoords] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  }>({ top: 0, left: 0, width: 320, maxHeight: 340 })
  const [mobileStep, setMobileStep] = useState<'index' | 'detail'>('index')
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  const reduceMotion = useReducedMotion()
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const mobileIndexRef = useRef<HTMLDivElement>(null)
  const mobileDetailRef = useRef<HTMLDivElement>(null)
  const desktopHeaderCopyRef = useRef<HTMLDivElement>(null)
  const desktopSearchBoxRef = useRef<HTMLDivElement>(null)
  const desktopSearchInputRef = useRef<HTMLInputElement>(null)
  const desktopPopoverRef = useRef<HTMLDivElement>(null)
  const mobileSearchBoxRef = useRef<HTMLDivElement>(null)
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const isMobile = useSyncExternalStore(
    subscribeToMobileSettingsViewport,
    getMobileSettingsViewportSnapshot,
    () => false,
  )

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setActiveTab(resolvedInitialTab)
      setSearchQuery('')
      setSearchPopoverOpen(false)
      setSearchActiveIndex(0)
      setMobileStep('index')
    } else {
      setSearchPopoverOpen(false)
    }
  }

  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0
    }
  }, [activeTab, mobileStep])

  const settingsNavigation = isAgent ? AGENT_SETTINGS_NAVIGATION : SETTINGS_NAVIGATION

  const keywordMatchedTabs = useMemo(
    () => findMatchingSettingsTabs(searchQuery, isAgent ? AGENT_TABS : undefined),
    [isAgent, searchQuery],
  )

  const searchResults = useMemo(
    () => searchSettingsItems(searchQuery, isAgent ? AGENT_TABS : undefined, 7),
    [isAgent, searchQuery],
  )

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return settingsNavigation

    return settingsNavigation
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          return (
            item.label.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query) ||
            item.id.toLowerCase().includes(query) ||
            group.label.toLowerCase().includes(query) ||
            keywordMatchedTabs.has(item.id)
          )
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [keywordMatchedTabs, searchQuery, settingsNavigation])

  const hasSearchQuery = Boolean(searchQuery.trim())
  const safeActiveIndex = searchResults.length > 0 ? Math.min(searchActiveIndex, searchResults.length - 1) : 0
  const isPopoverVisible = isOpen && searchPopoverOpen && hasSearchQuery && (!isMobile || mobileStep === 'index')
  const isDesktopPopoverVisible = isPopoverVisible && !isMobile

  const updatePopoverCoords = useCallback(() => {
    const anchor = desktopSearchBoxRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const padding = 16
    const width = Math.min(360, Math.max(300, window.innerWidth - padding * 2))
    const left = Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding))
    const top = rect.bottom + 8
    const maxHeight = Math.max(180, Math.min(360, window.innerHeight - top - padding))
    setPopoverCoords((current) => {
      if (
        current.top === top &&
        current.left === left &&
        current.width === width &&
        current.maxHeight === maxHeight
      ) {
        return current
      }
      return { top, left, width, maxHeight }
    })
  }, [])

  useEffect(() => {
    if (!isDesktopPopoverVisible) return
    let frame = requestAnimationFrame(updatePopoverCoords)
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updatePopoverCoords)
    }
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    return () => {
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
      cancelAnimationFrame(frame)
    }
  }, [isDesktopPopoverVisible, updatePopoverCoords])

  useEffect(() => {
    if (!isPopoverVisible) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (desktopSearchBoxRef.current?.contains(target)) return
      if (desktopPopoverRef.current?.contains(target)) return
      if (mobileSearchBoxRef.current?.contains(target)) return
      setSearchPopoverOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setSearchPopoverOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isPopoverVisible])

  const activeCopy = (isAgent ? AGENT_TAB_COPY[activeTab] : undefined) || SETTINGS_TAB_COPY[activeTab]

  const handleSelectTab = (tab: Tab) => {
    if (isAgent && !AGENT_TABS.includes(tab)) return
    setActiveTab(tab)
    if (isMobile) {
      setMobileStep('detail')
    }
  }

  const selectSearchResult = (item: SettingsSearchItem) => {
    if (isAgent && !AGENT_TABS.includes(item.tab)) return
    setActiveTab(item.tab)
    setSearchQuery('')
    setSearchPopoverOpen(false)
    setSearchActiveIndex(0)
    if (isMobile) {
      setMobileStep('detail')
      mobileSearchInputRef.current?.blur()
    } else {
      desktopSearchInputRef.current?.blur()
    }
  }

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value)
    setSearchActiveIndex(0)
    setSearchPopoverOpen(Boolean(value.trim()))
    if (!isMobile) {
      updatePopoverCoords()
    }
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && searchResults.length > 0) {
      event.preventDefault()
      setSearchPopoverOpen(true)
      setSearchActiveIndex((index) => (index + 1) % searchResults.length)
    } else if (event.key === 'ArrowUp' && searchResults.length > 0) {
      event.preventDefault()
      setSearchPopoverOpen(true)
      setSearchActiveIndex((index) => (index - 1 + searchResults.length) % searchResults.length)
    } else if (event.key === 'Enter' && searchPopoverOpen && searchResults[safeActiveIndex]) {
      event.preventDefault()
      selectSearchResult(searchResults[safeActiveIndex])
    } else if (event.key === 'Escape' && isPopoverVisible) {
      event.preventDefault()
      event.stopPropagation()
      setSearchPopoverOpen(false)
    }
  }

  const isNavItemMatched = (tab: Tab, label: string, description: string, groupLabel: string) => {
    if (!hasSearchQuery) return true
    const query = searchQuery.trim().toLowerCase()
    return (
      label.toLowerCase().includes(query) ||
      description.toLowerCase().includes(query) ||
      tab.toLowerCase().includes(query) ||
      groupLabel.toLowerCase().includes(query) ||
      keywordMatchedTabs.has(tab)
    )
  }

  return (
    <>
      <PortalModal
        isOpen={isOpen}
        onClose={onClose}
        ariaLabel="All settings"
        maxWidth="max-w-none"
        fullScreenOnMobile
        className="bg-[color:var(--portal-card)] md:h-[min(820px,calc(100dvh-2rem))] md:max-h-[calc(100dvh-2rem)] md:w-[calc(100vw-2rem)] lg:h-[min(760px,calc(100dvh-4rem))] lg:max-h-[calc(100dvh-4rem)] lg:w-[min(1080px,calc(100vw-3rem))]"
      >
        {isMobile ? (
          <div className="flex h-full min-h-0 flex-col bg-[color:var(--portal-bg)]">
            <AnimatePresence mode="wait" initial={false}>
              {mobileStep === 'index' ? (
                <motion.div
                  ref={mobileIndexRef}
                  key="mobile-settings-index"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0.65, filter: 'blur(6px)', x: -10 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)', x: -10 }}
                  transition={{ duration: reduceMotion ? 0.05 : 0.2, ease: PORTAL_MODAL_EASE }}
                  onAnimationComplete={() => {
                    if (mobileIndexRef.current) {
                      mobileIndexRef.current.style.filter = 'none'
                      mobileIndexRef.current.style.transform = 'none'
                    }
                  }}
                  className="flex h-full min-h-0 flex-col"
                >
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3.5">
                    <div className="min-w-0">
                      <h2 className="font-sans text-base font-bold tracking-tight text-[color:var(--portal-text)]">
                        Settings
                      </h2>
                      <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                        Choose what you want to manage.
                      </p>
                    </div>
                    <PortalCloseButton onClick={onClose} aria-label="Close settings" />
                  </div>

                  <div ref={mobileSearchBoxRef} className="relative z-30 shrink-0 px-4 pt-3.5 pb-1">
                    <label htmlFor="modal-settings-search-mobile" className="sr-only">
                      Search settings
                    </label>
                    <div className={`flex min-h-10 items-center gap-2.5 rounded-xl border bg-[color:var(--portal-card)] px-3 transition-colors ${isPopoverVisible ? 'border-[#caa24c]/50 ring-2 ring-[#caa24c]/15' : 'border-[color:var(--portal-border)] focus-within:border-[#caa24c]/50 focus-within:ring-2 focus-within:ring-[#caa24c]/15'}`}>
                      <Search size={15} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
                      <input
                        ref={mobileSearchInputRef}
                        id="modal-settings-search-mobile"
                        type="search"
                        role="combobox"
                        value={searchQuery}
                        onChange={(e) => handleSearchInputChange(e.target.value)}
                        onFocus={() => {
                          if (hasSearchQuery) setSearchPopoverOpen(true)
                        }}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search settings..."
                        autoComplete="off"
                        aria-autocomplete="list"
                        aria-controls="modal-settings-search-results-mobile"
                        aria-expanded={isPopoverVisible}
                        className="portal-input-transparent min-w-0 flex-1 bg-transparent text-sm text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] outline-none [&::-webkit-search-cancel-button]:hidden"
                      />
                      {searchQuery ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('')
                            setSearchPopoverOpen(false)
                            setSearchActiveIndex(0)
                            mobileSearchInputRef.current?.focus()
                          }}
                          aria-label="Clear search"
                          className="portal-ghost-icon-button inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                    </div>

                    <AnimatePresence>
                      {isPopoverVisible ? (
                        <motion.div
                          key="modal-settings-search-popover-mobile"
                          data-portal-popover="true"
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
                          transition={{ duration: reduceMotion ? 0.05 : 0.16, ease: PORTAL_MODAL_EASE }}
                          className="portal-popover-surface absolute inset-x-4 top-[calc(100%+0.35rem)] z-30 max-h-[min(340px,calc(100dvh-11rem))] overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl"
                        >
                          <SettingsSearchSuggestions
                            id="modal-settings-search-results-mobile"
                            results={searchResults}
                            activeIndex={safeActiveIndex}
                            onHoverIndex={setSearchActiveIndex}
                            onSelect={selectSearchResult}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain portal-scrollbar px-4 py-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                    {filteredGroups.length > 0 ? (
                      <nav aria-label="Settings categories" className="space-y-5">
                        {filteredGroups.map((group) => (
                          <section key={group.label}>
                            <h3 className="mb-1.5 px-1 text-xs font-semibold text-[color:var(--portal-muted)]">
                              {group.label}
                            </h3>
                            <div className="divide-y divide-[color:var(--portal-border)] overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
                              {group.items.map((item) => {
                                const isSelected = activeTab === item.id
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleSelectTab(item.id)}
                                    aria-current={isSelected ? 'page' : undefined}
                                    className={`flex min-h-12 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                                      isSelected
                                        ? 'bg-[#caa24c]/12 text-[#9a6d26] dark:text-[#f1d27a]'
                                        : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'
                                    }`}
                                  >
                                    <span
                                      className={`shrink-0 ${
                                        isSelected
                                          ? 'text-[#9a6d26] dark:text-[#f1d27a]'
                                          : 'text-[color:var(--portal-muted)]'
                                      }`}
                                    >
                                      {item.icon}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-sm font-semibold">{item.label}</span>
                                      <span className="mt-0.5 block truncate text-xs text-[color:var(--portal-muted)]">
                                        {item.description}
                                      </span>
                                    </span>
                                    <ChevronRight size={16} className="shrink-0 text-[color:var(--portal-faint)]" aria-hidden="true" />
                                  </button>
                                )
                              })}
                            </div>
                          </section>
                        ))}
                      </nav>
                    ) : (
                      <p className="px-3 py-8 text-center text-xs text-[color:var(--portal-muted)]">
                        No matching settings found.
                      </p>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  ref={mobileDetailRef}
                  key="mobile-settings-detail"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0.65, filter: 'blur(6px)', x: 10 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)', x: 10 }}
                  transition={{ duration: reduceMotion ? 0.05 : 0.2, ease: PORTAL_MODAL_EASE }}
                  onAnimationComplete={() => {
                    if (mobileDetailRef.current) {
                      mobileDetailRef.current.style.filter = 'none'
                      mobileDetailRef.current.style.transform = 'none'
                    }
                  }}
                  className="flex h-full min-h-0 flex-col"
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <PortalGhostIconButton
                        onClick={() => setMobileStep('index')}
                        aria-label="Back to settings categories"
                        className="!h-9 !w-9"
                      >
                        <ArrowLeft size={17} />
                      </PortalGhostIconButton>
                      <div className="min-w-0">
                        <h2 className="truncate font-sans text-base font-bold tracking-tight text-[color:var(--portal-text)]">
                          {activeCopy.title}
                        </h2>
                        <p className="truncate text-xs text-[color:var(--portal-muted)]">
                          {activeCopy.description}
                        </p>
                      </div>
                    </div>
                    <PortalCloseButton onClick={onClose} aria-label="Close settings" />
                  </div>

                  <div
                    ref={contentScrollRef}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain portal-scrollbar px-4 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
                  >
                    <PortalSettingsManager
                      activeTab={activeTab}
                      onSelectTab={handleSelectTab}
                      portalRole={portalRole}
                      isModal
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid h-full min-h-0 md:grid-cols-[216px_minmax(0,1fr)] lg:grid-cols-[252px_minmax(0,1fr)]">
            {/* Left Navigation Rail */}
            <aside className="flex h-full min-h-0 flex-col border-r border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/35 p-3.5">
              {/* Brand Header */}
              <div className="mb-3 flex items-center gap-2 px-1.5 py-0.5">
                <Settings size={15} className="shrink-0 text-[#caa24c]" aria-hidden="true" />
                <span className="font-sans text-xs font-bold tracking-tight text-[color:var(--portal-text)]">
                  Luxor settings
                </span>
              </div>

              {/* Pinned Search Input */}
              <div ref={desktopSearchBoxRef} className="mb-3.5">
                <label htmlFor="modal-settings-search" className="sr-only">
                  Search settings
                </label>
                <div className={`flex min-h-9 items-center gap-2 rounded-xl border bg-[color:var(--portal-card)] px-2.5 transition-colors ${isDesktopPopoverVisible ? 'border-[#caa24c]/50 ring-2 ring-[#caa24c]/15' : 'border-[color:var(--portal-border)] focus-within:border-[#caa24c]/50 focus-within:ring-2 focus-within:ring-[#caa24c]/15'}`}>
                  <Search size={14} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
                  <input
                    ref={desktopSearchInputRef}
                    id="modal-settings-search"
                    type="search"
                    role="combobox"
                    value={searchQuery}
                    onChange={(e) => handleSearchInputChange(e.target.value)}
                    onFocus={() => {
                      if (hasSearchQuery) {
                        updatePopoverCoords()
                        setSearchPopoverOpen(true)
                      }
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search settings..."
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-controls="modal-settings-search-results"
                    aria-expanded={isDesktopPopoverVisible}
                    className="portal-input-transparent min-w-0 flex-1 bg-transparent text-xs text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] outline-none [&::-webkit-search-cancel-button]:hidden"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        setSearchPopoverOpen(false)
                        setSearchActiveIndex(0)
                        desktopSearchInputRef.current?.focus()
                      }}
                      aria-label="Clear search"
                      className="portal-ghost-icon-button inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                    >
                      <X size={12} />
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Grouped Category Navigation */}
              <LayoutGroup id="settings-modal-nav">
                <motion.nav
                  layoutScroll
                  aria-label="Settings categories"
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto portal-scrollbar pr-0.5"
                >
                  {settingsNavigation.map((group) => (
                    <section key={group.label} aria-labelledby={`modal-settings-group-${group.label.replaceAll(' ', '-').toLowerCase()}`}>
                      <h3
                        id={`modal-settings-group-${group.label.replaceAll(' ', '-').toLowerCase()}`}
                        className="mb-1 px-2.5 text-[11px] font-semibold text-[color:var(--portal-muted)]"
                      >
                        {group.label}
                      </h3>
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const isSelected = activeTab === item.id
                          const matches = isNavItemMatched(item.id, item.label, item.description, group.label)
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectTab(item.id)}
                              aria-current={isSelected ? 'page' : undefined}
                              className={`relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-[color,background-color,opacity] cursor-pointer ${
                                isSelected
                                  ? 'font-semibold text-[#9a6d26] dark:text-[#f1d27a]'
                                  : 'font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                              } ${hasSearchQuery && !matches && !isSelected ? 'opacity-45' : ''}`}
                            >
                              {isSelected ? (
                                <motion.span
                                  layoutId="settings-modal-active-pill"
                                  aria-hidden="true"
                                  transition={
                                    reduceMotion
                                      ? { duration: 0 }
                                      : { type: 'spring', stiffness: 450, damping: 35 }
                                  }
                                  className="pointer-events-none absolute inset-0 rounded-xl bg-[#caa24c]/12"
                                />
                              ) : null}
                              <span
                                className={`relative z-10 shrink-0 ${
                                  isSelected
                                    ? 'text-[#9a6d26] dark:text-[#f1d27a]'
                                    : 'text-[color:var(--portal-muted)]'
                                }`}
                              >
                                {item.icon}
                              </span>
                              <span className="relative z-10 truncate">{item.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </motion.nav>
              </LayoutGroup>
            </aside>

            {/* Right Content Pane */}
            <div className="flex h-full min-h-0 min-w-0 flex-col bg-[color:var(--portal-bg)]">
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-5 py-4 lg:px-6">
                <motion.div
                  ref={desktopHeaderCopyRef}
                  key={activeTab}
                  initial={reduceMotion ? false : { opacity: 0.72, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  transition={{ duration: reduceMotion ? 0 : 0.18, ease: PORTAL_MODAL_EASE }}
                  onAnimationComplete={() => {
                    if (desktopHeaderCopyRef.current) {
                      desktopHeaderCopyRef.current.style.filter = 'none'
                    }
                  }}
                  className="min-w-0"
                >
                  <h2 className="font-sans text-base font-bold tracking-tight text-[color:var(--portal-text)] sm:text-lg">
                    {activeCopy.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                    {activeCopy.description}
                  </p>
                </motion.div>
                <PortalCloseButton onClick={onClose} aria-label="Close settings" />
              </div>

              {/* Single Vertical Scroll Area */}
              <div
                ref={contentScrollRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain portal-scrollbar px-5 py-5 lg:px-6 lg:py-6"
              >
                <div className="mx-auto w-full max-w-3xl">
                  <PortalSettingsManager
                    activeTab={activeTab}
                    onSelectTab={handleSelectTab}
                    portalRole={portalRole}
                    isModal
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </PortalModal>

      {mounted ? createPortal(
        <AnimatePresence>
          {isDesktopPopoverVisible ? (
            <motion.div
              ref={desktopPopoverRef}
              key="modal-settings-search-popover-desktop"
              data-portal-popover="true"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: reduceMotion ? 0.05 : 0.16, ease: PORTAL_MODAL_EASE }}
              style={{
                top: popoverCoords.top,
                left: popoverCoords.left,
                width: popoverCoords.width,
                maxHeight: popoverCoords.maxHeight,
              }}
              className="portal-popover-surface fixed z-[260] flex flex-col overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl"
            >
              <SettingsSearchSuggestions
                id="modal-settings-search-results"
                results={searchResults}
                activeIndex={safeActiveIndex}
                onHoverIndex={setSearchActiveIndex}
                onSelect={selectSearchResult}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </>
  )
}
