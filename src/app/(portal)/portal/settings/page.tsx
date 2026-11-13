'use client'

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  Settings,
} from '@/lib/icons/phosphor-compat'
import {
  PORTAL_MODAL_EASE,
  PortalModal,
  PortalPageFrame,
  PortalPageHeader,
  PortalSkeleton,
  PortalSkeletonTransition,
} from '@/components/portal/PortalUI'
import { PortalSettingsSearch } from '@/components/portal/PortalSettingsSearch'
import {
  AGENT_SETTINGS_NAVIGATION,
  AGENT_TAB_COPY,
  AGENT_TABS,
  PortalSettingsManager,
  SETTINGS_NAVIGATION,
  SETTINGS_TAB_COPY,
  type Tab,
} from '@/components/portal/PortalSettingsManager'

const VALID_TABS: readonly Tab[] = [
  'business',
  'hours',
  'team',
  'notifications',
  'elena',
  'integrations',
  'pricing',
  'promotions',
  'branding',
  'content',
  'funnelGoals',
]

function isValidTab(value: string | null): value is Tab {
  return Boolean(value && VALID_TABS.includes(value as Tab))
}

function SidebarNavSkeleton() {
  return (
    <div className="space-y-4">
      {[3, 3, 2, 2].map((count, groupIndex) => (
        <div key={groupIndex} className="space-y-1.5">
          <PortalSkeleton className="mx-2.5 h-3 w-20 rounded" />
          <div className="space-y-1">
            {Array.from({ length: count }).map((_, itemIndex) => (
              <div key={itemIndex} className="flex items-start gap-2.5 rounded-xl px-2.5 py-2">
                <PortalSkeleton className="mt-0.5 h-4 w-4 shrink-0 rounded" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <PortalSkeleton className="h-3.5 w-28 rounded" />
                  <PortalSkeleton className="h-3 w-36 max-w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SettingsContentSkeleton() {
  return (
    <div className="space-y-5">
      <div className="mb-5 border-b border-[color:var(--portal-border)] pb-4">
        <PortalSkeleton className="h-6 w-44 rounded-lg" />
        <PortalSkeleton className="mt-2 h-4 w-80 max-w-full rounded-lg" />
      </div>
      <div className="max-w-3xl space-y-5">
        <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6 space-y-4">
          <PortalSkeleton className="h-5 w-36 rounded-lg" />
          <PortalSkeleton className="h-3.5 w-64 max-w-full rounded" />
          <div className="grid gap-3 sm:grid-cols-2">
            <PortalSkeleton className="h-16 w-full rounded-xl" />
            <PortalSkeleton className="h-16 w-full rounded-xl" />
            <PortalSkeleton className="h-16 w-full rounded-xl sm:col-span-2" />
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6 space-y-4">
          <PortalSkeleton className="h-5 w-40 rounded-lg" />
          <PortalSkeleton className="h-10 w-full rounded-xl" />
          <PortalSkeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function SettingsPageContent() {
  const searchParams = useSearchParams()
  const requestedTabParam = searchParams?.get('tab') ?? null
  const requestedTab = isValidTab(requestedTabParam) ? requestedTabParam : null

  const [portalRole, setPortalRole] = useState<'owner' | 'admin' | 'agent' | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(requestedTab ?? 'business')
  const [prevRequestedTab, setPrevRequestedTab] = useState<Tab | null>(requestedTab)
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false)
  const hasUserSelectedTabRef = useRef(false)
  const sectionHeaderRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  if (requestedTab !== prevRequestedTab) {
    setPrevRequestedTab(requestedTab)
    if (requestedTab && portalRole !== null && (portalRole !== 'agent' || AGENT_TABS.includes(requestedTab))) {
      setActiveTab(requestedTab)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/portal/user-preferences')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const resolvedRole: 'owner' | 'admin' | 'agent' =
          data.portal_role === 'owner' || data.portal_role === 'admin' || data.portal_role === 'agent'
            ? data.portal_role
            : 'agent'
        setPortalRole(resolvedRole)
        if (hasUserSelectedTabRef.current) return

        if (requestedTab) {
          if (resolvedRole !== 'agent' || AGENT_TABS.includes(requestedTab)) {
            setActiveTab(requestedTab)
          } else {
            setActiveTab('team')
          }
        } else {
          setActiveTab(resolvedRole === 'agent' ? 'team' : 'business')
        }
      })
      .catch((err) => {
        console.error('Failed to sync settings from Supabase:', err)
        if (cancelled) return
        setPortalRole('agent')
        if (!hasUserSelectedTabRef.current) {
          setActiveTab(requestedTab && AGENT_TABS.includes(requestedTab) ? requestedTab : 'team')
        }
      })

    return () => {
      cancelled = true
    }
  }, [requestedTab])

  const isAgent = portalRole === 'agent'
  const settingsNavigation = isAgent ? AGENT_SETTINGS_NAVIGATION : SETTINGS_NAVIGATION
  const activeSettingsItem = settingsNavigation.flatMap((group) => group.items).find((item) => item.id === activeTab)
  const activeSettingsCopy = (isAgent ? AGENT_TAB_COPY[activeTab] : undefined) || SETTINGS_TAB_COPY[activeTab]

  const selectSettingsTab = useCallback((tab: Tab) => {
    if (portalRole === null) return
    if (isAgent && !AGENT_TABS.includes(tab)) return
    hasUserSelectedTabRef.current = true
    setActiveTab(tab)
    setIsSettingsMenuOpen(false)
  }, [isAgent, portalRole])

  return (
    <PortalPageFrame className="gap-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:gap-6 lg:pb-8">
      <PortalPageHeader
        icon={<Settings size={18} />}
        title="Settings"
        titleAccessory={
          <kbd className="hidden rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1 text-[10px] font-semibold text-[color:var(--portal-muted)] sm:block">
            /
          </kbd>
        }
      />

      <div className="space-y-2.5">
        <PortalSettingsSearch
          onSelect={selectSettingsTab}
          allowedTabs={portalRole === null ? [] : isAgent ? AGENT_TABS : undefined}
        />
        <div className="hidden min-h-5 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:flex">
          <span className="text-[11px] font-semibold text-[color:var(--portal-muted)]">Quick links</span>
          {portalRole === null ? (
            <div className="flex items-center gap-3">
              <PortalSkeleton className="h-3.5 w-20 rounded" />
              <PortalSkeleton className="h-3.5 w-16 rounded" />
              <PortalSkeleton className="h-3.5 w-14 rounded" />
              <PortalSkeleton className="h-3.5 w-20 rounded" />
            </div>
          ) : isAgent ? (
            <>
              <button type="button" onClick={() => selectSettingsTab('team')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Update my profile</button>
              <button type="button" onClick={() => selectSettingsTab('notifications')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Manage my alerts</button>
              <button type="button" onClick={() => selectSettingsTab('branding')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Change appearance</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => selectSettingsTab('business')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Venue details</button>
              <button type="button" onClick={() => selectSettingsTab('hours')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Tour hours</button>
              <button type="button" onClick={() => selectSettingsTab('pricing')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Pricing</button>
              <button type="button" onClick={() => selectSettingsTab('elena')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Elena</button>
              <button type="button" onClick={() => selectSettingsTab('notifications')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Alerts</button>
              <button type="button" onClick={() => selectSettingsTab('integrations')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#9a6d26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] cursor-pointer">Email & connections</button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <motion.aside
          layoutScroll
          className="hidden w-56 shrink-0 self-start rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 md:sticky md:top-0 md:block md:max-h-[calc(100dvh-9rem)] md:overflow-y-auto portal-scrollbar lg:w-64"
        >
          <PortalSkeletonTransition loading={portalRole === null} skeleton={<SidebarNavSkeleton />}>
            <LayoutGroup id="settings-page-nav">
              <nav aria-label="Settings categories" className="space-y-4">
                {settingsNavigation.map((group) => (
                  <section key={group.label} aria-labelledby={`settings-group-${group.label.replaceAll(' ', '-').toLowerCase()}`}>
                    <h2
                      id={`settings-group-${group.label.replaceAll(' ', '-').toLowerCase()}`}
                      className="mb-1 px-2.5 text-[11px] font-semibold text-[color:var(--portal-muted)]"
                    >
                      {group.label}
                    </h2>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const selected = activeTab === item.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectSettingsTab(item.id)}
                            aria-current={selected ? 'page' : undefined}
                            className={`relative flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${
                              selected
                                ? 'text-[#9a6d26] dark:text-[#f1d27a]'
                                : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                            }`}
                          >
                            {selected ? (
                              <motion.span
                                layoutId="settings-page-active-pill"
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
                              className={`relative z-10 mt-0.5 shrink-0 ${
                                selected ? 'text-[#9a6d26] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'
                              }`}
                            >
                              {item.icon}
                            </span>
                            <span className="relative z-10 min-w-0">
                              <span className={`block text-xs ${selected ? 'font-semibold' : 'font-medium text-[color:var(--portal-text)]'}`}>
                                {item.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--portal-muted)]">
                                {item.description}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </nav>
            </LayoutGroup>
            <form action="/api/auth/logout" method="post" className="mt-4 border-t border-[color:var(--portal-border)] pt-3 lg:hidden">
              <button type="submit" className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-300 cursor-pointer">
                <LogOut size={16} />
                Log out
              </button>
            </form>
          </PortalSkeletonTransition>
        </motion.aside>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            disabled={portalRole === null}
            onClick={() => setIsSettingsMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isSettingsMenuOpen}
            className="mb-5 flex min-h-14 w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:cursor-default disabled:hover:border-[color:var(--portal-border)] md:hidden"
          >
            <Menu size={18} className="shrink-0 text-[#a8792f] dark:text-[#f1d27a]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-[color:var(--portal-muted)]">Browse settings</span>
              {portalRole === null ? (
                <PortalSkeleton className="mt-1 h-4 w-32 rounded" />
              ) : (
                <span className="mt-0.5 block truncate text-sm font-semibold">{activeSettingsItem?.label}</span>
              )}
            </span>
            <ChevronDown size={17} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
          </button>

          <PortalSkeletonTransition loading={portalRole === null} skeleton={<SettingsContentSkeleton />}>
            {portalRole !== null ? (
              <>
                <div className="mb-5 border-b border-[color:var(--portal-border)] pb-4">
                  <motion.div
                    ref={sectionHeaderRef}
                    key={activeTab}
                    initial={reduceMotion ? false : { opacity: 0.72, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: PORTAL_MODAL_EASE }}
                    onAnimationComplete={() => {
                      if (sectionHeaderRef.current) {
                        sectionHeaderRef.current.style.filter = 'none'
                      }
                    }}
                  >
                    <h2 className="font-sans text-lg font-bold tracking-tight text-[color:var(--portal-text)] sm:text-xl">
                      {activeSettingsCopy.title}
                    </h2>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)] sm:text-sm sm:leading-6">
                      {activeSettingsCopy.description}
                    </p>
                  </motion.div>
                </div>

                <PortalSettingsManager
                  activeTab={activeTab}
                  onSelectTab={selectSettingsTab}
                  portalRole={portalRole}
                />
              </>
            ) : null}
          </PortalSkeletonTransition>
        </div>
      </div>

      <PortalModal
        isOpen={isSettingsMenuOpen}
        onClose={() => setIsSettingsMenuOpen(false)}
        title="Browse settings"
        description="Choose what you want to manage."
        fullScreenOnMobile
        footer={
          <form action="/api/auth/logout" method="post" className="w-full">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-300"
            >
              <LogOut size={17} />
              Log out of Luxor Portal
            </button>
          </form>
        }
      >
        <nav aria-label="Settings categories" className="space-y-5">
          {settingsNavigation.map((group) => (
            <section key={group.label}>
              <h3 className="mb-1.5 px-1 text-xs font-semibold text-[color:var(--portal-muted)]">
                {group.label}
              </h3>
              <div className="divide-y divide-[color:var(--portal-border)] overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
                {group.items.map((item) => {
                  const selected = activeTab === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectSettingsTab(item.id)}
                      aria-current={selected ? 'page' : undefined}
                      className={`flex min-h-12 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                        selected
                          ? 'bg-[#caa24c]/12 text-[#9a6d26] dark:text-[#f1d27a]'
                          : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'
                      }`}
                    >
                      <span
                        className={`shrink-0 ${
                          selected ? 'text-[#9a6d26] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'
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
      </PortalModal>
    </PortalPageFrame>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageContent />
    </Suspense>
  )
}
