'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BadgeDollarSign, Bell, Bot, Building, Clock, Cpu, Image, Lock, Search, Tag, X } from '@/lib/icons/phosphor-compat'
import { PORTAL_MODAL_EASE } from '@/components/portal/PortalUI'

export type SettingsTab =
  | 'business'
  | 'branding'
  | 'notifications'
  | 'team'
  | 'integrations'
  | 'hours'
  | 'promotions'
  | 'pricing'
  | 'content'
  | 'elena'

export type SettingsSearchItem = {
  tab: SettingsTab
  section: string
  title: string
  description: string
  keywords: string
}

export const SETTINGS_SEARCH_ITEMS: SettingsSearchItem[] = [
  { tab: 'notifications', section: 'Notifications', title: 'Device notifications', description: 'Enable push alerts and send a test notification.', keywords: 'push web app iphone ios safari install alerts email booking inquiry test permission' },
  { tab: 'notifications', section: 'Notifications', title: 'Email alert recipients', description: 'Choose who receives inquiry and booking email alerts.', keywords: 'recipient emails owner staff team booking alert address automation reminders resend' },
  { tab: 'business', section: 'Venue information', title: 'Venue details', description: 'Review your venue name, address, mailbox, and website.', keywords: 'business information address location website mailbox record' },
  { tab: 'business', section: 'Venue information', title: 'Website phone line', description: 'Configure the public phone identity and calling behavior.', keywords: 'telephone call caller id twilio number voice sms' },
  { tab: 'business', section: 'Venue information', title: 'Zelle payment details', description: 'Set the Zelle recipient and QR code shown after agreement signing.', keywords: 'zelle qr payment deposit invoice recipient checkout money' },
  { tab: 'hours', section: 'Hours & availability', title: 'Tour schedule & blackout dates', description: 'Set open weekdays, tour slots, and blocked dates.', keywords: 'hours schedule calendar availability open closed appointments tours times blackout override flexible' },
  { tab: 'hours', section: 'Hours & availability', title: 'Tour booking window & capacity', description: 'Adjust lead time, weeks ahead, and slot limits.', keywords: 'lead time weeks ahead capacity slots booking method hours' },
  { tab: 'team', section: 'Team & access', title: 'Profile photo & signature', description: 'Update your sender name, title, photo, and email identity.', keywords: 'profile avatar photo sender email name job title signature user' },
  { tab: 'team', section: 'Team & access', title: 'CRM calling line', description: 'Choose your outbound caller ID and browser softphone line.', keywords: 'calling line phone softphone outbound caller id extension' },
  { tab: 'team', section: 'Team & access', title: 'Team & portal access', description: 'Invite staff members and manage portal permissions.', keywords: 'login security users roles permissions approved account access invite' },
  { tab: 'elena', section: 'Elena AI', title: 'Elena knowledge base', description: 'Manage venue facts, packages, and tour answers.', keywords: 'elena chatbot ai concierge knowledge faq facts answers' },
  { tab: 'elena', section: 'Elena AI', title: 'Elena behavior & instructions', description: 'Customize concierge tone, instructions, and conversation flows.', keywords: 'elena chatbot ai flows prompt instructions tone behavior settings' },
  { tab: 'elena', section: 'Elena AI', title: 'Test & publish Elena', description: 'Preview replies and publish saved concierge updates.', keywords: 'elena test preview publish sandbox website concierge' },
  { tab: 'integrations', section: 'Email & connections', title: 'Twilio phone numbers', description: 'Search, purchase, and assign Luxor phone numbers.', keywords: 'twilio phone number voice purchase assign local' },
  { tab: 'integrations', section: 'Email & connections', title: 'Call routing & SMS replies', description: 'Configure call forwarding, missed-call texts, and SMS rules.', keywords: 'twilio sms text calling call routing forwarding missed call auto reply stop start' },
  { tab: 'integrations', section: 'Email & connections', title: 'Email delivery', description: 'Review active email provider and sender configuration.', keywords: 'resend provider credentials mail webhook inbox reconnect oauth integration zoho email' },
  { tab: 'integrations', section: 'Email & connections', title: 'Calendar reply review', description: 'Review guest RSVP replies before updating attendance.', keywords: 'calendar rsvp response accepted declined tentative attendance review approve dismiss' },
  { tab: 'integrations', section: 'Email & connections', title: 'Email migration', description: 'Check historical email import and archive progress.', keywords: 'resend zoho migration import archive history inbox outbox attachments backup progress pause retry' },
  { tab: 'integrations', section: 'Email & connections', title: 'Calendar invite test', description: 'Send or download a test calendar invitation.', keywords: 'calendar invite ics resend outlook gmail meeting request test' },
  { tab: 'pricing', section: 'Pricing & line items', title: 'Venue rental rates', description: 'Update weekday, Friday, and weekend venue rates.', keywords: 'price pricing rates rental monday tuesday wednesday thursday friday saturday sunday' },
  { tab: 'pricing', section: 'Pricing & line items', title: 'Proposal packages', description: 'Edit package pricing, inclusions, and add-on line items.', keywords: 'proposal packages inclusions line items decor catering dj bar security cleaning' },
  { tab: 'pricing', section: 'Pricing & line items', title: 'Sales tax & deposits', description: 'Set tax rate, deposits, fees, and catalog visibility.', keywords: 'sales tax deposit fee public catalog rate' },
  { tab: 'promotions', section: 'Promotions', title: 'Promotions', description: 'Manage active offers shown on the Luxor website.', keywords: 'discount offer campaign special banner marketing promo' },
  { tab: 'branding', section: 'Branding', title: 'Theme & sidebar layout', description: 'Switch light or dark mode and expanded or compact sidebar.', keywords: 'appearance color theme dark light sidebar compact expanded navigation layout' },
  { tab: 'branding', section: 'Branding', title: 'Venue brochure', description: 'Upload or update the downloadable venue brochure PDF.', keywords: 'brochure pdf packet upload document flyer' },
  { tab: 'branding', section: 'Branding', title: 'Brand assets', description: 'Upload and manage logos, banners, and email images.', keywords: 'image logo banner signature upload photo branding assets' },
  { tab: 'content', section: 'Site content', title: 'Website content', description: 'Edit saved content records for public Luxor pages.', keywords: 'site pages home events gallery pricing spaces visit copy text json' },
]

export const SETTINGS_TAB_ICONS: Record<SettingsTab, typeof Bell> = {
  business: Building,
  branding: Image,
  notifications: Bell,
  team: Lock,
  integrations: Cpu,
  hours: Clock,
  promotions: Tag,
  pricing: BadgeDollarSign,
  content: Building,
  elena: Bot,
}

const TAB_ICONS = SETTINGS_TAB_ICONS

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

export function searchSettingsItems(
  rawQuery: string,
  allowedTabs?: readonly SettingsTab[],
  limit = 6,
): SettingsSearchItem[] {
  if (!rawQuery.trim()) return []
  return SETTINGS_SEARCH_ITEMS
    .filter((item) => !allowedTabs || allowedTabs.includes(item.tab))
    .map((item) => ({ item, score: scoreItem(item, rawQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map(({ item }) => item)
}

export function findMatchingSettingsTabs(rawQuery: string, allowedTabs?: readonly SettingsTab[]): Set<SettingsTab> {
  const matches = new Set<SettingsTab>()
  if (!rawQuery.trim()) return matches
  for (const item of SETTINGS_SEARCH_ITEMS) {
    if (allowedTabs && !allowedTabs.includes(item.tab)) continue
    if (scoreItem(item, rawQuery) > 0) {
      matches.add(item.tab)
    }
  }
  return matches
}

export function PortalSettingsSearch({ onSelect, allowedTabs }: { onSelect: (tab: SettingsTab) => void; allowedTabs?: readonly SettingsTab[] }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion()

  const results = useMemo(() => searchSettingsItems(query, allowedTabs, 6), [allowedTabs, query])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        event.key === '/' &&
        !target?.closest('input, textarea, select, [contenteditable="true"]') &&
        !document.querySelector('[data-portal-dialog="true"]')
      ) {
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
    <div ref={containerRef} className="relative z-20 w-full max-w-2xl shrink-0">
      <label htmlFor="settings-search" className="sr-only">Search settings</label>
      <div className={`flex min-h-10 items-center gap-3 rounded-xl border px-3.5 transition-colors ${isOpen ? 'border-[#caa24c]/50 bg-[color:var(--portal-card)] ring-2 ring-[#caa24c]/15' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/35'}`}>
        <Search size={16} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
        <input
          ref={inputRef}
          id="settings-search"
          type="search"
          role="combobox"
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
          className="portal-input-transparent h-10 min-w-0 flex-1 bg-transparent text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            aria-label="Clear settings search"
            className="portal-ghost-icon-button inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {isOpen && query.trim() ? (
          <motion.div
            id="settings-search-results"
            role="listbox"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: reduceMotion ? 0.05 : 0.16, ease: PORTAL_MODAL_EASE }}
            className="portal-popover-surface absolute inset-x-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xl"
          >
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
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${index === activeIndex ? 'bg-[color:var(--portal-soft)]' : 'hover:bg-[color:var(--portal-soft)]'}`}
                    >
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#f1d27a]">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-xs font-semibold text-[color:var(--portal-text)]">{item.title}</span>
                          <span className="text-[11px] font-medium text-[color:var(--portal-muted)]">{item.section}</span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-4 text-[color:var(--portal-muted)]">{item.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-5 text-center">
                <p className="text-xs font-semibold text-[color:var(--portal-text)]">No setting found</p>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Try notifications, email, booking, theme, or phone.</p>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
