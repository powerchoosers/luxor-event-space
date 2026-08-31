'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'

export type NotificationType = 'email' | 'call' | 'sms' | 'form' | 'booking' | 'calendar_response' | 'proposal_opened' | 'checkout_opened' | 'invoice_paid' | 'bill_due' | 'contract' | 'email_open' | 'layout_feedback'

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
const NOTIFIED_TOAST_STORAGE_KEY = 'luxor_notified_toast_ids_v1'
const GENERAL_POLL_INTERVAL_MS = 30_000
const NOTIFICATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const NOTIFICATION_ATTENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Internal/self email addresses to filter out — never show emails to/from ourselves
const INTERNAL_EMAIL_ADDRESSES = [
  'booking@luxoratlaspalmas.com',
  'hello@luxoratlaspalmas.com',
  'a.patterson@luxoratlaspalmas.com',
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

function getStoredNotifiedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(NOTIFIED_TOAST_STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch {
    return new Set()
  }
}

function saveStoredNotifiedIds(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    const arr = Array.from(ids).slice(-500)
    localStorage.setItem(NOTIFIED_TOAST_STORAGE_KEY, JSON.stringify(arr))
  } catch (err) {
    console.error('Failed to save notified toast ids to localStorage:', err)
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

  // Drop system daemons, bounce notifications, and mailer-daemon emails
  if (
    from.includes('mailer-daemon') ||
    from.includes('postmaster') ||
    from.includes('bounce@') ||
    from.includes('no-reply') ||
    from.includes('noreply')
  ) {
    return true
  }

  return false
}

type RawRecord = Record<string, unknown>

function normalizeEmail(value: unknown) {
  const match = String(value || '').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  return match?.[0] || ''
}

function leadUrl(inquiryId: unknown, section?: string, stage?: string) {
  const id = String(inquiryId || '').trim()
  if (!id) return '/portal/leads'
  const params = new URLSearchParams()
  if (section) params.set('tab', section)
  if (stage) params.set('stage', stage)
  const query = params.size ? `?${params.toString()}` : ''
  return `/portal/leads/${encodeURIComponent(id)}${query}`
}

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
  const [error, setError] = useState<string | null>(null)  // Track IDs from last poll & persistent toast notifications fired
  const seenIdsRef = useRef<Set<string> | null>(null)
  const notifiedToastIdsRef = useRef<Set<string> | null>(null)
  const previousEmailItemsRef = useRef<PortalNotificationItem[]>([])
  const fetchInFlightRef = useRef(false)
  // Callback fired for each new item (used by PortalShell to fire toasts)
  const onNewItemRef = useRef<((item: NotificationToastPayload) => void) | null>(null)

  const fetchNotifications = useCallback(async (silent = false, refreshEmails = false) => {
    if (fetchInFlightRef.current) return
    fetchInFlightRef.current = true
    try {
      if (!silent) setLoading(true)
      const currentReadIds = getStoredReadIds()

      const shouldFetchEmails = !silent || refreshEmails

      const [inquiriesRes, emailsRes, messagesRes, callsRes, invoicesRes, expensesRes, bookingsRes, paymentsRes, signaturesRes, marketingEventsRes, layoutReviewsRes, calendarResponsesRes] = await Promise.allSettled([
        fetch('/api/inquiries', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        shouldFetchEmails
          ? fetch('/api/email/events?limit=25', { headers: { Accept: 'application/json' }, cache: 'no-store' })
          : Promise.resolve(null),
        fetch('/api/twilio/messages?limit=50', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/twilio/calls?limit=50', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/invoices', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/expenses', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/bookings', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/payments', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/signatures?limit=100', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/marketing/events?limit=50', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/portal/layout-reviews/notifications?limit=50', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/portal/calendar-responses/notifications?limit=50', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
      ])

      const aggregated: PortalNotificationItem[] = []
      const inquiries = inquiriesRes.status === 'fulfilled' && inquiriesRes.value.ok
        ? await inquiriesRes.value.json() as RawRecord[]
        : []
      const invoiceRecords = invoicesRes.status === 'fulfilled' && invoicesRes.value.ok
        ? await invoicesRes.value.json() as RawRecord[]
        : []
      const inquiryByEmail = new Map<string, RawRecord>()
      const inquiryById = new Map<string, RawRecord>()
      const invoiceById = new Map<string, RawRecord>()
      if (Array.isArray(inquiries)) {
        inquiries.forEach((inquiry) => {
          inquiryById.set(String(inquiry.id || ''), inquiry)
          const email = normalizeEmail(inquiry.email)
          if (email && !inquiryByEmail.has(email)) inquiryByEmail.set(email, inquiry)
        })
      }

      // Calendar RSVP replies are separate from the generic inbound email alert.
      // Verified replies state the attendance change; unverified replies remain review-only.
      if (calendarResponsesRes.status === 'fulfilled' && calendarResponsesRes.value.ok) {
        const data = await calendarResponsesRes.value.json() as { responses?: RawRecord[] }
        const calendarResponses = Array.isArray(data.responses) ? data.responses : []
        calendarResponses.forEach((response) => {
          const responseId = String(response.id || '').trim()
          if (!responseId) return
          const inquiryId = String(response.inquiry_id || '').trim()
          const inquiry = inquiryById.get(inquiryId)
          const attendeeEmail = normalizeEmail(response.attendee_email)
          const guestName = String(inquiry?.full_name || attendeeEmail || 'Guest')
          const partstat = String(response.partstat || '').toUpperCase()
          const disposition = String(response.disposition || '')
          const eventTitle = String(response.event_title || 'Calendar invitation')
          const responseLabel = partstat === 'ACCEPTED'
            ? 'accepted'
            : partstat === 'DECLINED'
              ? 'declined'
              : 'responded tentative'
          const notificationId = `calendar_response_${responseId}`
          const needsReview = disposition === 'pending_review'

          aggregated.push({
            id: notificationId,
            type: 'calendar_response',
            title: needsReview ? 'Calendar response needs review' : `${guestName} ${responseLabel}`,
            subtitle: needsReview
              ? `${guestName} replied ${responseLabel} to ${eventTitle}. Verify the reply before attendance changes.`
              : `${eventTitle} attendance updated to ${partstat === 'TENTATIVE' ? 'Tentative' : partstat === 'DECLINED' ? 'Declined' : 'Accepted'}.`,
            timestamp: String(response.reply_stamp || response.created_at || new Date().toISOString()),
            isRead: currentReadIds.has(notificationId),
            targetUrl: needsReview
              ? '/portal/settings?tab=integrations#calendar-reply-review-title'
              : leadUrl(inquiryId, 'overview', 'planning'),
            metadata: { responseId, inquiryId, attendeeEmail, partstat, disposition, eventId: response.event_id },
          })
        })
      }
      if (Array.isArray(invoiceRecords)) {
        invoiceRecords.forEach((invoice) => invoiceById.set(String(invoice.id || ''), invoice))
      }

      // 1. Form Submissions, RSVPs & Inquiries
      if (Array.isArray(inquiries)) {
          inquiries.forEach((inq: RawRecord) => {
            const inqId = String(inq.id || '')
            const fullName = String(inq.full_name || 'New Lead Inquiry')
            const eventType = String(inq.event_type || 'Event')
            const guestCount = inq.guest_count ? String(inq.guest_count) : null
            const createdAt = String(inq.created_at || new Date().toISOString())
            const source = String(inq.source || 'Website')

            const isRead = currentReadIds.has(`form_${inqId}`) || (inq.status !== 'new' && inq.status !== 'tour_requested')

            let title = `New Inquiry: ${fullName}`
            if (source.toLowerCase().includes('rsvp') || eventType.toLowerCase().includes('rsvp')) {
              title = `New RSVP: ${fullName}`
            } else if (source.toLowerCase().includes('tour') || inq.status === 'tour_requested') {
              title = `Tour Request: ${fullName}`
            } else if (source.toLowerCase().includes('booking') || eventType.toLowerCase().includes('booking')) {
              title = `New Booking Request: ${fullName}`
            }

            aggregated.push({
              id: `form_${inqId}`,
              type: 'form',
              title,
              subtitle: `${eventType} ${guestCount ? `(${guestCount} guests)` : ''}`,
              timestamp: createdAt,
              isRead,
              targetUrl: leadUrl(inqId),
              metadata: { inquiryId: inqId, email: inq.email, phone: inq.phone, source },
            })
        })
      }

      // Layout approvals and change notes use a protected portal API instead of
      // direct browser database access. The recipient link never receives lead data.
      if (layoutReviewsRes.status === 'fulfilled' && layoutReviewsRes.value.ok) {
        const data = await layoutReviewsRes.value.json() as { feedback?: RawRecord[] }
        const layoutFeedback = Array.isArray(data.feedback) ? data.feedback : []
        layoutFeedback.forEach((entry) => {
          const feedbackId = String(entry.id || '').trim()
          const inquiryId = String(entry.inquiry_id || '').trim()
          if (!feedbackId || !inquiryId) return
          const action = String(entry.action || '')
          const layoutName = String(entry.layout_name || 'Saved layout')
          const note = String(entry.note || '').trim()
          const isApproved = action === 'approved'
          const notificationId = `layout_feedback_${feedbackId}`
          aggregated.push({
            id: notificationId,
            type: 'layout_feedback',
            title: isApproved ? `Layout approved: ${layoutName}` : `Layout feedback: ${layoutName}`,
            subtitle: note ? note.slice(0, 220) : 'The recipient approved the saved layout.',
            timestamp: String(entry.created_at || new Date().toISOString()),
            isRead: currentReadIds.has(notificationId),
            targetUrl: leadUrl(inquiryId, 'overview', 'planning'),
            metadata: { inquiryId, reviewId: entry.review_id, action },
          })
        })
      }

      // 2. Incoming Emails (filter out internal/sent emails)
      if (shouldFetchEmails) {
        const emailItems: PortalNotificationItem[] = []
        if (emailsRes.status === 'fulfilled' && emailsRes.value && emailsRes.value.ok) {
          const data = await emailsRes.value.json()
          const messages = Array.isArray(data.messages) ? data.messages : []

          messages
            .filter((msg: RawRecord) => !isInternalEmail(msg))
            .forEach((msg: RawRecord) => {
              const rawId = String(msg.id || msg.messageId || '').trim()
              const emailId = rawId
                ? `email_${rawId}`
                : `email_${String(msg.fromAddress || msg.from || 'unknown')}_${String(msg.receivedAt || msg.dateSent || '')}`
              const subject = decodeHtmlEntities(String(msg.subject || 'New Email Received'))
              const senderName = String(msg.senderName || msg.sender || msg.fromAddress || msg.from || 'Unknown sender')
              const timestamp = String(msg.receivedAt || msg.dateSent || new Date().toISOString())
              const folderId = String(msg.folderId || '')
              const zohoMessageId = String(msg.messageId || '').trim()

              const isRead = currentReadIds.has(emailId) || Boolean(msg.isRead)
              const folderQuery = folderId ? `&folderId=${encodeURIComponent(folderId)}` : ''
              emailItems.push({
                id: emailId,
                type: 'email',
                title: subject,
                subtitle: `From: ${senderName}`,
                timestamp,
                isRead,
                targetUrl: zohoMessageId
                  ? `/portal/emails?messageId=${encodeURIComponent(zohoMessageId)}${folderQuery}`
                  : '/portal/emails',
                metadata: { sender: msg.sender, fromAddress: msg.fromAddress || msg.from, folderId },
              })
            })
        }
        if (emailsRes.status === 'fulfilled' && emailsRes.value && emailsRes.value.ok) {
          previousEmailItemsRef.current = emailItems
          aggregated.push(...emailItems)
        } else {
          aggregated.push(...previousEmailItemsRef.current)
        }
      } else {
        // Retain previous email items on intermediate 15s polls
        aggregated.push(...previousEmailItemsRef.current.map((item) => ({
          ...item,
          isRead: currentReadIds.has(item.id) || item.isRead,
        })))
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
            const inquiryId = String(msg.inquiry_id || '')
            aggregated.push({
              id: smsId,
              type: 'sms',
              title: `Text from ${sender}`,
              subtitle: body,
              timestamp,
              isRead,
              targetUrl: inquiryId ? leadUrl(inquiryId, 'messages') : '/portal/messages?tab=sms',
              metadata: { fromNumber: msg.from_number, inquiryId },
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
            const inquiryId = String(call.inquiry_id || '')
            aggregated.push({
              id: callId,
              type: 'call',
              title: `Missed call from ${caller}`,
              subtitle: fromNumber ? `Phone: ${fromNumber}` : 'Inbound call unattended',
              timestamp,
              isRead,
              targetUrl: inquiryId ? leadUrl(inquiryId, 'activity') : '/portal/calls',
              metadata: { fromNumber: call.from_number, inquiryId },
            })
          })
        }
      }

      // 5. Confirmed or tentative bookings
      if (bookingsRes.status === 'fulfilled' && bookingsRes.value.ok) {
        const data = await bookingsRes.value.json()
        if (Array.isArray(data)) {
          data.filter((booking: RawRecord) => booking.status === 'confirmed' || booking.status === 'tentative').forEach((booking: RawRecord) => {
            const bookingId = String(booking.id || '')
            const clientName = String(booking.client_name || 'Client')
            const packageName = String(booking.package_name || 'Event Package')
            const eventDate = booking.event_date ? String(booking.event_date) : null
            const timestamp = String(booking.booked_at || booking.updated_at || booking.created_at || new Date().toISOString())
            const status = String(booking.status || 'confirmed')
            const inquiryId = String(booking.inquiry_id || inquiryByEmail.get(normalizeEmail(booking.email))?.id || '')

            const isRead = currentReadIds.has(`booking_${bookingId}_${status}`) || currentReadIds.has(`booking_${bookingId}`)
            aggregated.push({
              id: `booking_${bookingId}_${status}`,
              type: 'booking',
              title: status === 'confirmed' ? `Booking Confirmed: ${clientName}` : `Booking Held: ${clientName}`,
              subtitle: [packageName, eventDate ? `for ${eventDate}` : ''].filter(Boolean).join(' · '),
              timestamp,
              isRead,
              targetUrl: leadUrl(inquiryId, 'overview'),
              metadata: { inquiryId, bookingId },
            })
          })
        }
      }

      // 6. Actual payment records, with invoice status as a fallback.
      const paidInvoiceIds = new Set<string>()
      if (paymentsRes.status === 'fulfilled' && paymentsRes.value.ok) {
        const data = await paymentsRes.value.json()
        if (Array.isArray(data)) {
          data.filter((payment: RawRecord) => payment.status === 'paid').forEach((payment: RawRecord) => {
            const paymentId = String(payment.id || '')
            const inquiryId = String(payment.inquiry_id || '')
            const invoiceId = String(payment.invoice_id || '')
            if (invoiceId) paidInvoiceIds.add(invoiceId)
            const invoiceInquiryId = String(invoiceById.get(invoiceId)?.inquiry_id || '')
            const inquiry = inquiryId || invoiceInquiryId ? null : inquiryByEmail.get(normalizeEmail(payment.metadata && (payment.metadata as RawRecord).email))
            const resolvedInquiryId = inquiryId || invoiceInquiryId || String(inquiry?.id || '')
            const invoice = invoiceById.get(invoiceId)
            const clientName = String(invoice?.client_name || inquiry?.full_name || 'Client')
            const paymentMetadata = payment.metadata as RawRecord | undefined
            const paymentLabel = String(paymentMetadata?.payment_label || 'Stripe payment')
            aggregated.push({
              id: `payment_${paymentId}`,
              type: 'invoice_paid',
              title: `Payment received: ${clientName}`,
              subtitle: `${paymentLabel} · $${Number(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${payment.payment_method ? ` via ${String(payment.payment_method).replaceAll('_', ' ')}` : ''}`,
              timestamp: String(payment.paid_at || payment.updated_at || payment.created_at || new Date().toISOString()),
              isRead: currentReadIds.has(`payment_${paymentId}`),
              targetUrl: leadUrl(resolvedInquiryId, 'documents'),
              metadata: { inquiryId: resolvedInquiryId, invoiceId, paymentId },
            })
          })
        }
      }

      // 7. Invoices (Paid fallback & Due)
      if (Array.isArray(invoiceRecords)) {
          invoiceRecords.forEach((inv: RawRecord) => {
            const invId = `inv_${String(inv.id)}`
            const clientName = String(inv.client_name || 'Client')
            const total = Number(inv.total || 0)
            const eventType = String(inv.event_type || 'Invoice')
            const dueDate = inv.due_date ? String(inv.due_date) : null
            const timestamp = String(inv.updated_at || inv.created_at || new Date().toISOString())

            const isPaid = inv.status === 'paid'
            const isRead = currentReadIds.has(`${invId}_paid`) || currentReadIds.has(invId)
            const inquiryId = String(inv.inquiry_id || '')
            const proposalViewedAt = inv.proposal_viewed_at ? String(inv.proposal_viewed_at) : ''
            if (proposalViewedAt) {
              const openedId = `proposal_opened_${String(inv.id)}`
              aggregated.push({
                id: openedId,
                type: 'proposal_opened',
                title: `Proposal opened: ${clientName}`,
                subtitle: `${eventType} proposal · $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                timestamp: proposalViewedAt,
                isRead: currentReadIds.has(openedId),
                targetUrl: inquiryId ? `${leadUrl(inquiryId)}?tab=overview&stage=proposal` : '/portal/leads',
                metadata: { invoiceId: inv.id, inquiryId },
              })
            }
            const checkoutOpenedAt = inv.stripe_checkout_opened_at ? String(inv.stripe_checkout_opened_at) : ''
            if (checkoutOpenedAt) {
              const checkoutOpenedId = `checkout_opened_${String(inv.id)}`
              aggregated.push({
                id: checkoutOpenedId,
                type: 'checkout_opened',
                title: `Stripe Checkout opened: ${clientName}`,
                subtitle: `${String(inv.payment_requested_label || 'Payment request')} · $${Number(inv.payment_requested_amount || total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                timestamp: checkoutOpenedAt,
                isRead: currentReadIds.has(checkoutOpenedId),
                targetUrl: inquiryId ? `${leadUrl(inquiryId)}?tab=overview&stage=proposal` : '/portal/leads',
                metadata: { invoiceId: inv.id, inquiryId },
              })
            }
            if (isPaid && !paidInvoiceIds.has(String(inv.id || ''))) {
              aggregated.push({
                id: `${invId}_paid`,
                type: 'invoice_paid',
                title: `Payment Received: ${clientName}`,
                subtitle: `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} paid for ${eventType}`,
                timestamp,
                isRead,
                targetUrl: leadUrl(inquiryId, 'documents'),
                metadata: { invoiceId: inv.id, inquiryId },
              })
            } else if (inv.status !== 'draft' && inv.status !== 'cancelled') {
              aggregated.push({
                id: invId,
                type: 'bill_due',
                title: `Invoice Payment Due: ${clientName}`,
                subtitle: `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} due ${dueDate ? `on ${dueDate}` : 'soon'}`,
                timestamp: String(inv.created_at || new Date().toISOString()),
                isRead,
                targetUrl: inquiryId ? leadUrl(inquiryId, 'documents') : '/portal/finances?tab=invoices',
                metadata: { invoiceId: inv.id, inquiryId },
              })
            }
          })
      }

      // 8. Contract viewed/signed activity.
      if (signaturesRes.status === 'fulfilled' && signaturesRes.value.ok) {
        const data = await signaturesRes.value.json()
        if (Array.isArray(data)) {
          data.filter((signature: RawRecord) => signature.status === 'viewed' || signature.status === 'signed').forEach((signature: RawRecord) => {
            const signatureId = String(signature.id || '')
            const inquiryId = String(signature.inquiry_id || '')
            const signed = signature.status === 'signed'
            const notificationId = `contract_${signatureId}_${String(signature.status)}`
            aggregated.push({
              id: notificationId,
              type: 'contract',
              title: signed ? `Contract signed: ${String(signature.client_name || 'Client')}` : `Contract opened: ${String(signature.client_name || 'Client')}`,
              subtitle: String(signature.contract_title || 'Luxor Event Space agreement'),
              timestamp: String(signature.signed_at || signature.updated_at || signature.created_at || new Date().toISOString()),
              isRead: currentReadIds.has(notificationId),
              targetUrl: leadUrl(inquiryId, 'documents'),
              metadata: { inquiryId, signatureId },
            })
          })
        }
      }

      // 9. Campaign opens/clicks matched to a lead email.
      if (marketingEventsRes.status === 'fulfilled' && marketingEventsRes.value.ok) {
        const data = await marketingEventsRes.value.json() as { events?: RawRecord[] }
        const rawEvents = (data.events || []).filter((event) => event.event_type === 'open' || event.event_type === 'click')

        type OpenGroup = {
          inquiry: RawRecord
          events: RawRecord[]
          latestTimestamp: string
        }
        const openGroups = new Map<string, OpenGroup>()

        rawEvents.forEach((event) => {
          const inquiry = inquiryByEmail.get(normalizeEmail(event.recipient_email))
          if (!inquiry?.id) return
          const clicked = event.event_type === 'click'

          if (clicked) {
            const eventId = `marketing_${String(event.id || '')}`
            const leadName = String(inquiry.full_name || event.recipient_name || 'Client')
            const campaignSubject = String(event.campaign_subject || event.campaign_name || 'Email')
            aggregated.push({
              id: eventId,
              type: 'email_open',
              title: `Link Clicked: ${leadName}`,
              subtitle: `Clicked link in ${campaignSubject}`,
              timestamp: String(event.created_at || new Date().toISOString()),
              isRead: currentReadIds.has(eventId),
              targetUrl: leadUrl(inquiry.id, 'activity'),
              metadata: { inquiryId: inquiry.id, campaignId: event.campaign_id, eventId: event.id },
            })
          } else {
            // Group opens for the same recipient in 2-minute time windows so multi-email thread opens generate 1 notification
            const eventTime = new Date(String(event.created_at || '')).getTime() || Date.now()
            const timeBucket = Math.floor(eventTime / (2 * 60 * 1000))
            const groupKey = `${String(inquiry.id)}_${timeBucket}`

            const existing = openGroups.get(groupKey)
            if (existing) {
              existing.events.push(event)
              if (eventTime > new Date(existing.latestTimestamp).getTime()) {
                existing.latestTimestamp = String(event.created_at)
              }
            } else {
              openGroups.set(groupKey, {
                inquiry,
                events: [event],
                latestTimestamp: String(event.created_at || new Date().toISOString()),
              })
            }
          }
        })

        openGroups.forEach((group, groupKey) => {
          const leadName = String(group.inquiry.full_name || 'Client')
          const firstEvent = group.events[0]
          const firstSubject = String(firstEvent.campaign_subject || firstEvent.campaign_name || 'Email')
          const count = group.events.length

          const eventId = count > 1 ? `marketing_group_${groupKey}` : `marketing_${String(firstEvent.id || '')}`
          const isRead = group.events.every((ev) => currentReadIds.has(`marketing_${String(ev.id || '')}`)) || currentReadIds.has(eventId)

          const title = `Email Opened: ${leadName}`
          const subtitle = count > 1
            ? `Opened email thread (${count} messages including "${firstSubject}")`
            : `Opened email "${firstSubject}"`

          aggregated.push({
            id: eventId,
            type: 'email_open',
            title,
            subtitle,
            timestamp: group.latestTimestamp,
            isRead,
            targetUrl: leadUrl(group.inquiry.id, 'activity'),
            metadata: { inquiryId: group.inquiry.id, count, eventIds: group.events.map((e) => e.id) },
          })
        })
      }

      // 10. Expenses & Bills Due
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

      // Detect genuinely new items since last poll and fire toast callbacks (deduped via localStorage)
      const retained = aggregated.filter((item) => {
        const timestamp = new Date(item.timestamp).getTime()
        return Number.isFinite(timestamp) && Date.now() - timestamp <= NOTIFICATION_RETENTION_MS
      }).map((item) => {
        const timestamp = new Date(item.timestamp).getTime()
        return Date.now() - timestamp > NOTIFICATION_ATTENTION_WINDOW_MS
          ? { ...item, isRead: true }
          : item
      })
      retained.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      const previousIds = seenIdsRef.current
      const currentIds = new Set(retained.map((i) => i.id))
      if (notifiedToastIdsRef.current === null) {
        notifiedToastIdsRef.current = getStoredNotifiedIds()
      }
      const notifiedToastIds = notifiedToastIdsRef.current

      const isFirstLoad = previousIds === null

      // On initial page mount, mark ALL existing historical items as already notified
      // so opening/reloading the portal never floods the UI with popups for existing items
      if (isFirstLoad) {
        retained.forEach((item) => {
          notifiedToastIds.add(item.id)
        })
        saveStoredNotifiedIds(notifiedToastIds)
      }

      // Fire toasts for brand new items that have NEVER been notified before
      if (onNewItemRef.current) {
        for (const item of retained) {
          if (!item.isRead && !notifiedToastIds.has(item.id)) {
            notifiedToastIds.add(item.id)
            saveStoredNotifiedIds(notifiedToastIds)

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

      seenIdsRef.current = currentIds
      setItems(retained)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch portal notifications:', err)
      setError(err instanceof Error ? err.message : 'Failed to sync notifications.')
    } finally {
      setLoading(false)
      fetchInFlightRef.current = false
    }
  }, [])

  // Initial fetch (not silent so loading state shows)
  useEffect(() => {
    fetchNotifications(false)
  }, [fetchNotifications])

  // Server-side integrations broadcast only opaque signals to authenticated portal
  // pages. The browser then reloads protected data through portal APIs.
  useEffect(() => {
    const supabase = getPortalSupabaseClient()
    if (!supabase) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    let active = true

    void fetch('/api/portal/realtime-config', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || typeof data?.realtimeChannel !== 'string') return
        channel = supabase
          .channel(data.realtimeChannel)
          .on('broadcast', { event: 'email-arrived' }, () => {
            void fetchNotifications(true, true)
          })
          .on('broadcast', { event: 'email-status' }, () => {
            void fetchNotifications(true, true)
          })
          .on('broadcast', { event: 'contract-status' }, () => {
            void fetchNotifications(true)
          })
          .on('broadcast', { event: 'booking-confirmed' }, () => {
            void fetchNotifications(true)
          })
          .on('broadcast', { event: 'layout-review-feedback' }, () => {
            void fetchNotifications(true)
          })
          .subscribe()
      })
      .catch((error) => console.warn('Failed to connect portal realtime notifications:', error))

    return () => {
      active = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [fetchNotifications])

  // Secure polling is the fallback for private RLS-protected rows that cannot be
  // delivered to the browser's anonymous Realtime connection.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchNotifications(true)
      }
    }
    window.addEventListener('visibilitychange', handleVisibilityChange)
    const generalInterval = setInterval(() => {
      // Include webhook-backed email events in the safety poll. Realtime remains
      // the fast path, while this makes a dropped or unavailable WebSocket heal
      // automatically instead of requiring a full page refresh.
      if (document.visibilityState === 'visible') void fetchNotifications(true, true)
    }, GENERAL_POLL_INTERVAL_MS)
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(generalInterval)
    }
  }, [fetchNotifications])

  // Sub-100ms Supabase Realtime WebSocket subscription for instant updates on website RSVPs, bookings, and form submissions
  useEffect(() => {
    const supabase = getPortalSupabaseClient()
    if (!supabase) return

    const channel = supabase
      .channel('luxor-notifications-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_inquiries' },
        () => {
          fetchNotifications(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_bookings' },
        () => {
          fetchNotifications(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_messages' },
        () => {
          fetchNotifications(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_calls' },
        () => {
          fetchNotifications(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_invoices' },
        () => {
          fetchNotifications(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_payments' },
        () => {
          fetchNotifications(true)
        }
      )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn(`Email arrival notification channel entered ${status}; secure polling remains active.`)
              void fetchNotifications(true, true)
            }
          })

    return () => {
      supabase.removeChannel(channel)
    }
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
      booking: 0,
      calendar_response: 0,
      invoice_paid: 0,
      proposal_opened: 0,
      checkout_opened: 0,
      bill_due: 0,
      contract: 0,
      email_open: 0,
      layout_feedback: 0,
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
