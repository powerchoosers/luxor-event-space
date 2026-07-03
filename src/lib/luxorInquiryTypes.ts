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
