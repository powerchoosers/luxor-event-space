'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { AlertCircle, Bell, CalendarCheck2, Check, CheckCircle2, ClipboardList, Eye, FileSignature, Mail, MessageSquare, PhoneMissed, Receipt, RotateCw, Search, X } from '@/lib/icons/phosphor-compat'
import { NotificationType, PortalNotificationItem, usePortalNotifications } from '@/hooks/usePortalNotifications'

interface PortalNotificationModalProps {
  isOpen: boolean
  triggerRef?: React.RefObject<HTMLElement | null>
  onClose: () => void
  items: PortalNotificationItem[]
  unreadCount: number
  loading: boolean
  unreadCountsByType?: ReturnType<typeof usePortalNotifications>['unreadCountsByType']
  onMarkAsRead: (id: string) => void
  onMarkAllAsRead: () => void
  onRefresh: () => void
}

type ViewType = 'unread' | 'history'
type CategoryType = 'all' | 'messages' | 'leads' | 'billing'
const HISTORY_LIMIT = 40

function notificationCategory(type: NotificationType): CategoryType {
  if (type === 'email' || type === 'email_open' || type === 'call' || type === 'sms') return 'messages'
  if (type === 'invoice_paid' || type === 'checkout_opened' || type === 'bill_due') return 'billing'
  return 'leads'
}

function notificationIcon(type: NotificationType) {
  switch (type) {
    case 'email': return <Mail size={16} className="text-blue-500 dark:text-blue-400" />
    case 'email_open':
    case 'proposal_opened': return <Eye size={16} className="text-blue-500 dark:text-blue-400" />
    case 'call': return <PhoneMissed size={16} className="text-rose-500 dark:text-rose-400" />
    case 'sms':
    case 'layout_feedback': return <MessageSquare size={16} className="text-emerald-500 dark:text-emerald-400" />
    case 'form': return <ClipboardList size={16} className="text-[#b78b2f] dark:text-[#d8b45e]" />
    case 'booking':
    case 'calendar_response': return <CalendarCheck2 size={16} className="text-emerald-500 dark:text-emerald-400" />
    case 'contract': return <FileSignature size={16} className="text-emerald-500 dark:text-emerald-400" />
    case 'checkout_opened': return <Receipt size={16} className="text-violet-500 dark:text-violet-400" />
    case 'invoice_paid': return <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400" />
    case 'bill_due': return <AlertCircle size={16} className="text-rose-500 dark:text-rose-400" />
    case 'email_delivery_issue': return <AlertCircle size={16} className="text-rose-500 dark:text-rose-400" />
    default: return <Bell size={16} className="text-[color:var(--portal-muted)]" />
  }
}

function relativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 172800) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SwipeableNotificationItem({
  item,
  onOpen,
  onClear,
}: {
  item: PortalNotificationItem
  onOpen: () => void
  onClear: () => void
}) {
  const x = useMotionValue(0)
  const reduceMotion = useReducedMotion()

  // As the user swipes right (0 to 140px):
  // 1. Background fill transitions from 0 opacity to rich Luxor gold
  const bgOpacity = useTransform(x, [0, 40, 120], [0, 0.45, 1])
  // 2. Action badge ("✓ Clear") fades in and subtly scales up
  const badgeOpacity = useTransform(x, [10, 45, 100], [0, 0.7, 1])
  const badgeScale = useTransform(x, [10, 80], [0.85, 1])
  const badgeX = useTransform(x, [0, 80], [-8, 0])

  return (
    <div className="relative overflow-hidden border-b border-[color:var(--portal-border)]/70 select-none">
      {/* Background reveal underneath that gets more solid Luxor gold as you swipe */}
      <motion.div
        aria-hidden="true"
        style={{ opacity: bgOpacity }}
        className="pointer-events-none absolute inset-0 flex items-center justify-start pl-5 bg-[#caa24c] dark:bg-[#b08732]"
      >
        <motion.div
          style={{ opacity: badgeOpacity, scale: badgeScale, x: badgeX, color: '#ffffff' }}
          className="portal-notification-clear-action flex items-center gap-2 font-bold !text-white tracking-wide text-xs"
        >
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 border border-white/90 shadow-xs"
            style={{ borderColor: '#ffffff', backgroundColor: 'rgba(255,255,255,0.3)' }}
          >
            <Check size={13} className="!text-white stroke-[3]" style={{ color: '#ffffff', stroke: '#ffffff' }} />
          </div>
          <span className="!text-white font-bold" style={{ color: '#ffffff' }}>Clear</span>
        </motion.div>
      </motion.div>

      {/* Foreground card that can be dragged to the right */}
      <motion.div
        style={{ x, y: 0 }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={{ left: 0, right: 0.85 }}
        onDragEnd={(_e, info) => {
          // If swiped right past 80px or with sufficient velocity, clear it!
          if (info.offset.x > 80 || info.velocity.x > 350) {
            onClear()
          }
        }}
        initial={reduceMotion ? { opacity: 0, y: 4 } : { opacity: 0, y: 6, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="group relative bg-[color:var(--portal-card)] hover:bg-[color:var(--portal-soft)]/65 active:cursor-grabbing transform-gpu will-change-transform"
      >
        <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--portal-soft)]">
          {notificationIcon(item.type)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h4 className={`line-clamp-2 text-xs leading-5 ${item.isRead ? 'font-medium' : 'font-bold'}`}>
              {item.title}
            </h4>
            <span className="shrink-0 pt-0.5 text-[10px] text-[color:var(--portal-faint)]">
              {relativeTime(item.timestamp)}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[color:var(--portal-muted)]">
            {item.subtitle}
          </p>
        </div>
        </button>
        {!item.isRead ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onClear()
            }}
            className="portal-notification-action absolute bottom-2 right-2 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] opacity-100 shadow-xs transition-opacity hover:border-emerald-500/40 hover:text-emerald-600 focus:opacity-100 group-hover:opacity-100 md:opacity-0 dark:hover:text-emerald-400"
            aria-label={`Mark ${item.title} handled`}
            title="Mark handled"
          >
            <Check size={13} />
          </button>
        ) : null}
      </motion.div>
    </div>
  )
}

export function PortalNotificationModal({ isOpen, triggerRef, onClose, items, unreadCount, loading, unreadCountsByType: _unreadCountsByType, onMarkAsRead, onMarkAllAsRead, onRefresh }: PortalNotificationModalProps) {
  const router = useRouter()
  const [view, setView] = useState<ViewType>('unread')
  const [category, setCategory] = useState<CategoryType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!isOpen) return
    const outside = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef?.current?.contains(target)) return
      if (containerRef.current && !containerRef.current.contains(target)) onClose()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [isOpen, onClose, triggerRef])

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const matching = items.filter((item) => {
      if (view === 'unread' ? item.isRead : !item.isRead) return false
      if (category !== 'all' && notificationCategory(item.type) !== category) return false
      return !query || item.title.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query)
    })
    return view === 'history' ? matching.slice(0, HISTORY_LIMIT) : matching
  }, [category, items, searchQuery, view])

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryType, number> = { all: 0, messages: 0, leads: 0, billing: 0 }
    items.forEach((item) => {
      if (item.isRead) return
      counts.all += 1
      counts[notificationCategory(item.type)] += 1
    })
    return counts
  }, [items])

  const openItem = (item: PortalNotificationItem) => {
    onMarkAsRead(item.id)
    onClose()
    router.push(item.targetUrl)
  }
  const handleItem = (event: React.MouseEvent, item: PortalNotificationItem) => {
    event.stopPropagation()
    onMarkAsRead(item.id)
  }
  const categories: Array<{ id: CategoryType; label: string }> = [
    { id: 'all', label: 'All' }, { id: 'messages', label: 'Messages' }, { id: 'leads', label: 'Leads' }, { id: 'billing', label: 'Billing' },
  ]

  const modal = <AnimatePresence>{isOpen ? <React.Fragment key="notification-center">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="portal-modal-layer fixed inset-0 z-[200] bg-black/40 backdrop-blur-xs sm:hidden" onClick={onClose} />
    <motion.section
      ref={containerRef}
      initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }} role="dialog" aria-modal="true" aria-label="Notifications"
      className="portal-modal-body fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-[210] flex w-auto flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:h-[min(42rem,calc(100vh-6rem))] sm:w-[min(27rem,calc(100vw-2rem))]"
    >
      <header className="flex items-start justify-between border-b border-[color:var(--portal-border)] px-4 py-4">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">Notifications</h3>
          <p className="mt-0.5 text-[11px] text-[color:var(--portal-muted)]">{unreadCount ? `${unreadCount} need attention` : 'You are all caught up'}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onRefresh} disabled={loading} className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:opacity-50" aria-label="Refresh notifications"><RotateCw size={15} className={loading ? 'animate-spin' : ''} /></button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]" aria-label="Close notifications"><X size={16} /></button>
        </div>
      </header>

      <div className="border-b border-[color:var(--portal-border)] px-3 pt-3">
        <div className="grid grid-cols-2 rounded-lg bg-[color:var(--portal-soft)] p-1" role="tablist" aria-label="Notification status">
          {(['unread', 'history'] as ViewType[]).map((option) => <button key={option} type="button" role="tab" aria-selected={view === option} onClick={() => setView(option)} className={`relative rounded-md px-3 py-1.5 text-xs font-semibold ${view === option ? 'text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>
            {view === option ? <motion.span layoutId="notification-view" className="absolute inset-0 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xs" /> : null}
            <span className="relative">{option === 'unread' ? `Unread${unreadCount ? ` (${unreadCount})` : ''}` : 'Earlier'}</span>
          </button>)}
        </div>
        <div className="portal-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto pb-3">
          {categories.map((option) => {
            const count = view === 'unread' ? categoryCounts[option.id] : undefined
            const isSelected = category === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setCategory(option.id)}
                className={`portal-inline-action group relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${
                  isSelected
                    ? 'text-[#9a6e25] dark:text-[#dfbd68]'
                    : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                }`}
              >
                {isSelected ? (
                  <motion.span
                    layoutId="notification-category-active-pill"
                    className="absolute inset-0 rounded-full bg-[#caa24c]/15 dark:bg-[#caa24c]/20"
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 36 }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="relative z-10">{option.label}</span>
                {typeof count === 'number' && count > 0 ? (
                  <span
                    className={`relative z-10 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums leading-none transition-colors ${
                      isSelected
                        ? 'bg-[#caa24c]/25 text-[#7c5417] dark:bg-[#caa24c]/35 dark:text-[#f3d993]'
                        : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] group-hover:bg-[color:var(--portal-border)] group-hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {(view === 'history' || items.length > 12) ? <div className="border-b border-[color:var(--portal-border)] px-3 py-2"><div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
        <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search notifications" className="h-9 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] pl-9 pr-3 text-xs outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/60" />
      </div></div> : null}

      <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${view}-${category}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)', y: 4 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)', y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {visibleItems.length ? (
              visibleItems.map((item) => (
                <SwipeableNotificationItem
                  key={item.id}
                  item={item}
                  onOpen={() => openItem(item)}
                  onClear={() => onMarkAsRead(item.id)}
                />
              ))
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center px-8 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Check size={20} /></div>
                <p className="text-sm font-semibold">{searchQuery ? 'No matches' : view === 'unread' ? 'All caught up' : 'No recent history'}</p>
                <p className="mt-1 max-w-56 text-[11px] leading-4 text-[color:var(--portal-muted)]">{searchQuery ? 'Try a different name or subject.' : view === 'unread' ? 'Handled notifications move to Earlier.' : 'Read notifications are kept here for 30 days.'}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="flex min-h-12 items-center justify-between border-t border-[color:var(--portal-border)] px-4 py-2.5">
        <span className="text-[10px] text-[color:var(--portal-muted)]">{view === 'unread' ? `${visibleItems.length} open` : `Recent ${visibleItems.length}`}</span>
        {view === 'unread' && unreadCount ? <button type="button" onClick={onMarkAllAsRead} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#9b7425] hover:bg-[#caa24c]/10 dark:text-[#dfbd6d]"><Check size={13} /> Mark all handled</button> : null}
      </footer>
    </motion.section>
  </React.Fragment> : null}</AnimatePresence>

  return typeof document === 'undefined' ? null : createPortal(modal, document.body)
}
