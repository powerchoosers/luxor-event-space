'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Building, Clock, Cpu, Image, Lock, Search, Tag, X } from 'lucide-react'

type SettingsTab =
  | 'business'
  | 'branding'
  | 'notifications'
  | 'team'
  | 'integrations'
  | 'hours'
  | 'promotions'
  | 'content'

type SettingsSearchItem = {
  tab: SettingsTab
  section: string
  title: string
  description: string
  keywords: string
}

const SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  { tab: 'notifications', section: 'Notifications', title: 'iPhone & browser notifications', description: 'Enable push alerts and send a test notification.', keywords: 'push web app iphone ios safari install alerts email booking inquiry test permission' },
  { tab: 'notifications', section: 'Notifications', title: 'Automated notifications', description: 'Review automatic inquiry and email alert behavior.', keywords: 'automation alerts reminders resend zoho email bookings inquiries queue' },
  { tab: 'notifications', section: 'Notifications', title: 'Notification recipients', description: 'Choose the internal email addresses that receive alerts.', keywords: 'recipient emails owner staff team booking alert address' },
  { tab: 'business', section: 'Venue Information', title: 'Venue details', description: 'Review the venue name, location, mailbox, and website.', keywords: 'business information address location website mailbox record' },
  { tab: 'business', section: 'Venue Information', title: 'Venue phone role', description: 'Configure the venue phone identity and calling behavior.', keywords: 'telephone call caller id twilio number voice sms' },
  { tab: 'business', section: 'Venue Information', title: 'Payment settings', description: 'Manage the portal payment configuration.', keywords: 'stripe payment deposit invoice card checkout money' },
  { tab: 'integrations', section: 'Integrations', title: 'Calendar invite test', description: 'Send or download a custom Resend calendar invitation.', keywords: 'calendar invite ics resend outlook gmail meeting request test' },
  { tab: 'integrations', section: 'Integrations', title: 'Email migration', description: 'Preserve Zoho history and review the move to Resend.', keywords: 'resend zoho migration import archive history inbox outbox attachments backup progress pause retry' },
  { tab: 'integrations', section: 'Integrations', title: 'Calendar reply review', description: 'Review unverified RSVP replies before updating attendance.', keywords: 'calendar rsvp response accepted declined tentative attendance review approve dismiss' },
  { tab: 'branding', section: 'Portal Branding', title: 'Appearance and theme', description: 'Change light or dark mode and portal layout.', keywords: 'appearance color theme dark light sidebar compact expanded navigation' },
  { tab: 'branding', section: 'Portal Branding', title: 'Brand assets', description: 'Upload and manage logos, banners, and signatures.', keywords: 'image logo banner signature upload photo branding assets' },
  { tab: 'team', section: 'Team & Permissions', title: 'Your email identity', description: 'Update your sender name, title, profile photo, and signature identity.', keywords: 'profile avatar photo sender email name job title signature user' },
  { tab: 'team', section: 'Team & Permissions', title: 'Portal access', description: 'Review approved-user access and permissions.', keywords: 'login security users roles permissions approved zoho account access' },
  { tab: 'integrations', section: 'Integrations', title: 'Email delivery settings', description: 'Review active mail delivery, Resend setup, and the remaining Zoho connection.', keywords: 'resend provider credentials mail webhook inbox reconnect oauth integration zoho email' },
  { tab: 'integrations', section: 'Integrations', title: 'Twilio phone numbers', description: 'Search, purchase, and configure Luxor phone numbers.', keywords: 'twilio sms text calling phone number webhook voice purchase' },
  { tab: 'hours', section: 'Business Hours', title: 'Tour availability', description: 'Set the days and times available for venue tours.', keywords: 'hours schedule calendar availability open closed appointments tours times' },
  { tab: 'promotions', section: 'Promotions', title: 'Promotions', description: 'Manage active website promotions and offers.', keywords: 'discount offer campaign special banner marketing promo' },
  { tab: 'content', section: 'Site Content', title: 'Website content', description: 'Edit saved content for Luxor public website pages.', keywords: 'site pages home events gallery pricing spaces visit copy text json' },
]

const TAB_ICONS: Record<SettingsTab, typeof Bell> = {
  business: Building,
  branding: Image,
  notifications: Bell,
  team: Lock,
  integrations: Cpu,
  hours: Clock,
  promotions: Tag,
  content: Building,
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function editDistance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]
      previous[j] = a[i - 1] === b[j - 1]
        ? diagonal
        : Math.min(diagonal, previous[j - 1], above) + 1
      diagonal = above
    }
  }
  return previous[b.length]
}

function scoreItem(item: SettingsSearchItem, rawQuery: string) {
  const query = normalize(rawQuery)
  if (!query) return 0

  const title = normalize(item.title)
  const section = normalize(item.section)
  const searchable = normalize(`${item.title} ${item.section} ${item.description} ${item.keywords}`)
  const words = searchable.split(' ')
  const queryTokens = query.split(' ').filter(Boolean)

  let score = 0
  if (title === query || section === query) score += 120
  if (title.startsWith(query)) score += 80
  if (section.startsWith(query)) score += 65
  if (searchable.includes(query)) score += 45

  for (const token of queryTokens) {
    if (words.includes(token)) {
      score += 24
      continue
    }
    if (words.some((word) => word.startsWith(token) || token.startsWith(word))) {
      score += 14
      continue
    }
    if (token.length >= 5 && words.some((word) => Math.abs(word.length - token.length) <= 2 && editDistance(word, token) <= 2)) {
      score += 7
    }
  }

  return score
}

export function PortalSettingsSearch({ onSelect, allowedTabs }: { onSelect: (tab: SettingsTab) => void; allowedTabs?: readonly SettingsTab[] }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    if (!query.trim()) return []
    return SETTINGS_SEARCH_ITEMS
      .filter((item) => !allowedTabs || allowedTabs.includes(item.tab))
      .map((item) => ({ item, score: scoreItem(item, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 6)
      .map(({ item }) => item)
  }, [allowedTabs, query])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key === '/' && !target?.closest('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleShortcut)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleShortcut)
    }
  }, [])

  const selectResult = (item: SettingsSearchItem) => {
    onSelect(item.tab)
    setQuery('')
    setIsOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div ref={containerRef} className="relative z-20 mx-auto w-full max-w-2xl shrink-0">
      <label htmlFor="settings-search" className="sr-only">Search settings</label>
      <div className={`flex items-center gap-3 rounded-xl border bg-[color:var(--portal-card)] px-4 transition-colors ${isOpen ? 'border-[#caa24c]/55 ring-2 ring-[#caa24c]/10' : 'border-[color:var(--portal-border)]'}`}>
        <Search size={17} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
        <input
          ref={inputRef}
          id="settings-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && results.length) {
              event.preventDefault()
              setActiveIndex((index) => (index + 1) % results.length)
            } else if (event.key === 'ArrowUp' && results.length) {
              event.preventDefault()
              setActiveIndex((index) => (index - 1 + results.length) % results.length)
            } else if (event.key === 'Enter' && results[activeIndex]) {
              event.preventDefault()
              selectResult(results[activeIndex])
            } else if (event.key === 'Escape') {
              setIsOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Search settings, notifications, email, phone…"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls="settings-search-results"
          aria-expanded={isOpen && Boolean(query.trim())}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm font-medium text-[color:var(--portal-text)] outline-none placeholder:font-normal placeholder:text-[color:var(--portal-faint)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Clear settings search" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]">
            <X size={14} />
          </button>
        ) : null}
      </div>

      {isOpen && query.trim() ? (
        <div id="settings-search-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl shadow-black/15 backdrop-blur-2xl dark:bg-[color:var(--portal-soft)]">
          {results.length ? (
            <div className="p-1.5">
              {results.map((item, index) => {
                const Icon = TAB_ICONS[item.tab]
                return (
                  <button
                    key={`${item.tab}-${item.title}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectResult(item)}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${index === activeIndex ? 'bg-[color:var(--portal-soft)]' : 'hover:bg-[color:var(--portal-soft)]'}`}
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/8 text-[#a8792f] dark:text-[#e0bd67]">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-xs font-bold text-[color:var(--portal-text)]">{item.title}</span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-[color:var(--portal-faint)]">{item.section}</span>
                      </span>
                      <span className="mt-1 block text-[10px] leading-4 text-[color:var(--portal-muted)]">{item.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-5 text-center">
              <p className="text-xs font-semibold text-[color:var(--portal-text)]">No setting found</p>
              <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Try notifications, email, booking, theme, or phone.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
