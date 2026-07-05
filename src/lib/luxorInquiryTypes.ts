export type LuxorInquiryStatus =
  | 'new'
  | 'contacted'
  | 'tour_requested'
  | 'tour_confirmed'
  | 'proposal_sent'
  | 'booked'
  | 'closed_lost'

export type LuxorInquiryInput = {
  fullName: string
  email?: string
  phone?: string
  eventType?: string
  targetDate?: string
  guestCount?: string
  preferredTourDate?: string
  preferredTourTime?: string
  packageInterest?: string
  message?: string
  source?: string
  flow?: string
  pagePath?: string
  referrer?: string
  metadata?: Record<string, unknown>
}

export type LuxorInquiry = {
  id: string
  created_at: string
  updated_at: string
  status: LuxorInquiryStatus
  source: string
  flow: string
  full_name: string
  email: string | null
  phone: string | null
  event_type: string | null
  target_date: string | null
  guest_count: number | null
  preferred_tour_date: string | null
  preferred_tour_time: string | null
  package_interest: string | null
  message: string | null
  page_path: string | null
  referrer: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
}

export function compactText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function parseGuestCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value))
  }

  if (typeof value !== 'string') return null

  const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null
}

// --- Invoice Types ---
export type LuxorInvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

export type LuxorInvoiceLineItem = {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export type LuxorInvoice = {
  id: string
  created_at: string
  updated_at: string
  inquiry_id: string | null
  client_name: string
  event_type: string | null
  description: string | null
  line_items: LuxorInvoiceLineItem[]
  subtotal: number
  tax_rate: number
  total: number
  status: LuxorInvoiceStatus
  due_date: string | null
  paid_at: string | null
  notes: string | null
}

// --- Note Types ---
export type LuxorNoteType = 'note' | 'call_log' | 'email_log' | 'status_change'

export type LuxorNote = {
  id: string
  created_at: string
  inquiry_id: string
  author: string
  content: string
  note_type: LuxorNoteType
}

// --- Task Types ---
export type LuxorTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type LuxorTaskStatus = 'pending' | 'completed' | 'cancelled'

export type LuxorTask = {
  id: string
  created_at: string
  inquiry_id: string
  title: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  priority: LuxorTaskPriority
  status: LuxorTaskStatus
}

