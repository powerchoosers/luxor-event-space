'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Loader2 } from 'lucide-react'
import { LuxorEventTypeCombobox } from '@/components/LuxorEventTypeCombobox'
import { PortalCloseButton, PortalDatePicker } from '@/components/portal/PortalUI'
import { formatLocalDateKey } from '@/lib/publicEventDate'
import {
  LUXOR_MAX_GUESTS,
  LuxorInquiry,
  LuxorInquiryInput,
  normalizeLuxorEventType,
} from '@/lib/luxorInquiryTypes'

export interface NewLeadDrawerProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: (inquiry?: LuxorInquiry) => void
  pagePath?: string
}

export function NewLeadDrawer({
  isOpen,
  onClose,
  onCreated,
  pagePath = '/portal',
}: NewLeadDrawerProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [eventType, setEventType] = useState('Wedding')
  const [guestCount, setGuestCount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const today = formatLocalDateKey(new Date())
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const drawerRef = useRef<HTMLElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`

    const focusFrame = window.requestAnimationFrame(() => {
      const primaryInput = drawerRef.current?.querySelector<HTMLElement>('[data-autofocus]')
      const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      ;(primaryInput ?? firstFocusable ?? drawerRef.current)?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('[data-portal-popover="true"]')) return
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) {
        event.preventDefault()
        drawerRef.current.focus()
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    let cleanEventType = ''
    try {
      cleanEventType = normalizeLuxorEventType(eventType)
    } catch (eventTypeError) {
      alert(eventTypeError instanceof Error ? eventTypeError.message : 'Please enter a shorter event type.')
      return
    }
    if (!cleanEventType) {
      alert('Please enter an event type.')
      return
    }

    try {
      setSubmitting(true)
      const payload: LuxorInquiryInput = {
        fullName: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        eventType: cleanEventType,
        guestCount: guestCount.trim() || undefined,
        targetDate: targetDate.trim() || undefined,
        metadata: { browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        message: message.trim() || undefined,
        source: 'portal_manual',
        flow: 'manual_entry',
        pagePath,
      }

      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create lead.')
      }

      const data = await res.json()
      const createdInquiry = data?.inquiry as LuxorInquiry | undefined

      // Reset form
      setName('')
      setEmail('')
      setPhone('')
      setEventType('Wedding')
      setGuestCount('')
      setTargetDate('')
      setMessage('')

      // Dispatched so global telemetry and lists update
      window.dispatchEvent(new CustomEvent('luxor:portal-inquiries-refreshed'))

      onClose()
      onCreated?.(createdInquiry)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to create lead.')
    } finally {
      setSubmitting(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex"
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="Close add client lead panel"
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            onClick={onClose}
          />
          <motion.aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative z-10 ml-auto flex h-full w-full max-w-[600px] flex-col overflow-hidden border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-[-18px_0_48px_rgba(0,0,0,0.22)] outline-none"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold tracking-tight text-[color:var(--portal-text)]">
                  Add new client / lead
                </h2>
                <p className="mt-0.5 text-xs leading-5 text-[color:var(--portal-muted)]">
                  Capture the client details and the event information you have so far.
                </p>
              </div>
              <PortalCloseButton onClick={onClose} aria-label="Close add client lead panel" className="shrink-0" />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 portal-scrollbar sm:p-6">
              <form onSubmit={handleSubmit} className="flex min-h-full flex-col space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="drawer-lead-name" className="text-xs font-medium text-[color:var(--portal-muted)]">
                    Full name
                  </label>
                  <input
                    id="drawer-lead-name"
                    type="text"
                    required
                    data-autofocus="true"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Client name..."
                    className="w-full rounded-xl border border-transparent bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-all placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/40 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#b98a3e]/10"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="drawer-lead-email" className="text-xs font-medium text-[color:var(--portal-muted)]">
                      Email address
                    </label>
                    <input
                      id="drawer-lead-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full rounded-xl border border-transparent bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-all placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/40 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#b98a3e]/10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="drawer-lead-phone" className="text-xs font-medium text-[color:var(--portal-muted)]">
                      Phone number
                    </label>
                    <input
                      id="drawer-lead-phone"
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="214-555-0199"
                      className="w-full rounded-xl border border-transparent bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-all placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/40 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#b98a3e]/10"
                    />
                  </div>

                  <LuxorEventTypeCombobox
                    label="Event type"
                    required
                    value={eventType}
                    onChange={setEventType}
                    className="space-y-1.5"
                    labelClassName="mb-1.5 text-xs font-medium"
                  />
                  <div className="space-y-1.5">
                    <label htmlFor="drawer-lead-guests" className="text-xs font-medium text-[color:var(--portal-muted)]">
                      Guest count
                    </label>
                    <input
                      id="drawer-lead-guests"
                      type="number"
                      value={guestCount}
                      onChange={(e) => setGuestCount(e.target.value)}
                      min={1}
                      max={LUXOR_MAX_GUESTS}
                      step={1}
                      placeholder="180"
                      className="w-full rounded-xl border border-transparent bg-[color:var(--portal-soft)] px-3.5 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-all placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/40 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#b98a3e]/10"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">
                      Target event date
                    </label>
                    <PortalDatePicker value={targetDate} onChange={setTargetDate} placeholder="Select event date" minDate={today} maxMonths={36} timeZone={null} allowPastDates={false} className="w-full [&>button]:min-h-11 [&>button]:rounded-lg [&>button]:px-3 [&>button]:text-sm" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="drawer-lead-message" className="text-xs font-medium text-[color:var(--portal-muted)]">
                    Initial inquiry details / message
                  </label>
                  <textarea
                    id="drawer-lead-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Include setup, package needs, or specific booking parameters..."
                    className="h-28 w-full resize-y rounded-xl border border-transparent bg-[color:var(--portal-soft)] p-3.5 text-sm leading-relaxed text-[color:var(--portal-text)] outline-none transition-all placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/40 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#b98a3e]/10"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="luxor-gold-raised mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus size={14} aria-hidden="true" />
                  )}
                  {submitting ? 'Adding client lead...' : 'Add client lead'}
                </button>
              </form>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
