'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  Mail,
  PhoneMissed,
  PhoneCall,
  MessageSquare,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCw,
  Check,
  ExternalLink,
  Receipt,
  Sparkles,
  Search,
  UserCheck,
  ArrowRight,
  CalendarCheck2,
  FileSignature,
  Eye,
} from 'lucide-react'
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

type TabType = 'all' | 'email' | 'call' | 'sms' | 'form' | 'billing'

export function PortalNotificationModal({
  isOpen,
  triggerRef,
  onClose,
  items,
  unreadCount,
  loading,
  unreadCountsByType,
  onMarkAsRead,
  onMarkAllAsRead,
  onRefresh,
}: PortalNotificationModalProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle click outside & escape key to close
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const targetNode = e.target as Node
      if (triggerRef?.current && triggerRef.current.contains(targetNode)) {
        return
      }
      if (containerRef.current && !containerRef.current.contains(targetNode)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, triggerRef])

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return items.filter((item) => {
      if (unreadOnly && item.isRead) return false

      if (activeTab === 'email' && item.type !== 'email' && item.type !== 'email_open') return false
      if (activeTab === 'call' && item.type !== 'call') return false
      if (activeTab === 'sms' && item.type !== 'sms') return false
      if (activeTab === 'form' && item.type !== 'form' && item.type !== 'booking' && item.type !== 'contract') return false
      if (activeTab === 'billing' && item.type !== 'invoice_paid' && item.type !== 'bill_due') return false

      if (q) {
        const matchesTitle = item.title.toLowerCase().includes(q)
        const matchesSub = item.subtitle.toLowerCase().includes(q)
        return matchesTitle || matchesSub
      }

      return true
    })
  }, [items, activeTab, unreadOnly, searchQuery])

  const handleItemClick = (item: PortalNotificationItem) => {
    onMarkAsRead(item.id)
    onClose()
    router.push(item.targetUrl)
  }

  const handleQuickCall = (e: React.MouseEvent, fromNumber?: unknown) => {
    e.stopPropagation()
    if (typeof fromNumber === 'string' && fromNumber) {
      window.dispatchEvent(new CustomEvent('luxor-start-call', { detail: { number: fromNumber } }))
      onClose()
    }
  }

  const handleQuickEmail = (e: React.MouseEvent, fromAddress?: unknown) => {
    e.stopPropagation()
    if (typeof fromAddress === 'string' && fromAddress) {
      window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { email: fromAddress } }))
      onClose()
    }
  }

  function getNotificationIcon(type: NotificationType) {
    switch (type) {
      case 'email':
        return <Mail size={16} className="text-blue-500 dark:text-blue-400" />
      case 'call':
        return <PhoneMissed size={16} className="text-red-500 dark:text-red-400" />
      case 'sms':
        return <MessageSquare size={16} className="text-emerald-500 dark:text-emerald-400" />
      case 'form':
        return <ClipboardList size={16} className="text-[#caa24c]" />
      case 'booking':
        return <CalendarCheck2 size={16} className="text-[#caa24c]" />
      case 'contract':
        return <FileSignature size={16} className="text-emerald-500 dark:text-emerald-400" />
      case 'email_open':
        return <Eye size={16} className="text-blue-500 dark:text-blue-400" />
      case 'invoice_paid':
        return <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400" />
      case 'bill_due':
        return <AlertCircle size={16} className="text-rose-500 dark:text-rose-400" />
      default:
        return <Bell size={16} className="text-[color:var(--portal-muted)]" />
    }
  }

  function formatRelativeTime(dateString: string) {
    if (!dateString) return ''
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return ''

    const now = new Date()
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffSeconds < 60) return 'Just now'
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
    if (diffSeconds < 172800) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const billingUnread = (unreadCountsByType?.invoice_paid || 0) + (unreadCountsByType?.bill_due || 0)

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <React.Fragment key="luxor-notification-center">
          {/* Mobile backdrop */}
          <motion.div
            key="notification-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs sm:hidden"
            onClick={onClose}
          />

          <motion.div
            key="notification-popover"
            ref={containerRef}
            initial={{ opacity: 0, x: 12, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="fixed right-4 top-20 z-[90] flex max-h-[85vh] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xl backdrop-blur-xl"
          >

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 text-[#caa24c]">
                  <Bell size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[color:var(--portal-text)] tracking-tight">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-[#caa24c]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[#caa24c] border border-[#caa24c]/30">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[color:var(--portal-muted)]">Live communication & activity feed</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  className="rounded-lg p-1.5 text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:opacity-50 cursor-pointer"
                  title="Refresh notifications"
                >
                  <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllAsRead}
                    className="flex items-center gap-1 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-soft)] cursor-pointer"
                    title="Mark all as read"
                  >
                    <Check size={12} className="text-[#caa24c]" />
                    <span>Read all</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] cursor-pointer"
                  aria-label="Close notifications modal"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Quick Search Bar */}
            <div className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-bg)]/60 px-3 py-2">
              <div className="relative flex items-center">
                <Search size={14} className="absolute left-2.5 text-[color:var(--portal-muted)]" />
                <input
                  type="text"
                  placeholder="Filter by name, number, or subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] py-1 pl-8 pr-7 text-xs text-[color:var(--portal-text)] placeholder-[color:var(--portal-faint)] focus:border-[#caa24c]/60 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/30"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Categories Tabs */}
            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/30 px-3 py-2">
              <div className="portal-scrollbar flex items-center gap-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-[#caa24c]/15 text-[#caa24c] border border-[#caa24c]/30 shadow-xs'
                      : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('email')}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'email'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30 shadow-xs'
                      : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  <Mail size={12} />
                  <span>Emails</span>
                  {((unreadCountsByType?.email || 0) + (unreadCountsByType?.email_open || 0)) > 0 && (
                    <span className="rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[9px] font-mono font-bold text-blue-600 dark:text-blue-300">
                      {(unreadCountsByType?.email || 0) + (unreadCountsByType?.email_open || 0)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('call')}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'call'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30 shadow-xs'
                      : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  <PhoneMissed size={12} />
                  <span>Missed</span>
                  {(unreadCountsByType?.call || 0) > 0 && (
                    <span className="rounded-full bg-red-500/20 px-1.5 py-0.2 text-[9px] font-mono font-bold text-red-600 dark:text-red-300">
                      {unreadCountsByType?.call}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sms')}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'sms'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 shadow-xs'
                      : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  <MessageSquare size={12} />
                  <span>Texts</span>
                  {(unreadCountsByType?.sms || 0) > 0 && (
                    <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-300">
                      {unreadCountsByType?.sms}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('form')}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'form'
                      ? 'bg-[#caa24c]/15 text-[#caa24c] border border-[#caa24c]/30 shadow-xs'
                      : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  <ClipboardList size={12} />
                  <span>Leads</span>
                  {((unreadCountsByType?.form || 0) + (unreadCountsByType?.booking || 0) + (unreadCountsByType?.contract || 0)) > 0 && (
                    <span className="rounded-full bg-[#caa24c]/20 px-1.5 py-0.2 text-[9px] font-mono font-bold text-[#caa24c]">
                      {(unreadCountsByType?.form || 0) + (unreadCountsByType?.booking || 0) + (unreadCountsByType?.contract || 0)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('billing')}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === 'billing'
                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30 shadow-xs'
                      : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  <Receipt size={12} />
                  <span>Billing</span>
                  {billingUnread > 0 && (
                    <span className="rounded-full bg-purple-500/20 px-1.5 py-0.2 text-[9px] font-mono font-bold text-purple-600 dark:text-purple-300">
                      {billingUnread}
                    </span>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setUnreadOnly((prev) => !prev)}
                className={`ml-2 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  unreadOnly
                    ? 'bg-[#caa24c] text-black font-black'
                    : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                }`}
              >
                {unreadOnly ? 'Unread' : 'All'}
              </button>
            </div>

            {/* Notifications Body List */}
            <div className="portal-scrollbar flex-1 overflow-y-auto divide-y divide-[color:var(--portal-border)]/40 p-1.5 space-y-1">
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 text-[color:var(--portal-muted)]">
                    <Sparkles size={20} />
                  </div>
                  <p className="text-xs font-semibold text-[color:var(--portal-text)]">All caught up!</p>
                  <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">
                    {searchQuery
                      ? 'No notifications match your search query.'
                      : unreadOnly
                      ? 'No unread notifications in this category.'
                      : 'No new notifications to display right now.'}
                  </p>
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`group relative flex flex-col gap-2 rounded-xl p-3 transition-all cursor-pointer ${
                      item.isRead
                        ? 'bg-[color:var(--portal-card)] hover:bg-[color:var(--portal-soft)]/60 border border-[color:var(--portal-border)]/40 opacity-85 hover:opacity-100'
                        : 'bg-[color:var(--portal-soft)]/90 hover:bg-[color:var(--portal-soft)] border border-[#caa24c]/30 shadow-xs'
                    }`}
                  >
                    {!item.isRead && (
                      <span className="absolute left-1.5 top-4 h-2 w-2 rounded-full bg-[#caa24c] shadow-[0_0_8px_rgba(202,162,76,0.6)]" />
                    )}

                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xs group-hover:border-[#caa24c]/40">
                        {getNotificationIcon(item.type)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className={`truncate text-xs ${item.isRead ? 'text-[color:var(--portal-text)]/85 font-medium' : 'text-[color:var(--portal-text)] font-bold'}`}>
                            {item.title}
                          </h4>
                          <span className="shrink-0 text-[10px] text-[color:var(--portal-faint)] font-mono">
                            {formatRelativeTime(item.timestamp)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[color:var(--portal-muted)]">
                          {item.subtitle}
                        </p>
                      </div>

                      <div className="mt-1 shrink-0 text-[color:var(--portal-muted)] opacity-0 transition-opacity group-hover:opacity-100 text-[#caa24c]">
                        <ExternalLink size={14} />
                      </div>
                    </div>

                    {/* Quick Context Action Button */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-[color:var(--portal-border)]/30 opacity-95">
                      {item.type === 'call' && Boolean(item.metadata?.fromNumber) && (
                        <button
                          type="button"
                          onClick={(e) => handleQuickCall(e, item.metadata?.fromNumber)}
                          className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                        >
                          <PhoneCall size={11} />
                          <span>Call Back</span>
                        </button>
                      )}
                      {item.type === 'email' && Boolean(item.metadata?.sender || item.metadata?.fromAddress) && (
                        <button
                          type="button"
                          onClick={(e) => handleQuickEmail(e, item.metadata?.sender || item.metadata?.fromAddress)}
                          className="flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
                        >
                          <Mail size={11} />
                          <span>Reply Email</span>
                        </button>
                      )}
                      {(item.type === 'form' || item.type === 'booking' || item.type === 'contract' || item.type === 'email_open' || item.type === 'invoice_paid') && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-[#caa24c] group-hover:underline">
                          <UserCheck size={11} />
                          <span>View Lead</span>
                          <ArrowRight size={10} />
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer summary */}
            <div className="flex items-center justify-between border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-4 py-2.5 text-[11px] text-[color:var(--portal-muted)]">
              <span>Showing {filteredItems.length} notifications</span>
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="text-[#caa24c] hover:underline cursor-pointer font-medium"
              >
                Clear unread badges
              </button>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  )
}
