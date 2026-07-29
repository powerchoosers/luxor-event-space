import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
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
  event_type: string | null
  status: string | null
  pipeline_stage: string | null
  created_at: string
  updated_at: string
}

interface BookingRecord {
  id: string
  client_name: string | null
  event_type: string | null
  event_date: string | null
  contract_status: string | null
  final_payment_due_date: string | null
}

interface InvoiceRecord {
  id: string
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

function rotate<T>(items: T[], cycle: number, size = 4) {
  if (items.length <= size) return items.slice(0, size)
  const start = (cycle * size) % items.length
  return [...items.slice(start), ...items.slice(0, start)].slice(0, size)
}

export async function GET(request: Request) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const cycle = Math.max(0, Number.parseInt(searchParams.get('cycle') || '0', 10) || 0)

    const [inquiries, bookings, invoices, tasks, signatures, unreadMessages] = await Promise.all([
      supabaseRest<InquiryRecord[]>('luxor_inquiries?select=id,full_name,event_type,status,pipeline_stage,created_at,updated_at&order=created_at.desc&limit=24').catch(() => []),
      supabaseRest<BookingRecord[]>('luxor_bookings?select=id,client_name,event_type,event_date,contract_status,final_payment_due_date&order=event_date.asc&limit=30').catch(() => []),
      supabaseRest<InvoiceRecord[]>('luxor_invoices?select=id,client_name,total,status,due_date&status=neq.paid&order=due_date.asc&limit=30').catch(() => []),
      supabaseRest<TaskRecord[]>('luxor_tasks?select=id,title,priority,status,due_date&status=neq.completed&order=due_date.asc&limit=30').catch(() => []),
      supabaseRest<SignatureRequestRecord[]>('luxor_signature_requests?select=id,client_name,status,expires_at,updated_at&status=neq.signed&order=updated_at.desc&limit=20').catch(() => []),
      supabaseRest<MessageRecord[]>('luxor_messages?select=id,contact_name,body,created_at&direction=eq.inbound&is_read=eq.false&order=created_at.desc&limit=12').catch(() => []),
    ])

    const candidates: SmartSuggestion[] = []

    inquiries
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
      .filter((invoice) => isOpenStatus(invoice.status))
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
          detail: `${formatMoney(invoice.total)} from ${name} is ${overdue ? `${Math.abs(days || 0)} day${Math.abs(days || 0) === 1 ? '' : 's'} overdue` : 'due within the next week'}.`,
          prompt: `Review ${name}'s ${formatMoney(invoice.total)} invoice and tell me the best next step to collect it.`,
          urgency: overdue ? 'urgent' : 'attention',
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

    const suggestions = rotate(unique.length >= 4 ? unique : [...unique, ...DEFAULT_SUGGESTIONS], cycle)
    return NextResponse.json({ suggestions, cycle, generatedAt: new Date().toISOString() })
  } catch (error) {
    console.error('Failed to build Elena priorities:', error)
    return NextResponse.json({ suggestions: DEFAULT_SUGGESTIONS })
  }
}
