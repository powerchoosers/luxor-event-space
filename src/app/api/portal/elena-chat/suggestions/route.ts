import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { isLuxorBookingReceivableEligible } from '@/lib/luxorPaymentDashboardModel'
import { NextResponse } from 'next/server'

type PriorityKind = 'lead' | 'money' | 'contract' | 'event' | 'message' | 'task'

type SmartSuggestion = {
  id: string
  kind: PriorityKind
  label: string
  detail: string
  prompt: string
  urgency: 'urgent' | 'attention' | 'plan'
}

interface InquiryRecord {
  id: string
  full_name: string | null
  email: string | null
  event_type: string | null
  status: string | null
  pipeline_stage: string | null
  campaign_key?: string | null
  created_at: string
  updated_at: string
}

interface MailMessageRecord {
  id: string
  direction: string | null
  from_address: string | null
  to_addresses: string[] | null
  subject: string | null
  text_body: string | null
  occurred_at: string
  read_at: string | null
}

interface BookingRecord {
  id: string
  client_name: string | null
  event_type: string | null
  event_date: string | null
  status: string | null
  contract_status: string | null
  contract_signed_at: string | null
  final_payment_due_date: string | null
}

interface InvoiceRecord {
  id: string
  booking_id: string | null
  parent_invoice_id: string | null
  invoice_kind: string | null
  proposal_accepted_at: string | null
  offer_status: string | null
  client_name: string | null
  total: number | string | null
  status: string | null
  due_date: string | null
}

interface TaskRecord {
  id: string
  title: string | null
  priority: string | null
  status: string | null
  due_date: string | null
}

interface SignatureRequestRecord {
  id: string
  client_name: string | null
  status: string | null
  expires_at: string | null
  updated_at: string
}

interface MessageRecord {
  id: string
  contact_name: string | null
  body: string | null
  created_at: string
}

const DEFAULT_SUGGESTIONS: SmartSuggestion[] = [
  {
    id: 'review-inquiries',
    kind: 'lead',
    label: 'Lead follow-up',
    detail: 'Review active inquiries that need a next step.',
    prompt: 'Show active inquiries and recommend the next best follow-up for each.',
    urgency: 'attention',
  },
  {
    id: 'money-attention',
    kind: 'money',
    label: 'Money to collect',
    detail: 'See open and overdue invoices in priority order.',
    prompt: 'Show open and overdue invoices, ordered by what needs attention first.',
    urgency: 'attention',
  },
  {
    id: 'upcoming-events',
    kind: 'event',
    label: 'Upcoming events',
    detail: 'Check what needs coordination before the next events.',
    prompt: 'Show the next upcoming events and what still needs to be coordinated.',
    urgency: 'plan',
  },
  {
    id: 'today-tasks',
    kind: 'task',
    label: 'Today’s work',
    detail: 'Prioritize overdue and due-soon tasks.',
    prompt: 'Show overdue and due-soon tasks, ordered by priority.',
    urgency: 'attention',
  },
]

function dateOnly(value: string | null | undefined) {
  return value ? new Date(`${value}T12:00:00`).getTime() : Number.NaN
}

function daysFromToday(value: string | null | undefined) {
  const target = dateOnly(value)
  if (Number.isNaN(target)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86_400_000)
}

function formatMoney(value: number | string | null) {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
    : 'an open balance'
}

function isOpenStatus(value: string | null | undefined) {
  return !['paid', 'completed', 'cancelled', 'canceled', 'signed', 'closed'].includes((value || '').toLowerCase())
}

interface VendorBillRecord {
  id: string
  provider: string | null
  service: string | null
  amount: number | string | null
  status: string | null
  due_date: string | null
  source_type: string | null
  extraction_status: string | null
  extraction_confidence: number | string | null
  arithmetic_status: string | null
}

async function withFallbackTimeout<T>(request: Promise<T>, fallback: T, timeoutMs = 4_500) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      request.catch(() => fallback),
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function chooseDiversePriorities(items: SmartSuggestion[], cycle: number, size = 4) {
  if (items.length <= size) return items
  const start = (cycle * size) % items.length
  const ordered = [...items.slice(start), ...items.slice(0, start)]
  const selected: SmartSuggestion[] = []
  const kindCounts = new Map<PriorityKind, number>()

  for (const item of ordered) {
    if ((kindCounts.get(item.kind) || 0) >= 2) continue
    selected.push(item)
    kindCounts.set(item.kind, (kindCounts.get(item.kind) || 0) + 1)
    if (selected.length === size) return selected
  }

  for (const item of ordered) {
    if (selected.some((selectedItem) => selectedItem.id === item.id)) continue
    selected.push(item)
    if (selected.length === size) break
  }
  return selected
}

export async function GET(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const cycle = Math.max(0, Number.parseInt(searchParams.get('cycle') || '0', 10) || 0)

    const [inquiries, bookings, invoices, vendorBills, tasks, signatures, unreadMessages, recentEmails] = await Promise.all([
      withFallbackTimeout(supabaseRest<InquiryRecord[]>('luxor_inquiries?select=id,full_name,email,event_type,status,pipeline_stage,campaign_key,created_at,updated_at&archived_at=is.null&is_test=is.false&order=created_at.desc&limit=40'), []),
      withFallbackTimeout(supabaseRest<BookingRecord[]>('luxor_bookings?select=id,client_name,event_type,event_date,status,contract_status,contract_signed_at,final_payment_due_date&order=event_date.asc&limit=30'), []),
      withFallbackTimeout(supabaseRest<InvoiceRecord[]>('luxor_invoices?select=id,booking_id,parent_invoice_id,invoice_kind,proposal_accepted_at,offer_status,client_name,total,status,due_date&status=neq.paid&order=due_date.asc&limit=30'), []),
      withFallbackTimeout(supabaseRest<VendorBillRecord[]>('luxor_bills?select=id,provider,service,amount,status,due_date,source_type,extraction_status,extraction_confidence,arithmetic_status&status=neq.paid&order=due_date.asc,created_at.desc&limit=30'), []),
      withFallbackTimeout(supabaseRest<TaskRecord[]>('luxor_tasks?select=id,title,priority,status,due_date&status=neq.completed&order=due_date.asc&limit=30'), []),
      withFallbackTimeout(supabaseRest<SignatureRequestRecord[]>('luxor_signature_requests?select=id,client_name,status,expires_at,updated_at&status=neq.signed&order=updated_at.desc&limit=20'), []),
      withFallbackTimeout(supabaseRest<MessageRecord[]>('luxor_messages?select=id,contact_name,body,created_at&direction=eq.inbound&is_read=eq.false&order=created_at.desc&limit=12'), []),
      withFallbackTimeout(supabaseRest<MailMessageRecord[]>('luxor_mail_messages?select=id,direction,from_address,to_addresses,subject,text_body,occurred_at,read_at&direction=eq.incoming&order=occurred_at.desc&limit=15'), []),
    ])

    const invoiceBookingIds = [...new Set(invoices.map((invoice) => invoice.booking_id).filter((id): id is string => Boolean(id)))]
    const receivableBookings = invoiceBookingIds.length
      ? await withFallbackTimeout(supabaseRest<Array<Pick<BookingRecord, 'id' | 'status' | 'contract_status' | 'contract_signed_at'>>>(`luxor_bookings?select=id,status,contract_status,contract_signed_at&id=in.(${invoiceBookingIds.map(encodeURIComponent).join(',')})`), [])
      : []
    const receivableBookingById = new Map(receivableBookings.map((booking) => [booking.id, booking]))

    const candidates: SmartSuggestion[] = []

    const activeLeadInquiries = inquiries.filter((inquiry) => inquiry.campaign_key !== 'grand_opening_2026_07_25')
    const leadsByEmail = new Map<string, InquiryRecord>()
    for (const inquiry of activeLeadInquiries) {
      const emailKey = (inquiry.email || '').trim().toLowerCase()
      if (emailKey && !leadsByEmail.has(emailKey)) {
        leadsByEmail.set(emailKey, inquiry)
      }
    }

    const seenEmailSenders = new Set<string>()
    for (const emailMsg of recentEmails) {
      const sender = (emailMsg.from_address || '').trim().toLowerCase()
      if (!sender || seenEmailSenders.has(sender)) continue
      const matchedLead = leadsByEmail.get(sender)
      if (!matchedLead) continue
      seenEmailSenders.add(sender)
      const name = matchedLead.full_name || sender
      const event = matchedLead.event_type ? ` (${matchedLead.event_type})` : ''
      const isUnread = !emailMsg.read_at
      candidates.push({
        id: `client-email-${emailMsg.id}`,
        kind: 'message',
        label: isUnread ? 'Unread client email' : 'Recent client email reply',
        detail: `${name}${event} emailed regarding "${emailMsg.subject || 'their event inquiry'}".`,
        prompt: `Show me what ${name} said in their latest email and help me draft the best reply.`,
        urgency: 'urgent',
      })
      if (seenEmailSenders.size >= 3) break
    }

    const distinctInquiries = activeLeadInquiries.filter((inquiry, index, all) => {
      const emailKey = (inquiry.email || '').trim().toLowerCase()
      if (emailKey) {
        return all.findIndex((candidate) => (candidate.email || '').trim().toLowerCase() === emailKey) === index
      }
      const identity = `${(inquiry.full_name || '').trim().toLowerCase()}|${(inquiry.event_type || '').trim().toLowerCase()}`
      if (identity === '|') return true
      return all.findIndex((candidate) => `${(candidate.full_name || '').trim().toLowerCase()}|${(candidate.event_type || '').trim().toLowerCase()}` === identity) === index
    })

    distinctInquiries
      .filter((inquiry) => isOpenStatus(inquiry.status))
      .slice(0, 6)
      .forEach((inquiry) => {
        const name = inquiry.full_name || 'a new inquiry'
        const event = inquiry.event_type ? ` for their ${inquiry.event_type}` : ''
        const isNew = Date.now() - new Date(inquiry.created_at).getTime() < 72 * 60 * 60 * 1000
        candidates.push({
          id: `inquiry-${inquiry.id}`,
          kind: 'lead',
          label: isNew ? 'New inquiry' : 'Lead needs movement',
          detail: `${name}${event} is ${isNew ? 'new and waiting for a first response' : 'still active in the pipeline'}.`,
          prompt: `Review ${name}'s inquiry${event} and recommend the next best follow-up to move it forward.`,
          urgency: isNew ? 'urgent' : 'attention',
        })
      })

    invoices
      .filter((invoice) => isOpenStatus(invoice.status)
        && Boolean(invoice.proposal_accepted_at)
        && (!invoice.invoice_kind || invoice.invoice_kind === 'event')
        && !invoice.parent_invoice_id
        && invoice.offer_status !== 'withdrawn'
        && isLuxorBookingReceivableEligible(receivableBookingById.get(invoice.booking_id || '')))
      .slice(0, 6)
      .forEach((invoice) => {
        const days = daysFromToday(invoice.due_date)
        const overdue = days !== null && days < 0
        const dueSoon = days !== null && days <= 7
        if (!overdue && !dueSoon) return
        const name = invoice.client_name || 'a client'
        candidates.push({
          id: `invoice-${invoice.id}`,
          kind: 'money',
          label: overdue ? 'Invoice overdue' : 'Payment due soon',
          detail: `${name}'s signed, confirmed booking has an invoice due date ${overdue ? `${Math.abs(days || 0)} day${Math.abs(days || 0) === 1 ? '' : 's'} past due` : 'within the next week'}. Verify received payments and the saved installment balance before recommending follow-up.`,
          prompt: `Review ${name}'s signed, confirmed booking, saved installment schedule, and recorded payments. State the verified remaining amount before recommending a collection follow-up.`,
          urgency: overdue ? 'urgent' : 'attention',
        })
      })

    vendorBills
      .slice(0, 8)
      .forEach((bill) => {
        const days = daysFromToday(bill.due_date)
        const review = ['needs_review', 'failed'].includes(bill.extraction_status || '') || bill.arithmetic_status === 'mismatch'
        const dueSoon = days !== null && days <= 7
        if (!review && !dueSoon) return
        const provider = bill.provider || 'A vendor'
        const reason = bill.arithmetic_status === 'mismatch'
          ? 'its extracted line items do not match the total'
          : bill.extraction_status === 'failed'
            ? 'the source attachment needs another extraction attempt'
            : review
              ? 'its extracted facts need owner review'
              : days !== null && days < 0
                ? `it is ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
                : 'it is due within the next week'
        candidates.push({
          id: `vendor-bill-${bill.id}`,
          kind: 'money',
          label: review ? 'Vendor bill needs review' : 'Vendor bill due soon',
          detail: `${formatMoney(bill.amount)} for ${provider} needs attention because ${reason}.`,
          prompt: `Review the ${formatMoney(bill.amount)} vendor bill from ${provider}. Show its source, extracted evidence, arithmetic status, due date, and safest next action.`,
          urgency: review || (days !== null && days < 0) ? 'urgent' : 'attention',
        })
      })

    signatures
      .filter((signature) => isOpenStatus(signature.status))
      .slice(0, 5)
      .forEach((signature) => {
        const days = daysFromToday(signature.expires_at?.slice(0, 10))
        const name = signature.client_name || 'a client'
        candidates.push({
          id: `signature-${signature.id}`,
          kind: 'contract',
          label: days !== null && days <= 3 ? 'Contract expiring' : 'Signature pending',
          detail: `${name}'s agreement is still awaiting signature${days !== null && days <= 3 ? ` and expires in ${Math.max(days, 0)} day${Math.max(days, 0) === 1 ? '' : 's'}` : ''}.`,
          prompt: `Review ${name}'s pending agreement and tell me what is needed to get it signed.`,
          urgency: days !== null && days <= 3 ? 'urgent' : 'attention',
        })
      })

    bookings
      .filter((booking) => {
        const days = daysFromToday(booking.event_date)
        return days !== null && days >= 0 && days <= 21
      })
      .slice(0, 5)
      .forEach((booking) => {
        const days = daysFromToday(booking.event_date) || 0
        const name = booking.client_name || 'an upcoming client'
        candidates.push({
          id: `booking-${booking.id}`,
          kind: 'event',
          label: 'Event approaching',
          detail: `${name}'s ${booking.event_type || 'event'} is in ${days} day${days === 1 ? '' : 's'}.`,
          prompt: `Build a final coordination checklist for ${name}'s ${booking.event_type || 'upcoming event'} in ${days} days.`,
          urgency: days <= 7 ? 'urgent' : 'plan',
        })
      })

    unreadMessages.slice(0, 4).forEach((message) => {
      const name = message.contact_name || 'a client'
      candidates.push({
        id: `message-${message.id}`,
        kind: 'message',
        label: 'Unread client text',
        detail: `${name} sent a message that still needs a reply.`,
        prompt: `Show ${name}'s unread text and recommend a helpful response.`,
        urgency: 'attention',
      })
    })

    tasks
      .filter((task) => isOpenStatus(task.status))
      .slice(0, 6)
      .forEach((task) => {
        const days = daysFromToday(task.due_date)
        if (days === null || days > 3) return
        const overdue = days < 0
        candidates.push({
          id: `task-${task.id}`,
          kind: 'task',
          label: overdue ? 'Task overdue' : 'Task due soon',
          detail: `${task.title || 'A task'} is ${overdue ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` : days === 0 ? 'due today' : `due in ${days} days`}.`,
          prompt: `Help me prioritize this ${task.priority || 'open'} task: ${task.title || 'untitled task'}.`,
          urgency: overdue ? 'urgent' : 'attention',
        })
      })

    const urgencyWeight = { urgent: 0, attention: 1, plan: 2 }
    const unique = Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values())
      .sort((a, b) => urgencyWeight[a.urgency] - urgencyWeight[b.urgency])

    const suggestions = chooseDiversePriorities(unique.length >= 4 ? unique : [...unique, ...DEFAULT_SUGGESTIONS], cycle)
    return NextResponse.json({ suggestions, cycle, generatedAt: new Date().toISOString() })
  } catch (error) {
    console.error('Failed to build Elena priorities:', error)
    return NextResponse.json({ suggestions: DEFAULT_SUGGESTIONS })
  }
}
