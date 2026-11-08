'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Settings,
  Menu,
  ChevronDown,
  ChevronRight,
  X,
  LogOut,
} from '@/lib/icons/phosphor-compat'
import {
  PortalPageFrame,
  PortalPageHeader,
} from '@/components/portal/PortalUI'
import { PortalSettingsSearch } from '@/components/portal/PortalSettingsSearch'
import {
  Tab,
  PortalSettingsManager,
  SETTINGS_NAVIGATION,
  AGENT_SETTINGS_NAVIGATION,
  SETTINGS_TAB_COPY,
  AGENT_TAB_COPY,
  AGENT_TABS,
} from '@/components/portal/PortalSettingsManager'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('team')
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false)
  const [portalRole, setPortalRole] = useState<'owner' | 'admin' | 'agent'>('agent')

  useEffect(() => {
    fetch('/api/portal/user-preferences')
      .then((res) => res.json())
      .then((data) => {
        if (data.portal_role === 'owner' || data.portal_role === 'admin' || data.portal_role === 'agent') {
          setPortalRole(data.portal_role)
          if (data.portal_role !== 'agent') {
            setActiveTab((current) => (current === 'team' ? 'business' : current))
          }
        }
      })
      .catch((err) => console.error('Failed to sync settings from Supabase:', err))
  }, [])

  useEffect(() => {
    if (!isSettingsMenuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isSettingsMenuOpen])

  const isAgent = portalRole === 'agent'
  const settingsNavigation = isAgent ? AGENT_SETTINGS_NAVIGATION : SETTINGS_NAVIGATION
  const activeSettingsItem = settingsNavigation.flatMap((group) => group.items).find((item) => item.id === activeTab)
  const activeSettingsCopy = (isAgent ? AGENT_TAB_COPY[activeTab] : undefined) || SETTINGS_TAB_COPY[activeTab]

  const selectSettingsTab = (tab: Tab) => {
    if (isAgent && !AGENT_TABS.includes(tab)) return
    setActiveTab(tab)
    setIsSettingsMenuOpen(false)
  }

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<Settings size={18} />}
        title="Settings"
        titleAccessory={<kbd className="hidden rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1 text-[9px] font-bold text-[color:var(--portal-faint)] sm:block">/</kbd>}
      />

      <div className="space-y-3">
        <PortalSettingsSearch onSelect={selectSettingsTab} allowedTabs={isAgent ? AGENT_TABS : undefined} />
        <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:flex">
          <span className="text-[11px] font-medium text-[color:var(--portal-muted)]">Quick links</span>
          {isAgent ? (
            <>
              <button type="button" onClick={() => selectSettingsTab('team')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Update my profile</button>
              <button type="button" onClick={() => selectSettingsTab('notifications')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Manage my alerts</button>
              <button type="button" onClick={() => selectSettingsTab('branding')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Change appearance</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => selectSettingsTab('business')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Venue details</button>
              <button type="button" onClick={() => selectSettingsTab('hours')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Tour hours</button>
              <button type="button" onClick={() => selectSettingsTab('pricing')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Pricing</button>
              <button type="button" onClick={() => selectSettingsTab('elena')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Elena</button>
              <button type="button" onClick={() => selectSettingsTab('notifications')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Alerts</button>
              <button type="button" onClick={() => selectSettingsTab('integrations')} className="rounded-sm font-medium text-[color:var(--portal-muted)] transition-colors hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#e0bd67]">Email & calendar</button>
            </>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-6">
        <aside className="hidden w-56 shrink-0 self-start rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 shadow-xs md:sticky md:top-0 md:block md:max-h-[calc(100dvh-11rem)] md:overflow-y-auto lg:w-64">
          <nav aria-label="Settings categories" className="space-y-5">
            {settingsNavigation.map((group) => (
              <section key={group.label} aria-labelledby={`settings-group-${group.label.replaceAll(' ', '-').toLowerCase()}`}>
                <h2 id={`settings-group-${group.label.replaceAll(' ', '-').toLowerCase()}`} className="mb-1.5 px-3 text-[11px] font-medium text-[color:var(--portal-muted)]">{group.label}</h2>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const selected = activeTab === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectSettingsTab(item.id)}
                        aria-current={selected ? 'page' : undefined}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected ? 'bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#e0bd67]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}
                      >
                        <span className="mt-0.5 shrink-0">{item.icon}</span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold">{item.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--portal-faint)]">{item.description}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </nav>
          <form action="/api/auth/logout" method="post" className="mt-5 border-t border-[color:var(--portal-border)] pt-3 lg:hidden">
            <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-300">
              <LogOut size={16} />
              Log out
            </button>
          </form>
        </aside>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setIsSettingsMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isSettingsMenuOpen}
            className="mb-5 flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 md:hidden"
          >
            <Menu size={18} className="text-[#a8792f]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium text-[color:var(--portal-muted)]">Browse settings</span>
              <span className="mt-0.5 block truncate text-sm font-semibold">{activeSettingsItem?.label}</span>
            </span>
            <ChevronDown size={17} className="text-[color:var(--portal-muted)]" aria-hidden="true" />
          </button>

          <div className="mb-6 border-b border-[color:var(--portal-border)] pb-5">
            <h1 className="text-xl font-bold tracking-tight text-[color:var(--portal-text)] sm:text-2xl">{activeSettingsCopy.title}</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[color:var(--portal-muted)]">{activeSettingsCopy.description}</p>
          </div>

          <div className="min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-8">
            <PortalSettingsManager
              activeTab={activeTab}
              onSelectTab={selectSettingsTab}
              portalRole={portalRole}
            />
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>
          {isSettingsMenuOpen ? (
            <motion.div
              role="presentation"
              className="fixed inset-0 z-[90] flex items-end bg-black/45 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-16 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onMouseDown={() => setIsSettingsMenuOpen(false)}
            >
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-menu-title"
                className="portal-sheet portal-drawer-surface flex max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] shadow-2xl"
                initial={{ opacity: 0, y: 56, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.985 }}
                transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-4 py-4 backdrop-blur-xl">
                  <div>
                    <h2 id="settings-menu-title" className="text-base font-bold text-[color:var(--portal-text)]">Browse settings</h2>
                    <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Choose what you want to manage.</p>
                  </div>
                  <button type="button" onClick={() => setIsSettingsMenuOpen(false)} aria-label="Close settings menu" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
                    <X size={15} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                  <nav aria-label="Settings categories" className="space-y-5">
                    {settingsNavigation.map((group) => (
                      <section key={group.label}>
                        <h3 className="mb-1 px-1 text-xs font-semibold text-[color:var(--portal-muted)]">{group.label}</h3>
                        <div className="space-y-1">
                          {group.items.map((item) => {
                            const selected = activeTab === item.id
                            return (
                              <button key={item.id} type="button" onClick={() => selectSettingsTab(item.id)} aria-current={selected ? 'page' : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected ? 'bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#e0bd67]' : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'}`}>
                                <span className="shrink-0">{item.icon}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold">{item.label}</span>
                                  <span className="mt-0.5 block text-[11px] text-[color:var(--portal-muted)]">{item.description}</span>
                                </span>
                                <ChevronRight size={16} className="shrink-0 text-[color:var(--portal-faint)]" aria-hidden="true" />
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </nav>
                  <form action="/api/auth/logout" method="post" className="mt-5 border-t border-[color:var(--portal-border)] pt-3">
                    <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-300">
                      <LogOut size={17} />
                      Log out of Luxor Portal
                    </button>
                  </form>
                </div>
              </motion.section>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </PortalPageFrame>
  )
}
