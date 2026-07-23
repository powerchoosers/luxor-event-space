'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'

export type NotificationType = 'email' | 'call' | 'sms' | 'form' | 'invoice_paid' | 'bill_due'

export interface PortalNotificationItem {
  id: string
  type: NotificationType
  title: string
  subtitle: string
  timestamp: string
  isRead: boolean
  targetUrl: string
  metadata?: Record<string, unknown>
}

const READ_STORAGE_KEY = 'luxor_read_notification_ids_v1'

// Internal/self email addresses to filter out — never show emails to/from ourselves
const INTERNAL_EMAIL_ADDRESSES = [
  'booking@luxoratlaspalmas.com',
  'hello@luxoratlaspalmas.com',
]

function getStoredReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function saveStoredReadIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(ids)))
  } catch (err) {
    console.error('Failed to save read notifications to localStorage:', err)
  }
}

function isInternalEmail(msg: Record<string, unknown>): boolean {
  const from = String(msg.fromAddress || msg.from || msg.sender || '').toLowerCase()
  const to = String(msg.toAddress || msg.to || '').toLowerCase()
  const direction = String(msg.direction || '').toLowerCase()

  // Drop sent/outbound emails entirely
  if (direction === 'sent' || direction === 'outbound' || direction === 'sending') return true

  // Drop emails where the sender is our own mailbox (internal self-emails)
  if (INTERNAL_EMAIL_ADDRESSES.some((addr) => from.includes(addr))) return true

  // Drop emails where the recipient is our own mailbox and sender is also our mailbox (internal)
  if (
    INTERNAL_EMAIL_ADDRESSES.some((addr) => to.includes(addr)) &&
    INTERNAL_EMAIL_ADDRESSES.some((addr) => from.includes(addr))
  ) {
    return true
  }

  return false
}

type RawRecord = Record<string, unknown>

export type NotificationToastPayload = {
  id: string
  type: NotificationType
  title: string
  subtitle: string
  targetUrl: string
}

export function usePortalNotifications() {
  const [items, setItems] = useState<PortalNotificationItem[]>([])
  const [, setReadIds] = useState<Set<string>>(() => getStoredReadIds())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Track IDs from last poll so we can detect genuinely new items
  const seenIdsRef = useRef<Set<string> | null>(null)
  // Callback fired for each new item (used by PortalShell to fire toasts)
  const onNewItemRef = useRef<((item: NotificationToastPayload) => void) | null>(null)

  const fetchNotifications = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const currentReadIds = getStoredReadIds()

      const [inquiriesRes, emailsRes, messagesRes, callsRes, invoicesRes, expensesRes] = await Promise.allSettled([
        fetch('/api/inquiries', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/email/inbox?limit=25', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/twilio/messages?limit=50', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/twilio/calls?limit=50', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/invoices', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/expenses', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
      ])

      const aggregated: PortalNotificationItem[] = []

      // 1. Form Submissions & Inquiries
      if (inquiriesRes.status === 'fulfilled' && inquiriesRes.value.ok) {
        const data = await inquiriesRes.value.json()
        if (Array.isArray(data)) {
          data.forEach((inq: RawRecord) => {
            const inqId = String(inq.id || '')
            const fullName = String(inq.full_name || 'New Lead Inquiry')
            const eventType = String(inq.event_type || 'Event')
            const guestCount = inq.guest_count ? String(inq.guest_count) : null
            const createdAt = String(inq.created_at || new Date().toISOString())

            const isRead = currentReadIds.has(`form_${inqId}`) || (inq.status !== 'new' && inq.status !== 'tour_requested')
            aggregated.push({
              id: `form_${inqId}`,
              type: 'form',
              title: fullName,
              subtitle: `${eventType} Inquiry ${guestCount ? `(${guestCount} guests)` : ''}`,
              timestamp: createdAt,
              isRead,
              targetUrl: `/portal/leads?id=${inqId}`,
              metadata: { inquiryId: inqId, email: inq.email, phone: inq.phone },
            })
          })
        }
      }

      // 2. Incoming Emails (filter out internal/sent emails)
      if (emailsRes.status === 'fulfilled' && emailsRes.value.ok) {
        const data = await emailsRes.value.json()
        const messages = Array.isArray(data.messages) ? data.messages : []
        messages
          .filter((msg: RawRecord) => !isInternalEmail(msg))
          .forEach((msg: RawRecord, idx: number) => {
            const emailId = String(msg.messageId || msg.id || `email_${idx}_${msg.dateSent || ''}`)
            const subject = decodeHtmlEntities(String(msg.subject || 'New Email Received'))
            const senderName = String(msg.senderName || msg.sender || msg.fromAddress || 'Unknown sender')
            const timestamp = String(msg.dateSent || msg.receivedTime || new Date().toISOString())
            const folderId = String(msg.folderId || '')

            const isRead = currentReadIds.has(emailId) || Boolean(msg.isRead)
            const folderQuery = folderId ? `&folderId=${encodeURIComponent(folderId)}` : ''
            aggregated.push({
              id: emailId,
              type: 'email',
              title: subject,
              subtitle: `From: ${senderName}`,
              timestamp,
              isRead,
              targetUrl: `/portal/marketing?tab=emails&messageId=${encodeURIComponent(emailId)}${folderQuery}`,
              metadata: { sender: msg.sender, fromAddress: msg.fromAddress, folderId },
            })
          })
      }

      // 3. SMS Messages (inbound only)
      if (messagesRes.status === 'fulfilled' && messagesRes.value.ok) {
        const data = await messagesRes.value.json()
        if (Array.isArray(data)) {
          data.filter((m: RawRecord) => m.direction === 'inbound').forEach((msg: RawRecord) => {
            const smsId = `sms_${String(msg.id)}`
            const sender = String(msg.contact_name || msg.from_number || 'Unknown')
            const body = String(msg.body || 'Media message')
            const timestamp = String(msg.created_at || msg.date_created || new Date().toISOString())

            const isRead = currentReadIds.has(smsId) || Boolean(msg.is_read)
            aggregated.push({
              id: smsId,
              type: 'sms',
              title: `Text from ${sender}`,
              subtitle: body,
              timestamp,
              isRead,
              targetUrl: '/portal/messages?tab=sms',
              metadata: { fromNumber: msg.from_number },
            })
          })
        }
      }

      // 4. Missed Calls
      if (callsRes.status === 'fulfilled' && callsRes.value.ok) {
        const data = await callsRes.value.json()
        if (Array.isArray(data)) {
          const missedCalls = data.filter((c: RawRecord) =>
            c.direction === 'inbound' &&
            (c.status === 'no-answer' || c.status === 'canceled' || c.status === 'busy' || c.status === 'failed' || c.outcome === 'missed')
          )
          missedCalls.forEach((call: RawRecord) => {
            const callId = `call_${String(call.id)}`
            const caller = String(call.contact_name || call.from_number || 'Caller')
            const fromNumber = call.from_number ? String(call.from_number) : null
            const timestamp = String(call.created_at || new Date().toISOString())

            const isRead = currentReadIds.has(callId) || Boolean(call.is_read)
            aggregated.push({
              id: callId,
              type: 'call',
              title: `Missed call from ${caller}`,
              subtitle: fromNumber ? `Phone: ${fromNumber}` : 'Inbound call unattended',
              timestamp,
              isRead,
              targetUrl: '/portal/calls',
              metadata: { fromNumber: call.from_number },
            })
          })
        }
      }

      // 5. Invoices (Paid & Due)
      if (invoicesRes.status === 'fulfilled' && invoicesRes.value.ok) {
        const data = await invoicesRes.value.json()
        if (Array.isArray(data)) {
          data.forEach((inv: RawRecord) => {
            const invId = `inv_${String(inv.id)}`
            const clientName = String(inv.client_name || 'Client')
            const total = Number(inv.total || 0)
            const eventType = String(inv.event_type || 'Invoice')
            const dueDate = inv.due_date ? String(inv.due_date) : null
            const timestamp = String(inv.updated_at || inv.created_at || new Date().toISOString())

            const isPaid = inv.status === 'paid'
            const isRead = currentReadIds.has(`${invId}_paid`) || currentReadIds.has(invId)
            if (isPaid) {
              aggregated.push({
                id: `${invId}_paid`,
                type: 'invoice_paid',
                title: `Payment Received: ${clientName}`,
                subtitle: `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} paid for ${eventType}`,
                timestamp,
                isRead,
                targetUrl: '/portal/invoices',
                metadata: { invoiceId: inv.id },
              })
            } else if (inv.status !== 'draft' && inv.status !== 'cancelled') {
              aggregated.push({
                id: invId,
                type: 'bill_due',
                title: `Invoice Payment Due: ${clientName}`,
                subtitle: `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} due ${dueDate ? `on ${dueDate}` : 'soon'}`,
                timestamp: String(inv.created_at || new Date().toISOString()),
                isRead,
                targetUrl: '/portal/invoices',
                metadata: { invoiceId: inv.id },
              })
            }
          })
        }
      }

      // 6. Expenses & Bills Due
      if (expensesRes.status === 'fulfilled' && expensesRes.value.ok) {
        const data = await expensesRes.value.json()
        if (Array.isArray(data)) {
          data.filter((e: RawRecord) => e.status === 'pending' || e.status === 'unpaid').forEach((exp: RawRecord) => {
            const expId = `exp_${String(exp.id)}`
            const vendorName = String(exp.vendor_name || exp.category || 'Vendor')
            const category = String(exp.category || 'Expense')
            const amount = Number(exp.amount || 0)
            const description = exp.description ? String(exp.description) : category
            const timestamp = String(exp.incurred_on || exp.created_at || new Date().toISOString())

            const isRead = currentReadIds.has(expId)
            aggregated.push({
              id: expId,
              type: 'bill_due',
              title: `Vendor Bill Due: ${vendorName}`,
              subtitle: `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} - ${description}`,
              timestamp,
              isRead,
              targetUrl: '/portal/finances',
              metadata: { expenseId: exp.id },
            })
          })
        }
      }

      // Sort by timestamp descending
      aggregated.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      // Detect genuinely new items since last poll and fire toast callbacks
      const previousIds = seenIdsRef.current
      const currentIds = new Set(aggregated.map((i) => i.id))
      seenIdsRef.current = currentIds

      if (previousIds !== null && onNewItemRef.current) {
        for (const item of aggregated) {
          if (!previousIds.has(item.id) && !item.isRead) {
            onNewItemRef.current({
              id: item.id,
              type: item.type,
              title: item.title,
              subtitle: item.subtitle,
              targetUrl: item.targetUrl,
            })
          }
        }
      }

      setItems(aggregated)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch portal notifications:', err)
      setError(err instanceof Error ? err.message : 'Failed to sync notifications.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch (not silent so loading state shows)
  useEffect(() => {
    fetchNotifications(false)
  }, [fetchNotifications])

  // Fast-poll for high-priority: invoices & form submissions every 15s
  // General poll every 30s
  useEffect(() => {
    const generalInterval = setInterval(() => fetchNotifications(true), 30_000)
    return () => clearInterval(generalInterval)
  }, [fetchNotifications])

  const registerToastCallback = useCallback((cb: (item: NotificationToastPayload) => void) => {
    onNewItemRef.current = cb
    return () => {
      if (onNewItemRef.current === cb) onNewItemRef.current = null
    }
  }, [])

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveStoredReadIds(next)
      return next
    })
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isRead: true } : item))
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    setItems((prev) => {
      const allIds = prev.map((item) => item.id)
      const next = new Set(getStoredReadIds())
      allIds.forEach((id) => next.add(id))
      saveStoredReadIds(next)
      setReadIds(next)
      return prev.map((item) => ({ ...item, isRead: true }))
    })
  }, [])

  const unreadCount = useMemo(() => {
    return items.filter((item) => !item.isRead).length
  }, [items])

  const unreadCountsByType = useMemo(() => {
    const counts: Record<NotificationType, number> = {
      email: 0,
      call: 0,
      sms: 0,
      form: 0,
      invoice_paid: 0,
      bill_due: 0,
    }
    items.forEach((item) => {
      if (!item.isRead) {
        counts[item.type] = (counts[item.type] || 0) + 1
      }
    })
    return counts
  }, [items])

  return {
    items,
    unreadCount,
    unreadCountsByType,
    loading,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
    registerToastCallback,
  }
}
