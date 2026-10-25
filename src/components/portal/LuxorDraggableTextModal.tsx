'use client'

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  MessageSquare,
  X,
  ChevronDown,
  ExternalLink,
  Loader2,
  Maximize2
} from 'lucide-react'
import Link from 'next/link'
import type { LuxorMessage } from '@/lib/luxorMessageTypes'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { useToast } from './ToastProvider'
import { PortalSmsConsentBadge } from './PortalSmsConsentBadge'

export interface LuxorDraggableTextModalProps {
  inquiryId?: string
  phone: string
  contactName?: string
  onClose: () => void
}

export function LuxorDraggableTextModal({
  inquiryId,
  phone,
  contactName,
  onClose,
}: LuxorDraggableTextModalProps) {
  const { notify } = useToast()
  const [messages, setMessages] = useState<LuxorMessage[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isOptedOut, setIsOptedOut] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [isClosing, setIsClosing] = useState(false)

  const cardRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const closeTimerRef = useRef<number | null>(null)

  const fit = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y }
    const width = cardRef.current?.offsetWidth || 440
    const height = cardRef.current?.offsetHeight || (isMinimized ? 48 : 560)
    return {
      x: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(y, window.innerHeight - height - 12)),
    }
  }, [isMinimized])

  // Initial positioning: Dock at bottom-right on desktop
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    if (!position && cardRef.current) {
      const width = cardRef.current.offsetWidth || 440
      const height = cardRef.current.offsetHeight || 560
      const initX = Math.max(12, window.innerWidth - width - 24)
      const initY = Math.max(12, window.innerHeight - height - 24)
      setPosition(fit(initX, initY))
    }
  }, [fit, position])

  // Resize handling to stay inside viewport
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => (prev ? fit(prev.x, prev.y) : null))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [fit])

  // Scroll to bottom when messages update
  useEffect(() => {
    if (!loading && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages, loading])

  // Consent checking
  useEffect(() => {
    if (!phone) {
      setIsOptedOut(false)
      return
    }
    let isMounted = true
    const checkConsent = () => {
      fetch(`/api/twilio/consent?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isMounted) return
          setIsOptedOut(data?.status === 'opted_out')
        })
        .catch(() => {
          if (isMounted) setIsOptedOut(false)
        })
    }
    checkConsent()

    const handleConsentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ phone?: string; state?: { status?: string } }>
      const updatedPhone = customEvent.detail?.phone
      if (!updatedPhone || updatedPhone === phone || updatedPhone.replace(/\D/g, '') === phone.replace(/\D/g, '')) {
        if (customEvent.detail?.state?.status) {
          setIsOptedOut(customEvent.detail.state.status === 'opted_out')
        } else {
          checkConsent()
        }
      }
    }
    window.addEventListener('luxor-sms-consent-updated', handleConsentUpdated)

    return () => {
      isMounted = false
      window.removeEventListener('luxor-sms-consent-updated', handleConsentUpdated)
    }
  }, [phone])

  // Message loading
  const loadMessages = useCallback(async () => {
    if (!phone && !inquiryId) return
    try {
      const queryParts: string[] = []
      if (phone) queryParts.push(`phone=${encodeURIComponent(phone)}`)
      else if (inquiryId) queryParts.push(`inquiryId=${encodeURIComponent(inquiryId)}`)
      queryParts.push('limit=100')
      const response = await fetch(`/api/twilio/messages?${queryParts.join('&')}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load messages.')
      setMessages(data)

      // Mark inbound unread messages as read
      for (const msg of data as LuxorMessage[]) {
        if (msg.direction === 'inbound' && !msg.is_read) {
          void fetch('/api/twilio/messages', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: msg.id }),
          })
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [phone, inquiryId])

  useEffect(() => {
    void loadMessages()
    const timer = window.setInterval(() => void loadMessages(), 12_000)
    return () => window.clearInterval(timer)
  }, [loadMessages])

  const handleSend = async () => {
    if (!phone || !body.trim() || sending || isOptedOut) return
    setSending(true)
    const textToSend = body.trim()
    try {
      const response = await fetch('/api/twilio/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, body: textToSend, inquiryId, contactName }),
      })
      const message = await response.json()
      if (!response.ok) throw new Error(message.error || 'Unable to send text message.')
      setMessages((curr) => [message, ...curr])
      setBody('')
      notify({ title: 'Text sent', description: `Delivered to ${contactName || phone}.`, variant: 'success' })
      if (textareaRef.current) textareaRef.current.focus()
    } catch (err) {
      notify({
        title: 'Failed to send text',
        description: err instanceof Error ? err.message : 'Unable to send SMS.',
        variant: 'error',
      })
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleClose = () => {
    setIsClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      onClose()
    }, 180)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <section
      ref={cardRef}
      role="region"
      aria-label={`SMS conversation with ${contactName || phone}`}
      className={`fixed z-[130] flex flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition-[width,height,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isClosing ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
      } ${
        isMinimized
          ? 'w-[min(340px,calc(100vw-24px))] h-12'
          : 'w-[min(460px,calc(100vw-24px))] h-[min(580px,calc(100dvh-28px))]'
      }`}
      style={{
        left: position ? `${position.x}px` : undefined,
        top: position ? `${position.y}px` : undefined,
        bottom: position ? 'auto' : '24px',
        right: position ? 'auto' : '24px',
      }}
    >
      {/* Draggable Header */}
      <header
        tabIndex={0}
        aria-label="Move text conversation. Drag or use arrow keys."
        onKeyDown={(e) => {
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-20, 0],
            ArrowRight: [20, 0],
            ArrowUp: [0, -20],
            ArrowDown: [0, 20],
          }
          if (delta[e.key]) {
            e.preventDefault()
            const [dx, dy] = delta[e.key]
            setPosition((p) => (p ? fit(p.x + dx, p.y + dy) : null))
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, textarea')) return
          if (!cardRef.current) return
          const rect = cardRef.current.getBoundingClientRect()
          dragRef.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            left: rect.left,
            top: rect.top,
          }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (d && d.id === e.pointerId) {
            setPosition(fit(d.left + e.clientX - d.x, d.top + e.clientY - d.y))
          }
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 px-3.5 select-none cursor-grab active:cursor-grabbing"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="font-mono text-xs text-[color:var(--portal-muted)] opacity-60 tracking-tighter" aria-hidden="true">
            ⠿
          </span>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#caa24c]/15 text-[#caa24c]">
            <MessageSquare size={13} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-[color:var(--portal-text)] leading-tight">
              {contactName || 'Client'}
            </p>
            {!isMinimized && phone && (
              <p className="font-mono text-[10px] text-[color:var(--portal-muted)] leading-none mt-0.5">
                {formatPhoneDisplay(phone)}
              </p>
            )}
          </div>
          {!isMinimized && (
            <div className="hidden sm:block shrink-0 ml-1">
              <PortalSmsConsentBadge phone={phone} compact />
            </div>
          )}
        </div>

        {/* Window controls */}
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href={`/portal/messages?phone=${encodeURIComponent(phone)}`}
            title="Open in Full Messenger"
            aria-label="Full Messenger"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#caa24c]"
          >
            <ExternalLink size={13} />
          </Link>
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            aria-label={isMinimized ? 'Expand conversation' : 'Minimize conversation'}
            title={isMinimized ? 'Expand' : 'Minimize'}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
          >
            {isMinimized ? <Maximize2 size={13} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close conversation"
            title="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-500"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* Body: Messages & Pinned Composer */}
      {!isMinimized && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--portal-card)]">
          {/* Messages Scroll Area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 portal-scrollbar"
          >
            {loading ? (
              <div className="space-y-3 py-6" aria-label="Loading messages">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`space-y-1.5 ${i % 2 === 0 ? 'w-3/5 ml-auto' : 'w-2/3'}`}
                  >
                    <div className="h-12 rounded-2xl luxor-skeleton" />
                    <div className={`h-2 w-16 rounded luxor-skeleton ${i % 2 === 0 ? 'ml-auto' : ''}`} />
                  </div>
                ))}
              </div>
            ) : messages.length > 0 ? (
              <AnimatePresence initial={false}>
                {[...messages].reverse().map((msg) => {
                  const isOutbound = msg.direction === 'outbound'
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs ${
                        isOutbound
                          ? 'ml-auto bg-gradient-to-r from-[#caa24c] to-[#d4b060] text-white shadow-xs'
                          : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {msg.body || '(Media message)'}
                      </p>
                      <div
                        className={`mt-1 flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-wider ${
                          isOutbound ? 'text-white/80' : 'text-[color:var(--portal-muted)]'
                        }`}
                      >
                        <span>
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        {isOutbound && (
                          <span className="capitalize">{msg.status || 'sent'}</span>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            ) : (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center text-center p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#caa24c]/10 text-[#caa24c] mb-2">
                  <MessageSquare size={18} />
                </div>
                <p className="text-xs font-semibold text-[color:var(--portal-text)]">
                  No text messages yet
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--portal-muted)] max-w-xs">
                  Start the conversation below to reach {contactName || 'the client'} directly via SMS.
                </p>
              </div>
            )}
          </div>

          {/* Opt-out alert if recipient sent STOP */}
          {isOptedOut && (
            <div className="mx-3.5 mb-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
              <p className="font-bold text-[11px]">Recipient Opted Out</p>
              <p className="text-[10px] leading-4 opacity-90 mt-0.5">
                Client replied STOP. Carrier rules require waiting for them to reply START before texts can be sent.
              </p>
            </div>
          )}

          {/* Pinned Composer Footer */}
          <footer className="border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
            <div className="relative flex items-end gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-1.5 focus-within:border-[#caa24c]/50 focus-within:ring-2 focus-within:ring-[#caa24c]/15">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!phone || sending || isOptedOut}
                rows={2}
                placeholder={
                  isOptedOut
                    ? 'Texting disabled (Recipient opted out)'
                    : phone
                    ? `Message ${contactName || 'client'}…`
                    : 'No phone number available'
                }
                className="portal-scrollbar min-h-[44px] max-h-28 w-full resize-none bg-transparent px-2 py-1 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!phone || !body.trim() || sending || isOptedOut}
                aria-label="Send text message"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#caa24c] text-white transition-colors hover:bg-[#d8b564] disabled:bg-[color:var(--portal-soft)] disabled:text-[color:var(--portal-muted)] disabled:opacity-50"
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between px-1 text-[9px] text-[color:var(--portal-muted)]">
              <span>Press Enter to send · Shift+Enter for new line</span>
              {phone && <span className="font-mono">{formatPhoneDisplay(phone)}</span>}
            </div>
          </footer>
        </div>
      )}
    </section>,
    document.body
  )
}
