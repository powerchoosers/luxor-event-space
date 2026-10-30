'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, use } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { EnrollInWorkflowModal } from '@/components/portal/EnrollInWorkflowModal'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Archive,
  Calendar,
  CheckCircle,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  User,
  Users,
  Plus,
  Send,
  Trash2,
  DollarSign,
  Briefcase,
  AlertCircle,
  FileText,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileSignature,
  NotebookPen,
  ReceiptText,
  Sparkles,
  Copy,
  Check,
  Pencil,
  MapPin,
  Star,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Workflow,
  ShieldCheck,
  Eye,
  MousePointerClick,
  RefreshCw,
  RotateCcw,
  Sliders,
  CreditCard,
  Flame,
  Baby,
  Cake,
  Heart,
  PartyPopper,
  Loader2,
  Upload,
  Languages,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  X,
} from 'lucide-react'
import { isLuxorInquiryArchived, isLuxorTestInquiry, LUXOR_INQUIRY_PACKAGE_INTEREST_OPTIONS, LUXOR_MAX_GUESTS, LuxorBooking, LuxorDocument, LuxorEmailJob, LuxorInquiry, LuxorLeadEvent, LuxorNote, LuxorTask, LuxorInvoice, LuxorInvoiceLineItem, LuxorPayment, LuxorPaymentInstallment, LuxorVendor, normalizeLuxorEventType } from '@/lib/luxorInquiryTypes'
import { LUXOR_DEFAULT_SECURITY_DEPOSIT } from '@/lib/luxorBookingMoney'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import { LUXOR_TIME_DROPDOWN_OPTIONS, normalizeLuxorTimeDropdownValue } from '@/lib/luxorTimeOptions'
import { PortalPageFrame, PortalStatusBadge, PortalSelect, PortalDatePicker, PortalModal, PortalContactAvatar, PortalCloseButton, PortalFilterBar } from '@/components/portal/PortalUI'
import { MagicCard } from '@/components/ui/magic-card'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import { useToast } from '@/components/portal/ToastProvider'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'
import { LUXOR_GRAND_OPENING } from '@/lib/luxorGrandOpening'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { formatPhoneDisplay, formatUsDialInput } from '@/lib/luxorPhoneClient'
import { normalizeLuxorEmailAddress } from '@/lib/luxorEmailBounce'
import {
  dismissLeadEmailNoticeTracker,
  ensureLeadEmailNoticeTracker,
  getLeadEmailNoticeResolution,
  isLeadEmailNoticeVisible,
  LUXOR_EMAIL_NOTICE_TTL_MS,
  LUXOR_EMAIL_SENT_EVENT,
  type LeadEmailNoticeResolution,
  type LeadEmailNoticeTracker,
  type LeadEmailSentEventDetail,
} from '@/lib/luxorLeadEmailNotice'
import { getLuxorTourSection, luxorTodayKey } from '@/lib/luxorTourMetrics'
import { createLuxorTourAttendancePayload } from '@/lib/luxorTourOutcome'
import { CorrectEmailResendDialog } from '@/components/portal/CorrectEmailResendDialog'
import type { CorrectEmailResendOption } from '@/lib/luxorLeadEmailResend'
import { WeekdayRentalSummary } from '@/components/portal/WeekdayRentalSummary'
import { LuxorTestLeadPanel } from '@/components/portal/LuxorTestLeadPanel'
import { LuxorTestLeadWorkflow } from '@/components/portal/LuxorTestLeadWorkflow'
import { LuxorEventTypeCombobox } from '@/components/LuxorEventTypeCombobox'
import { useDualPaneStickyScroll } from '@/components/portal/useDualPaneStickyScroll'

function bouncedAddressMatchesCurrentEmail(lead: LuxorInquiry) {
  const bounce = lead.metadata?.emailBounce
  const address = bounce && typeof bounce === 'object'
    ? String((bounce as Record<string, unknown>).address || '')
    : ''
  return normalizeLuxorEmailAddress(lead.email) === normalizeLuxorEmailAddress(address)
}

import type { LuxorCall } from '@/lib/luxorCallTypes'
import { LuxorTextThread } from '@/components/portal/LuxorTextThread'
import { LuxorThreadPopup } from '@/components/portal/LuxorThreadPopup'
import {
  ProposalBuilderModal,
  type ProposalBuilderContext,
  type ProposalPricingCalculation,
} from '@/components/portal/ProposalBuilderModal'
import { EventLayoutDesigner, type EventLayoutDocument } from '@/components/portal/EventLayoutDesigner'
import { LayoutReviewPanel } from '@/components/portal/LayoutReviewPanel'
import { PortalSmsConsentBadge, type SmsConsentState } from '@/components/portal/PortalSmsConsentBadge'
import { catalogItemToLineItem, LUXOR_PACKAGE_INTEREST_OPTIONS, LUXOR_SERVICE_CATALOG } from '@/lib/luxorServiceCatalog'
import { PortalPdfViewer } from '@/components/portal/PortalPdfViewer'
import { ProposalDeliveryPreview } from '@/components/portal/ProposalDeliveryPreview'
import { ProposalPaymentSchedule } from '@/components/portal/ProposalPaymentSchedule'
import { SameDayReceiptDialog, type SameDayReceiptEvidence } from '@/components/portal/SameDayReceiptDialog'
import { LeadMobileActionBar } from '@/components/portal/LeadMobileActionBar'
import { sameDayBookingPromotion } from '@/lib/luxorSameDayBooking'
import { getDuplicatedProposalSelection, getDuplicatedProposalTimingContext, isPreferredVendorEstimateLine } from '@/lib/luxorProposalDuplicateContext'
import { findProposalLeadEvent, getLeadClientProposals, getProposalCardState, getProposalWorkflowDisplayState, getSavedProposalPricingSummary } from '@/lib/luxorProposalCard'
import { getLuxorPaymentReminderDueDate } from '@/lib/luxorPaymentReminderDueDate'
import { normalizeLuxorProposalPackageTierId } from '@/lib/luxorProposalPackages'
import { buildLuxorEventPlanningTimePatch, createLuxorEventPlanningTimeBaseline, hasActiveLuxorEventBooking, hasLuxorEventPlanningTimeConflict, persistLuxorEventDetailsDraft, resolveLuxorEventPlanningTimes } from '@/lib/luxorEventPlanningTimes'
import { DEFAULT_NEW_PROPOSAL_PAYMENT_PLAN } from '@/lib/luxorPaymentSchedule'
import {
  hasCancellableTour,
  LeadLifecycleActionSheet,
  type LeadLifecycleAction,
} from '@/components/portal/LeadLifecycleActionSheet'

// Luxor operates in Texas. New proposals default to the state's maximum
// combined state/local rate; an existing saved proposal keeps its snapshot.
const DEFAULT_TEXAS_SALES_TAX_RATE_PERCENT = '8.25'

type ZohoEmailMessage = {
  id: string
  subject: string
  from: string
  to: string
  receivedAt: string | null
  summary: string
  hasAttachment: boolean
  direction?: 'incoming' | 'outgoing' | 'matched'
  deliveryStatus?: string
  folderId?: string
  threadId?: string
  attachments?: Array<{
    filename: string
    mimeType?: string
    size?: number
    messageId: string
    attachmentId?: string
    attachmentPath?: string
  }>
}

function emailReaderUrl(email: ZohoEmailMessage) {
  const folderQuery = email.folderId ? `&folderId=${encodeURIComponent(email.folderId)}` : ''
  return `/portal/emails?messageId=${encodeURIComponent(email.id)}${folderQuery}`
}

type ActivityEntry =
  | { kind: 'note'; id: string; createdAt: string; note: LuxorNote }
  | { kind: 'email'; id: string; createdAt: string; email: ZohoEmailMessage }
  | { kind: 'call'; id: string; createdAt: string; call: LuxorCall }

function tourDisplayStatus(lead: LuxorInquiry) {
  if (lead.tour_attendance_status === 'cancelled') return 'Cancelled'
  if (lead.tour_attendance_status === 'attended') return 'Completed'
  if (lead.tour_attendance_status === 'no_show') return 'No show'
  if (lead.status === 'tour_confirmed' || (lead.metadata?.autoScheduleTour === true && Boolean(lead.preferred_tour_date))) return 'Confirmed'
  if (lead.preferred_tour_date || lead.preferred_tour_time || lead.status === 'tour_requested') return 'Requested'
  return 'Not scheduled'
}

function tourHeaderStatusLabel(lead: LuxorInquiry) {
  const status = tourDisplayStatus(lead)
  return status === 'Confirmed' ? 'Tour scheduled' : `Tour ${status.toLowerCase()}`
}

function emailAttachmentUrl(email: ZohoEmailMessage, attachment: NonNullable<ZohoEmailMessage['attachments']>[number]) {
  const query = new URLSearchParams({ filename: attachment.filename })
  if (attachment.attachmentId) query.set('attachmentId', attachment.attachmentId)
  if (attachment.attachmentPath) query.set('attachmentPath', attachment.attachmentPath)
  if (email.folderId) query.set('folderId', email.folderId)
  return `/api/email/attachments/${encodeURIComponent(attachment.messageId || email.id)}?${query.toString()}`
}

function formatAttachmentSize(size?: number) {
  if (!size || size < 1) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function getRequestedTourLanguage(lead: LuxorInquiry) {
  const preference = String(lead.metadata?.tourLanguagePreference || '').trim().toLowerCase()
  if (preference === 'es' || preference === 'spanish' || preference === 'español') return 'Spanish'
  if (preference === 'en' || preference === 'english') return 'English'
  return null
}

type LeadMarketingEvent = {
  id: string
  created_at: string
  event_type: 'open' | 'click' | 'unsubscribe'
  url: string | null
  device_type: string | null
  campaign_name: string | null
  campaign_subject: string | null
}

type LeadMarketingCampaign = {
  recipient_id: string
  campaign_id: string
  campaign_name: string | null
  campaign_subject: string | null
  audience_label: string | null
  campaign_status: string
  scheduled_for: string | null
  sent_at: string | null
  recipient_status: string
  open_count: number
  click_count: number
  first_opened_at: string | null
  last_opened_at: string | null
  last_clicked_at: string | null
}

type LeadMarketingEngagement = {
  email: string
  recipient_count: number
  total_campaigns: number
  total_opens: number
  total_clicks: number
  latest_opened_at: string | null
  latest_clicked_at: string | null
  subscribed: boolean
  campaigns: LeadMarketingCampaign[]
  recent_events: LeadMarketingEvent[]
}

function asProposalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asProposalNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numberValue)) return numberValue
  }
  return undefined
}

function normalizeProposalPackageId(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '')
  if (normalized === 'custompackage' || normalized === 'rentonly' || normalized === 'rentalonly' || normalized === 'venue') return 'rent_only'
  if (normalized.startsWith('bronze') || normalized === 'essentials') return 'bronze'
  if (normalized.startsWith('silver') || normalized === 'premier') return 'silver'
  if (normalized.startsWith('gold') || normalized === 'allinclusive') return 'gold'
  return ''
}

function engineProposalPackageId(value: unknown) {
  const packageId = normalizeProposalPackageId(value)
  return packageId === 'rent_only' ? 'rental_only' : packageId
}

function proposalServiceIds(value: unknown) {
  const record = asProposalRecord(value)
  const source = record?.service_ids || record?.services || record?.add_ons || record?.addOns
  return Array.isArray(source)
    ? source.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : []
}

/**
 * Package defaults can be intentionally removed from a draft. Keep that
 * selection alongside ordinary add-ons so saving uses the same calculation the
 * owner just reviewed in Services & Items.
 */
function proposalRemovedServiceIds(value: unknown) {
  const record = asProposalRecord(value)
  const source = record?.removedServiceIds || record?.removed_service_ids
  return Array.isArray(source)
    ? source.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : []
}

function hasProposalRemovedServiceIds(value: unknown) {
  const record = asProposalRecord(value)
  return Array.isArray(record?.removedServiceIds) || Array.isArray(record?.removed_service_ids)
}

/** Empty selections are deliberate removals and must survive calculation races and save. */
function proposalDecorSelection(value: unknown) {
  const selection = asProposalRecord(value) || {}
  const hasPackage = 'decor_package_id' in selection || 'decorPackageId' in selection
  const hasQuantities = 'decor_add_on_quantities' in selection || 'decorAddOnQuantities' in selection
  const packageId = 'decor_package_id' in selection ? selection.decor_package_id : selection.decorPackageId
  const quantities = 'decor_add_on_quantities' in selection ? selection.decor_add_on_quantities : selection.decorAddOnQuantities
  return {
    ...(hasPackage ? { decorPackageId: packageId, decor_package_id: packageId } : {}),
    ...(hasQuantities ? { decorAddOnQuantities: quantities, decor_add_on_quantities: quantities } : {}),
  }
}

function getCurrentFinalProposal(invoices: LuxorInvoice[]) {
  return [...invoices]
    .filter((invoice) => (!invoice.invoice_kind || invoice.invoice_kind === 'event') && invoice.status !== 'cancelled' && invoice.offer_status !== 'withdrawn')
    .sort((a, b) => {
      const aUpdatedAt = new Date(a.updated_at || a.created_at).getTime()
      const bUpdatedAt = new Date(b.updated_at || b.created_at).getTime()
      return bUpdatedAt - aUpdatedAt
    })[0] || null
}

function getProposalDeliveryState(invoice: LuxorInvoice | null) {
  const deliverySnapshot = asProposalRecord(invoice?.proposal_context?.delivery_snapshot)
  const proposalEmail = asProposalRecord(deliverySnapshot?.proposal_email)
  return typeof proposalEmail?.delivery_state === 'string' ? proposalEmail.delivery_state : null
}

function isProposalBreakdownInvoice(invoice: LuxorInvoice | null) {
  const proposalContext = asProposalRecord(invoice?.proposal_context)
  return proposalContext?.proposal_record_type === 'proposal_breakdown'
}

function hasIndividualProposalHandoff(invoice: LuxorInvoice | null) {
  const deliverySnapshot = asProposalRecord(invoice?.proposal_context?.delivery_snapshot)
  const inPerson = asProposalRecord(deliverySnapshot?.in_person)
  return inPerson?.handoff_state === 'ready'
}

function hasPublishedFinalProposal(invoice: LuxorInvoice | null) {
  if (isProposalBreakdownInvoice(invoice)) {
    return getProposalDeliveryState(invoice) === 'delivered' || hasIndividualProposalHandoff(invoice)
  }

  return Boolean(
    invoice?.proposal_sent_at ||
    invoice?.status === 'sent' ||
    getProposalDeliveryState(invoice) === 'delivered',
  )
}

function getPublishedFinalProposalSentAt(invoice: LuxorInvoice | null) {
  if (!invoice) return null

  if (isProposalBreakdownInvoice(invoice)) {
    if (getProposalDeliveryState(invoice) === 'delivered') {
      const deliverySnapshot = asProposalRecord(invoice.proposal_context?.delivery_snapshot)
      const proposalEmail = asProposalRecord(deliverySnapshot?.proposal_email)
      return typeof proposalEmail?.delivery_sent_at === 'string'
        ? proposalEmail.delivery_sent_at
        : invoice.updated_at || invoice.proposal_sent_at || null
    }
    return hasIndividualProposalHandoff(invoice) ? invoice.proposal_sent_at || (invoice.status === 'sent' ? invoice.updated_at : null) : null
  }

  if (invoice.proposal_sent_at) return invoice.proposal_sent_at
  if (getProposalDeliveryState(invoice) === 'delivered') {
    const deliverySnapshot = asProposalRecord(invoice.proposal_context?.delivery_snapshot)
    const proposalEmail = asProposalRecord(deliverySnapshot?.proposal_email)
    return typeof proposalEmail?.delivery_sent_at === 'string' ? proposalEmail.delivery_sent_at : invoice.updated_at || null
  }
  return invoice.status === 'sent' ? invoice.updated_at : null
}

function EventTypeIcon({ eventType }: { eventType: string | null }) {
  const normalized = eventType?.trim().toLowerCase() || ''
  const Icon = normalized.includes('wedding')
    ? Heart
    : normalized.includes('quince') || normalized.includes('birthday')
      ? Cake
      : normalized.includes('baby')
        ? Baby
        : normalized.includes('corporate')
          ? Briefcase
          : normalized.includes('anniversary')
            ? Sparkles
            : PartyPopper

  return <Icon size={12} strokeWidth={1.8} aria-hidden="true" />
}

type EditableLeadField =
  | 'full_name'
  | 'event_type'
  | 'guest_count'
  | 'budget'
  | 'target_date'
  | 'package_interest'
  | 'preferred_tour_date'
  | 'preferred_tour_time'
  | 'email'
  | 'phone'
  | 'address'

type EventDetailsField = EditableLeadField | 'venue_access_time' | 'event_time'

type LeadDetailInputType = 'text' | 'number' | 'date' | 'time' | 'email' | 'tel' | 'select' | 'event-type'
type LeadDetailTab = 'overview' | 'activity' | 'proposals' | 'contract' | 'payments' | 'planning' | 'messages' | 'tasks' | 'vendors' | 'timeline' | 'documents' | 'notes'

const ACTIVITY_BATCH_SIZE = 18
const EVENT_TIME_OPTIONS = LUXOR_TIME_DROPDOWN_OPTIONS
const DEFAULT_OFFER_EXPIRY_TIME = '23:30'

function normalizeOfferExpiryTime(value: string | null | undefined) {
  const normalized = normalizeLuxorTimeDropdownValue(value)
  return EVENT_TIME_OPTIONS.some((option) => option.value === normalized) ? normalized : DEFAULT_OFFER_EXPIRY_TIME
}

const PLANNING_COLOR_OPTIONS = [
  { id: 'black-gold', label: 'Black & gold', colors: ['#111111', '#caa24c', '#f1d27a', '#f7f3eb'] },
  { id: 'ivory-sage', label: 'Ivory & sage', colors: ['#f5f0e8', '#b9c7ad', '#6f8068', '#343b32'] },
  { id: 'terracotta', label: 'Terracotta', colors: ['#f3e2d2', '#d8895b', '#a94e39', '#51362d'] },
  { id: 'blush', label: 'Blush & champagne', colors: ['#f5e4e3', '#d9a6a5', '#caa24c', '#6a4b4d'] },
  { id: 'navy', label: 'Navy & ivory', colors: ['#18243d', '#304a73', '#d8c39a', '#f7f3eb'] },
] as const

const PLANNING_LAYOUT_OPTIONS = [
  { id: 'classic-banquet', label: 'Classic banquet', detail: 'Guest tables facing a centered head table', kind: 'banquet' },
  { id: 'dance-floor-center', label: 'Dance floor center', detail: 'Open dance floor at the heart of the room', kind: 'dance' },
  { id: 'ceremony-to-reception', label: 'Ceremony to reception', detail: 'Clear aisle with a reception reset', kind: 'ceremony' },
  { id: 'cocktail-lounge', label: 'Cocktail lounge', detail: 'Flexible clusters for mingling and conversation', kind: 'lounge' },
] as const

type PlanningEditSection = 'event' | 'preferences' | 'layout' | 'decor' | null
type ProposalHistoryPayload = {
  enabled: boolean
  activities: Array<{ id: number; invoice_id?: string; event_type: string; actor_email?: string | null; recipient_email?: string | null; occurred_at: string; details?: Record<string, unknown> }>
  sendAttempts: Array<{ id: string; channel: string; state: string; recipient_email?: string | null; provider?: string | null; started_at: string; sent_at?: string | null; delivery_confirmed_at?: string | null; failed_at?: string | null; failure_reason?: string | null }>
  hasMoreActivities?: boolean
  hasMoreSendAttempts?: boolean
}

function formatProposalLineBasis(item: LuxorInvoiceLineItem) {
  const basis = item.quoteBreakdown
  if (!basis) return `${item.quantity} × ${formatMoney(item.unitPrice)}`
  const details = [`${basis.quantity} × ${formatMoney(basis.unit_price)}`]
  if (basis.per_guest_rate !== undefined) details.push(`${formatMoney(basis.per_guest_rate)} per guest`)
  if (basis.included_hours !== undefined) details.push(`${basis.included_hours} included hours`)
  if (basis.additional_hours !== undefined) details.push(`${basis.additional_hours} additional hours`)
  if (basis.additional_hour_rate !== undefined) details.push(`${formatMoney(basis.additional_hour_rate)} per additional hour`)
  if (basis.minimum_price !== undefined) details.push(`${formatMoney(basis.minimum_price)} minimum price`)
  if (basis.minimum !== undefined) details.push(`${formatMoney(basis.minimum)} minimum${basis.applied_minimum ? ' applied' : ''}`)
  return details.join(' · ')
}

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const requestedTestRunId = searchParams?.get('testRunId') || null
  const router = useRouter()
  const pathname = usePathname()
  const { notify } = useToast()

  const [lead, setLead] = useState<LuxorInquiry | null>(null)
  const [expandedOriginalInquiryId, setExpandedOriginalInquiryId] = useState<string | null>(null)
  const [activeTestRunId, setActiveTestRunId] = useState<string | null>(null)
  const [testProposalReadOnly, setTestProposalReadOnly] = useState(false)
  const [loadingTestRun, setLoadingTestRun] = useState(false)
  const activeTestRunRequestRef = useRef<string | null>(null)
  const [notes, setNotes] = useState<LuxorNote[]>([])
  const [callRecords, setCallRecords] = useState<LuxorCall[]>([])
  const [editingCallSummaryId, setEditingCallSummaryId] = useState<string | null>(null)
  const [callSummaryDraft, setCallSummaryDraft] = useState('')
  const [savingCallSummaryId, setSavingCallSummaryId] = useState<string | null>(null)
  const [callViewModes, setCallViewModes] = useState<Record<string, 'transcript' | 'summary'>>({})
  const [generatingCallSummaryId, setGeneratingCallSummaryId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<LuxorTask[]>([])
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([])
  const [proposalHistory, setProposalHistory] = useState<Record<string, ProposalHistoryPayload>>({})
  const [proposalHistoryLoadingId, setProposalHistoryLoadingId] = useState<string | null>(null)
  const [bookings, setBookings] = useState<LuxorBooking[]>([])
  const bookingsRef = useRef(bookings)
  bookingsRef.current = bookings
  const [documents, setDocuments] = useState<LuxorDocument[]>([])
  const [signatureRequests, setSignatureRequests] = useState<Array<{ id: string; booking_id: string; inquiry_id: string | null; client_name: string; status: string; created_at: string; signed_at: string | null }>>([])
  const [leadEvents, setLeadEvents] = useState<LuxorLeadEvent[]>([])
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const selectedLeadEventIdRef = useRef<string | null>(null)
  const initializedEventPreferenceRef = useRef(false)
  const [payments, setPayments] = useState<LuxorPayment[]>([])
  const [paymentLoadError, setPaymentLoadError] = useState<string | null>(null)
  const [paymentInstallments, setPaymentInstallments] = useState<LuxorPaymentInstallment[]>([])
  const [paymentInstallmentRefresh, setPaymentInstallmentRefresh] = useState(0)
  const [tourEmailJobs, setTourEmailJobs] = useState<LuxorEmailJob[]>([])
  const [correctEmailResendOptions, setCorrectEmailResendOptions] = useState<CorrectEmailResendOption[]>([])
  const [correctEmailResendSuggestedId, setCorrectEmailResendSuggestedId] = useState<string | null>(null)
  const [correctEmailResendOpen, setCorrectEmailResendOpen] = useState(false)
  const [emailResendCandidate, setEmailResendCandidate] = useState<LuxorEmailJob | null>(null)
  const emailChangeRequestRef = useRef<{ previous: string; next: string; requestId: string } | null>(null)
  const [emailMessages, setEmailMessages] = useState<ZohoEmailMessage[]>([])
  const [emailHistoryRecipient, setEmailHistoryRecipient] = useState('')
  const emailHistoryRequestedRecipientRef = useRef('')
  const emailThreadRequestRef = useRef(0)
  const [loadingEmailMessages, setLoadingEmailMessages] = useState(false)
  const [emailNoticeTracker, setEmailNoticeTracker] = useState<LeadEmailNoticeTracker | null>(null)
  const [emailThreadError, setEmailThreadError] = useState<string | null>(null)
  const [zohoReconnectRequired, setZohoReconnectRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const emailNoticeResolution = useMemo<LeadEmailNoticeResolution | null>(() => {
    if (!lead) return null
    const currentEmail = normalizeLuxorEmailAddress(lead.email)
    const historyMatchesLead = normalizeLuxorEmailAddress(emailHistoryRecipient) === currentEmail
    return getLeadEmailNoticeResolution({
      leadId: lead.id,
      currentEmail: lead.email,
      bounce: lead.metadata?.emailBounce as Record<string, unknown> | null | undefined,
      messages: historyMatchesLead ? emailMessages : [],
    })
  }, [emailHistoryRecipient, emailMessages, lead?.email, lead?.id, lead?.metadata?.emailBounce])

  const resolvedNoticeKey = emailNoticeResolution?.kind === 'resolved'
    ? `${emailNoticeResolution.leadId}:${emailNoticeResolution.recipient}:${emailNoticeResolution.bounceEventKey}:${emailNoticeResolution.successEventId}`
    : ''
  const resolutionSuperseded = emailNoticeResolution?.kind === 'resolved'
    ? emailNoticeResolution.supersededByLaterEmail
    : false
  const showResolvedEmailNotice = isLeadEmailNoticeVisible(emailNoticeResolution, emailNoticeTracker)

  // Note drafting state
  const [noteContent, setNoteContent] = useState('')
  const [noteType, setNoteType] = useState<'note' | 'call_log' | 'email_log'>('note')
  const [submittingNote, setSubmittingNote] = useState(false)

  // Task adding state
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [submittingTask, setSubmittingTask] = useState(false)

  // Invoice creation state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const testProposalOpenRequestRef = useRef<string | null>(null)
  const testProposalLoadBusyRef = useRef(false)
  const [testProposalRevision, setTestProposalRevision] = useState(0)
  const proposalEditorOpenRef = useRef(false)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [invoiceDesc, setInvoiceDesc] = useState('')
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [invoiceItems, setInvoiceItems] = useState<LuxorInvoiceLineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, total: 0 },
  ])
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [invoiceTaxRate, setInvoiceTaxRate] = useState(DEFAULT_TEXAS_SALES_TAX_RATE_PERCENT)
  const [invoiceDiscountPercent, setInvoiceDiscountPercent] = useState('0')
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<'percent' | 'fixed'>('percent')
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState('0')
  const [invoiceOfferExpiryTime, setInvoiceOfferExpiryTime] = useState(DEFAULT_OFFER_EXPIRY_TIME)
  const [proposalContext, setProposalContext] = useState<ProposalBuilderContext | null>(null)
  const [proposalLeadEventId, setProposalLeadEventId] = useState<string | null>(null)
  const [selectedProposalPackageId, setSelectedProposalPackageId] = useState<string | null>(null)
  const [selectedProposalPromotionId, setSelectedProposalPromotionId] = useState<string | null>(null)
  const [legacyProposalDiscount, setLegacyProposalDiscount] = useState<{ type: 'percent' | 'fixed'; value: number } | null>(null)
  const [proposalGuestCount, setProposalGuestCount] = useState('')
  const [proposalCalculation, setProposalCalculation] = useState<ProposalPricingCalculation | null>(null)
  const [selectedCatalogItem, setSelectedCatalogItem] = useState('')
  const [submittingInvoice, setSubmittingInvoice] = useState(false)
  const invoiceSubmitBusy = useRef(false)
  const invoiceCreationRequest = useRef<string | null>(null)
  const breakdownCreationRequest = useRef<string | null>(null)
  const savedPublicationInvoice = useRef<LuxorInvoice | null>(null)
  const [invoiceSubmissionError, setInvoiceSubmissionError] = useState<string | null>(null)
  const [publicationPending, setPublicationPending] = useState(false)
  const [breakdownPublished, setBreakdownPublished] = useState(false)
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null)
  const [paymentRequestInvoice, setPaymentRequestInvoice] = useState<LuxorInvoice | null>(null)
  const [pdfPreviewInvoice, setPdfPreviewInvoice] = useState<LuxorInvoice | null>(null)
  const [documentPreview, setDocumentPreview] = useState<{ title: string; url: string } | null>(null)
  const [emailPreview, setEmailPreview] = useState<{ subject: string; html: string } | null>(null)
  const [proposalDeliveryPreview, setProposalDeliveryPreview] = useState<{ invoice: LuxorInvoice; initialTab: 'email' | 'pdf' } | null>(null)
  const [invoiceToDelete, setInvoiceToDelete] = useState<LuxorInvoice | null>(null)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)
  const [paymentRequestKind, setPaymentRequestKind] = useState<'deposit' | 'balance' | 'custom'>('deposit')
  const [customPaymentAmount, setCustomPaymentAmount] = useState('')
  const [inPersonCloseInvoice, setInPersonCloseInvoice] = useState<LuxorInvoice | null>(null)
  const [inPersonHandoffUrl, setInPersonHandoffUrl] = useState<string | null>(null)
  const [inPersonCloseBusy, setInPersonCloseBusy] = useState(false)
  const [manualSignedAgreementFile, setManualSignedAgreementFile] = useState<File | null>(null)
  const [sameDayReceipt, setSameDayReceipt] = useState<{ booking: LuxorBooking; method?: 'cash' | 'zelle' | 'check' } | null>(null)
  const [paperSignedAt, setPaperSignedAt] = useState('')
  const [paperSignatureEvidence, setPaperSignatureEvidence] = useState('')
  const [paperSignatureConfirmed, setPaperSignatureConfirmed] = useState(false)

  useEffect(() => {
    proposalEditorOpenRef.current = isInvoiceModalOpen
  }, [isInvoiceModalOpen])

  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [refundingDeposit, setRefundingDeposit] = useState(false)
  const [confirmRefundModalOpen, setConfirmRefundModalOpen] = useState(false)

  // Tour scheduling + Zoho invite state
  const [isTourScheduleModalOpen, setIsTourScheduleModalOpen] = useState(false)
  const [tourVisitIntent, setTourVisitIntent] = useState<'new_visit' | 'reschedule'>('new_visit')
  const tourScheduleAttempt = useRef<{ signature: string; id: string } | null>(null)
  const [tourVisitId, setTourVisitId] = useState('')
  const [tourExpectedVisitId, setTourExpectedVisitId] = useState<string | null>(null)
  const [tourExpectedVisitVersion, setTourExpectedVisitVersion] = useState(0)
  const [tourScheduleDate, setTourScheduleDate] = useState('')
  const [tourScheduleTime, setTourScheduleTime] = useState('')
  const [tourScheduleDuration, setTourScheduleDuration] = useState('30')
  const [tourMeetingType, setTourMeetingType] = useState('Private Venue Tour')
  const [tourClientFacingNotes, setTourClientFacingNotes] = useState('')
  const [schedulingTour, setSchedulingTour] = useState(false)

  // Status editing state
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [sendingContractBookingId, setSendingContractBookingId] = useState<string | null>(null)
  const [preparingAgreementInvoiceId, setPreparingAgreementInvoiceId] = useState<string | null>(null)
  const [contractActionKey, setContractActionKey] = useState<string | null>(null)
  const [contractToCancel, setContractToCancel] = useState<LuxorBooking | null>(null)
  const contractStatusSnapshotRef = useRef<Record<string, string | null>>({})
  const [pendingLifecycleStatus, setPendingLifecycleStatus] = useState<LuxorInquiry['status'] | null>(null)

  // Timeline tab filtering
  const [activeLeadTab, setActiveLeadTab] = useState<LeadDetailTab>('overview')
  const [proposalCardMenuId, setProposalCardMenuId] = useState<string | null>(null)
  const proposalCardMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const proposalCardMenuRef = useRef<HTMLDivElement | null>(null)
  const [selectedStageOverride, setSelectedStageOverride] = useState<string | null>(null)
  const [planningSubTab, setPlanningSubTab] = useState<'details' | 'vendors' | 'fb' | 'decor' | 'timeline' | 'files'>('details')
  const [planningEditSection, setPlanningEditSection] = useState<PlanningEditSection>(null)
  const [savingPlanningSection, setSavingPlanningSection] = useState(false)
  const [planningDraft, setPlanningDraft] = useState<Record<string, string>>({})
  const [planningColors, setPlanningColors] = useState<string[]>([])
  const [layoutDesignerOpen, setLayoutDesignerOpen] = useState(false)
  const [layoutReviewRefreshKey, setLayoutReviewRefreshKey] = useState(0)
  const [activeFeedTab, setActiveFeedTab] = useState<'all' | 'notes' | 'comms' | 'system'>('all')
  const [activitySearch, setActivitySearch] = useState('')
  const [activityWindow, setActivityWindow] = useState<'all' | '30d' | '90d' | 'year'>('all')
  const [visibleActivityCount, setVisibleActivityCount] = useState(ACTIVITY_BATCH_SIZE)
  const [showInternalSignals, setShowInternalSignals] = useState(false)
  const [showTaskTools, setShowTaskTools] = useState(false)
  const [textPopupOpen, setTextPopupOpen] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showEnrollWorkflowModal, setShowEnrollWorkflowModal] = useState(false)
  const [showLeadTabOverflow, setShowLeadTabOverflow] = useState(false)
  const [leadLifecycleAction, setLeadLifecycleAction] = useState<LeadLifecycleAction | null>(null)
  const [showEventPicker, setShowEventPicker] = useState(false)
  const eventPickerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const eventPickerMenuRef = useRef<HTMLDivElement | null>(null)
  const actionsMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  const [eventPickerPosition, setEventPickerPosition] = useState({ top: 0, left: 8, maxHeight: 360 })
  const [smsConsent, setSmsConsent] = useState<SmsConsentState | null>(null)
  const [consentRequestSending, setConsentRequestSending] = useState(false)
  const [manualOptInLoading, setManualOptInLoading] = useState(false)
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false)
  const [newEventType, setNewEventType] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventGuestCount, setNewEventGuestCount] = useState('')
  const [newEventPackage, setNewEventPackage] = useState('')
  const [newEventNotes, setNewEventNotes] = useState('')
  const [submittingEvent, setSubmittingEvent] = useState(false)
  const [savingLeadField, setSavingLeadField] = useState<EditableLeadField | null>(null)
  const [eventDetailsEditing, setEventDetailsEditing] = useState(false)
  const [eventDetailsDraft, setEventDetailsDraft] = useState<Partial<Record<EventDetailsField, string>>>({})
  const [eventDetailsDraftEventId, setEventDetailsDraftEventId] = useState<string | null>(null)
  const eventDetailsEditSessionRef = useRef(0)
  const proposalTimingBaselineRef = useRef<{ eventId: string; venueAccessTime: string; eventTime: string } | null>(null)
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 })

  // Vendors Tab States & Actions
  const [allVendors, setAllVendors] = useState<LuxorVendor[]>([])
  const [loadingVendors, setLoadingVendors] = useState(false)
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false)

  // Timeline Tab States & Actions
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false)
  const [timelineEditIndex, setTimelineEditIndex] = useState<number | null>(null)
  const [timelineTime, setTimelineTime] = useState('')
  const [timelineTitle, setTimelineTitle] = useState('')
  const [timelineDescription, setTimelineDescription] = useState('')

  const fetchVendors = async () => {
    try {
      setLoadingVendors(true)
      const res = await fetch('/api/vendors')
      if (res.ok) {
        const data = await res.json()
        setAllVendors(data)
      }
    } catch (err) {
      console.error('Failed to load vendors', err)
    } finally {
      setLoadingVendors(false)
    }
  }

  useEffect(() => {
    if (activeLeadTab === 'vendors') {
      fetchVendors()
    }
  }, [activeLeadTab])

  useEffect(() => {
    if (!proposalCardMenuId) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (proposalCardMenuRef.current?.contains(target) || proposalCardMenuTriggerRef.current?.contains(target)) return
      setProposalCardMenuId(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setProposalCardMenuId(null)
      proposalCardMenuTriggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [proposalCardMenuId])

  useEffect(() => {
    if (proposalCardMenuId) {
      proposalCardMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    }
  }, [proposalCardMenuId])

  useEffect(() => {
    if (activeLeadTab !== 'proposals' || process.env.NEXT_PUBLIC_LUXOR_PROPOSAL_HISTORY_READY !== 'true') return
    let cancelled = false
    const proposals = invoices.filter((invoice) => !invoice.invoice_kind || invoice.invoice_kind === 'event')
    void Promise.all(proposals.map(async (proposal) => {
      try {
        const response = await fetch(`/api/invoices/${encodeURIComponent(proposal.id)}/history`, { cache: 'no-store' })
        if (response.ok) return [proposal.id, await response.json() as ProposalHistoryPayload] as const
      } catch (historyError) {
        console.error('Proposal history could not be loaded:', historyError)
      }
      return [proposal.id, { enabled: false, activities: [], sendAttempts: [] }] as const
    })).then((items) => {
      if (!cancelled) setProposalHistory(Object.fromEntries(items))
    })
    return () => { cancelled = true }
  }, [activeLeadTab, id, invoices])

  const loadOlderProposalHistory = async (invoiceId: string) => {
    const current = proposalHistory[invoiceId]
    if (!current?.enabled || proposalHistoryLoadingId) return
    setProposalHistoryLoadingId(invoiceId)
    try {
      const query = new URLSearchParams({ activityOffset: String(current.activities.length), attemptOffset: String(current.sendAttempts.length) })
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/history?${query}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Proposal history could not be loaded.')
      const page = await response.json() as ProposalHistoryPayload
      setProposalHistory((previous) => ({
        ...previous,
        [invoiceId]: {
          ...previous[invoiceId],
          activities: Array.from(new Map([...previous[invoiceId].activities, ...page.activities].map((item) => [item.id, item])).values()),
          sendAttempts: Array.from(new Map([...previous[invoiceId].sendAttempts, ...page.sendAttempts].map((item) => [item.id, item])).values()),
          hasMoreActivities: page.hasMoreActivities,
          hasMoreSendAttempts: page.hasMoreSendAttempts,
        },
      }))
    } catch (historyError) {
      console.error('Older proposal history could not be loaded:', historyError)
    } finally {
      setProposalHistoryLoadingId(null)
    }
  }

  const handleMetadataUpdate = async (updatedMetadata: Record<string, unknown>) => {
    if (!lead) return false
    const previousLead = lead
    try {
      const mergedMetadata = { ...lead.metadata, ...updatedMetadata }
      setLead((current) => current ? { ...current, metadata: mergedMetadata, updated_at: new Date().toISOString() } : current)
      
      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, metadata: mergedMetadata }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update metadata.')
      }

      const updated = payload as LuxorInquiry
      setLead(updated)
      return true
    } catch (err) {
      console.error(err)
      setLead(previousLead)
      notify({ title: 'Update failed', description: err instanceof Error ? err.message : 'Failed to update metadata.', variant: 'error' })
      return false
    }
  }

  const toggleVendorSelection = async (vendorId: string) => {
    if (!lead) return
    const currentLinked = ((selectedLeadEvent?.metadata?.vendors as Array<{ id: string; notes: string }> | undefined) || [])
    const exists = currentLinked.some((v) => v.id === vendorId)
    let nextLinked
    if (exists) {
      nextLinked = currentLinked.filter((v) => v.id !== vendorId)
    } else {
      nextLinked = [...currentLinked, { id: vendorId, notes: '' }]
    }
    await (selectedLeadEvent ? handleEventMetadataUpdate({ vendors: nextLinked }) : handleMetadataUpdate({ vendors: nextLinked }))
  }

  const updateVendorNotes = async (vendorId: string, notes: string) => {
    if (!lead) return
    const currentLinked = ((selectedLeadEvent?.metadata?.vendors as Array<{ id: string; notes: string }> | undefined) || [])
    const nextLinked = currentLinked.map((v) => (v.id === vendorId ? { ...v, notes } : v))
    await (selectedLeadEvent ? handleEventMetadataUpdate({ vendors: nextLinked }) : handleMetadataUpdate({ vendors: nextLinked }))
  }

  const parseTimeToMinutes = (timeStr: string) => {
    const match = timeStr.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i)
    if (!match) return 0
    let hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const ampm = match[3].toUpperCase()
    if (ampm === 'PM' && hours < 12) hours += 12
    if (ampm === 'AM' && hours === 12) hours = 0
    return hours * 60 + minutes
  }

  const openTimelineModal = (editIndex: number | null) => {
    setTimelineEditIndex(editIndex)
    if (editIndex !== null && lead?.metadata?.timeline) {
      const items = ((selectedLeadEvent?.metadata?.timeline || lead.metadata.timeline) as Array<{ time: string; title: string; description?: string }>)
      const item = items[editIndex]
      setTimelineTime(item.time)
      setTimelineTitle(item.title)
      setTimelineDescription(item.description || '')
    } else {
      setTimelineTime('')
      setTimelineTitle('')
      setTimelineDescription('')
    }
    setIsTimelineModalOpen(true)
  }

  const saveTimelineItem = async (item: { time: string; title: string; description?: string }, editIndex: number | null) => {
    if (!lead) return false
    const currentTimeline = ((selectedLeadEvent?.metadata?.timeline || lead.metadata?.timeline) as Array<{ time: string; title: string; description?: string }>) || []
    let nextTimeline
    if (editIndex !== null) {
      nextTimeline = currentTimeline.map((itemVal, idx) => idx === editIndex ? item : itemVal)
    } else {
      nextTimeline = [...currentTimeline, item]
    }
    return await (selectedLeadEvent ? handleEventMetadataUpdate({ timeline: nextTimeline }) : handleMetadataUpdate({ timeline: nextTimeline }))
  }

  const deleteTimelineItem = async (indexToDelete: number) => {
    if (!lead) return
    const currentTimeline = ((selectedLeadEvent?.metadata?.timeline || lead.metadata?.timeline) as Array<{ time: string; title: string; description?: string }>) || []
    const nextTimeline = currentTimeline.filter((_, idx) => idx !== indexToDelete)
    await (selectedLeadEvent ? handleEventMetadataUpdate({ timeline: nextTimeline }) : handleMetadataUpdate({ timeline: nextTimeline }))
  }

  const handleTimelineSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!timelineTime.trim() || !timelineTitle.trim()) return

    let formattedTime = timelineTime.trim().toUpperCase()
    if (/^\d+\s*(AM|PM)$/.test(formattedTime)) {
      const match = formattedTime.match(/^(\d+)\s*(AM|PM)$/)
      if (match) formattedTime = `${match[1]}:00 ${match[2]}`
    }
    if (/^\d+:\d+$/.test(formattedTime)) {
      formattedTime = `${formattedTime} PM`
    }

    const item = {
      time: formattedTime,
      title: timelineTitle.trim(),
      description: timelineDescription.trim() || undefined,
    }

    const success = await saveTimelineItem(item, timelineEditIndex)
    if (success) {
      setIsTimelineModalOpen(false)
    }
  }

  // Marketing subscription states
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [togglingMarketing, setTogglingMarketing] = useState(false)
  const [marketingMessage, setMarketingMessage] = useState<'added' | 'removed' | null>(null)
  const [brochureClick, setBrochureClick] = useState<{ click_count: number; latest_clicked_at: string | null } | 'unavailable' | null>(null)
  const [marketingEngagement, setMarketingEngagement] = useState<LeadMarketingEngagement | null>(null)
  const [loadingMarketingEngagement, setLoadingMarketingEngagement] = useState(false)
  const [marketingEngagementError, setMarketingEngagementError] = useState<string | null>(null)

  // Event Summary states
  const [summaryStartTime, setSummaryStartTime] = useState('')
  const [summaryEndTime, setSummaryEndTime] = useState('')
  const [mobileSectionDrawerOpen, setMobileSectionDrawerOpen] = useState(false)
  const sectionMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const sectionMenuPanelRef = useRef<HTMLDivElement>(null)
  const sectionMenuId = React.useId()
  const [showClientSidebar, setShowClientSidebar] = useState(true)

  const {
    containerRef: dualPaneContainerRef,
    leftPaneRef: dualPaneLeftRef,
    rightPaneRef: dualPaneRightRef,
  } = useDualPaneStickyScroll({
    enabled: showClientSidebar,
    topOffset: 80,
    bottomOffset: 24,
  })

  useEffect(() => {
    if (!mobileSectionDrawerOpen) return
    const panel = sectionMenuPanelRef.current
    const buttons = () => Array.from(panel?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
    const frame = window.requestAnimationFrame(() => {
      (panel?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') || buttons()[0])?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMobileSectionDrawerOpen(false)
      } else if (event.key === 'Tab') {
        const controls = buttons()
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    const desktop = window.matchMedia('(min-width: 1280px)')
    const closeOnDesktop = () => { if (desktop.matches) setMobileSectionDrawerOpen(false) }
    document.addEventListener('keydown', handleKeyDown, true)
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown, true)
      desktop.removeEventListener('change', closeOnDesktop)
      sectionMenuTriggerRef.current?.focus()
    }
  }, [mobileSectionDrawerOpen])

  // Tour Attendance states
  const [isEditingTourAttendance, setIsEditingTourAttendance] = useState(false)
  const [tourGuests, setTourGuests] = useState('')
  const [tourNotes, setTourNotes] = useState('')
  const [tourBudget, setTourBudget] = useState('')
  const [cateringPreferences, setCateringPreferences] = useState('')
  const [tourAssignees, setTourAssignees] = useState<string[]>([])
  const [tourAssigneeCustom, setTourAssigneeCustom] = useState('')
  const [savingTourAttendance, setSavingTourAttendance] = useState(false)

  const selectedLeadEvent = useMemo(
    () => leadEvents.find((event) => event.id === activeEventId) || leadEvents.find((event) => event.is_primary) || leadEvents[0] || null,
    [activeEventId, leadEvents],
  )
  selectedLeadEventIdRef.current = selectedLeadEvent?.id || null
  useEffect(() => {
    if (eventDetailsEditing && eventDetailsDraftEventId && eventDetailsDraftEventId !== selectedLeadEvent?.id) {
      eventDetailsEditSessionRef.current += 1
      setEventDetailsDraft({})
      setEventDetailsDraftEventId(null)
      setEventDetailsEditing(false)
    }
  }, [eventDetailsDraftEventId, eventDetailsEditing, selectedLeadEvent?.id])
  const currentEventType = selectedLeadEvent ? selectedLeadEvent.event_type : lead?.event_type ?? null
  const currentEventDate = selectedLeadEvent ? selectedLeadEvent.target_date : lead?.target_date ?? null
  const currentEventGuestCount = selectedLeadEvent ? selectedLeadEvent.guest_count : lead?.guest_count ?? null
  const currentEventPackageInterest = selectedLeadEvent ? selectedLeadEvent.package_interest : lead?.package_interest ?? null
  const isolatedTestLead = isLuxorTestInquiry(lead)
  const eventBookings = useMemo(
    () => isolatedTestLead ? [] : selectedLeadEvent ? bookings.filter((booking) => booking.lead_event_id === selectedLeadEvent.id) : bookings,
    [bookings, isolatedTestLead, selectedLeadEvent],
  )
  const eventBookingIds = useMemo(() => new Set(eventBookings.map((booking) => booking.id)), [eventBookings])
  const eventInvoices = useMemo(
    () => isolatedTestLead ? [] : selectedLeadEvent
      ? invoices.filter((invoice) => invoice.lead_event_id === selectedLeadEvent.id || (!invoice.lead_event_id && Boolean(invoice.booking_id && eventBookingIds.has(invoice.booking_id))))
      : invoices,
    [eventBookingIds, invoices, isolatedTestLead, selectedLeadEvent],
  )
  const eventInvoiceIds = useMemo(() => new Set(eventInvoices.map((invoice) => invoice.id)), [eventInvoices])
  const clientProposals = useMemo(() => isolatedTestLead ? [] : getLeadClientProposals(invoices), [invoices, isolatedTestLead])
  const eventPayments = useMemo(
    () => isolatedTestLead ? [] : selectedLeadEvent
      ? payments.filter((payment) => Boolean((payment.booking_id && eventBookingIds.has(payment.booking_id)) || (payment.invoice_id && eventInvoiceIds.has(payment.invoice_id))))
      : payments,
    [eventBookingIds, eventInvoiceIds, payments, isolatedTestLead, selectedLeadEvent],
  )
  const latestBooking = useMemo(() => getMostRecentBooking(eventBookings), [eventBookings])
  // Always anchor proposal/contract UI to the newest saved event proposal in
  // the active lead workflow. A lead can have an older completed booking, and
  // that record must never make a newer proposal look signed or delivered.
  const currentProposalInvoice = useMemo(
    // An accepted proposal can temporarily have no booking or event link
    // while the acceptance workflow finishes. Include all lead invoices so
    // that transient state cannot fall back to an unrelated legacy booking.
    () => isolatedTestLead ? null : getCurrentFinalProposal(invoices),
    [invoices, isolatedTestLead],
  )
  const currentProposalBooking = useMemo(
    () => currentProposalInvoice
      ? bookings.find((booking) => booking.invoice_id === currentProposalInvoice.id) || null
      : null,
    [bookings, currentProposalInvoice],
  )
  const proposalInvoice = currentProposalInvoice
  const proposalBooking = currentProposalBooking
  const currentProposalAcceptanceActivity = Boolean(currentProposalInvoice && proposalHistory[currentProposalInvoice.id]?.activities.some(
    (activity) => activity.invoice_id === currentProposalInvoice.id && activity.event_type === 'accepted',
  ))
  const currentProposalEvent = currentProposalInvoice ? findProposalLeadEvent(currentProposalInvoice, leadEvents, bookings) : null
  const proposalWorkflowDisplay = getProposalWorkflowDisplayState({
    currentStatus: lead?.status === 'closed_lost' ? 'closed_lost' : currentProposalEvent?.status || lead?.status || 'new',
    currentPipelineStage: lead?.pipeline_stage === 'closed_lost' ? 'closed_lost' : currentProposalEvent?.pipeline_stage || lead?.pipeline_stage || 'inquiry',
    proposalAcceptedAt: currentProposalInvoice?.proposal_accepted_at,
    proposalAcceptanceActivity: currentProposalAcceptanceActivity,
    proposalInvoiceId: currentProposalInvoice?.id,
    bookingInvoiceId: currentProposalBooking?.invoice_id,
    contractStatus: currentProposalBooking?.contract_status,
    contractSignedAt: currentProposalBooking?.contract_signed_at,
  })
  useEffect(() => {
    let cancelled = false
    const bookingId = currentProposalBooking?.id
    if (!bookingId) {
      setPaymentInstallments([])
      return () => { cancelled = true }
    }
    void fetch(`/api/portal/payment-installments?bookingId=${encodeURIComponent(bookingId)}`)
      .then((response) => response.ok ? response.json() as Promise<LuxorPaymentInstallment[]> : [])
      .then((rows) => { if (!cancelled) setPaymentInstallments(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) setPaymentInstallments([]) })
    return () => { cancelled = true }
  }, [currentProposalBooking?.id, paymentInstallmentRefresh])
  const lifecycleBooking = currentProposalInvoice ? currentProposalBooking : latestBooking
  const activeEventForDisplay = useMemo(() => {
    if (!lead) return null
    if (!selectedLeadEvent) return null
    const proposalEvent = currentProposalInvoice ? findProposalLeadEvent(currentProposalInvoice, leadEvents, bookings) : null
    const proposalAppliesToEvent = proposalEvent?.id === selectedLeadEvent.id
    const proposalWorkflow = getProposalWorkflowDisplayState({
      currentStatus: selectedLeadEvent.status,
      currentPipelineStage: selectedLeadEvent.pipeline_stage,
      proposalAcceptedAt: proposalAppliesToEvent ? currentProposalInvoice?.proposal_accepted_at : null,
      proposalAcceptanceActivity: Boolean(proposalAppliesToEvent && currentProposalInvoice && proposalHistory[currentProposalInvoice.id]?.activities.some(
        (activity) => activity.invoice_id === currentProposalInvoice.id && activity.event_type === 'accepted',
      )),
      proposalInvoiceId: proposalAppliesToEvent ? currentProposalInvoice?.id : null,
      bookingInvoiceId: proposalAppliesToEvent ? currentProposalBooking?.invoice_id : null,
      contractStatus: proposalAppliesToEvent ? currentProposalBooking?.contract_status : null,
      contractSignedAt: proposalAppliesToEvent ? currentProposalBooking?.contract_signed_at : null,
    })
    const sharedTourReached = ['tour_confirmed', 'proposal_sent', 'booked'].includes(lead.status)
    const sharedTourCompleted = lead.tour_attendance_status === 'attended'
    const leadIsClosedLost = lead.status === 'closed_lost' || lead.pipeline_stage === 'closed_lost'
    const eventIsClosedLost = selectedLeadEvent.status === 'closed_lost' || selectedLeadEvent.pipeline_stage === 'closed_lost'
    return {
      ...selectedLeadEvent,
      status: leadIsClosedLost || eventIsClosedLost
        ? 'closed_lost' as const
        : proposalWorkflow.workflowStageAdvanced
        ? 'booked' as const
        : selectedLeadEvent.status === 'new' && sharedTourReached ? 'tour_confirmed' as const : selectedLeadEvent.status,
      pipeline_stage: leadIsClosedLost || eventIsClosedLost
        ? 'closed_lost' as const
        : proposalWorkflow.pipelineStage === 'contract'
        ? 'contract' as const
        : ['inquiry', 'tour'].includes(selectedLeadEvent.pipeline_stage) && sharedTourCompleted
        ? 'proposal' as const
        : selectedLeadEvent.pipeline_stage === 'inquiry' && sharedTourReached ? 'tour' as const : selectedLeadEvent.pipeline_stage,
    }
  }, [bookings, currentProposalBooking, currentProposalInvoice, lead, leadEvents, proposalHistory, selectedLeadEvent])
  const lifecycleLead = useMemo(() => {
    if (!lead) return null
    if (!activeEventForDisplay) return lead
    return {
      ...lead,
      status: activeEventForDisplay.status,
      pipeline_stage: activeEventForDisplay.pipeline_stage,
    }
  }, [activeEventForDisplay, lead])

  const leadDerivedData = useMemo(() => {
    if (!lead) {
      return {
        chatMessages: [] as { role: string; content: string }[],
        isGrandOpeningLead: false,
        latestInvoice: null as LuxorInvoice | null,
        noteEntries: [] as ActivityEntry[],
        emailEntries: [] as ActivityEntry[],
        callEntries: [] as ActivityEntry[],
        allActivityEntries: [] as ActivityEntry[],
        activityCounts: { all: 0, notes: 0, comms: 0, system: 0 },
        sortedTasks: [] as LuxorTask[],
        pendingTaskCount: 0,
        sortedBookings: [] as LuxorBooking[],
        sortedInvoices: [] as LuxorInvoice[],
        sortedPayments: [] as LuxorPayment[],
      }
    }

    const derivedNoteEntries: ActivityEntry[] = notes.map((note) => ({
      kind: 'note',
      id: `note-${note.id}`,
      createdAt: note.created_at,
      note,
    }))
    const derivedEmailEntries: ActivityEntry[] = emailMessages.map((email) => ({
      kind: 'email',
      id: `email-${email.id || email.direction || email.subject}-${email.receivedAt || email.from}`,
      createdAt: normalizeTimelineDate(email.receivedAt),
      email,
    }))
    const derivedCallEntries: ActivityEntry[] = callRecords.map((call) => ({
      kind: 'call',
      id: `call-${call.id}`,
      createdAt: call.started_at || call.created_at,
      call,
    }))
    const derivedAllActivityEntries = [...derivedNoteEntries, ...derivedEmailEntries, ...derivedCallEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const derivedSortedTasks = [...tasks].sort((a, b) => {
      const rank = (task: LuxorTask) => {
        if (task.status === 'pending' && task.priority === 'urgent') return 0
        if (task.status === 'pending' && task.priority === 'high') return 1
        if (task.status === 'pending') return 2
        if (task.status === 'completed') return 3
        return 4
      }

      const rankDiff = rank(a) - rank(b)
      if (rankDiff !== 0) return rankDiff

      const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY
      return aDue - bDue
    })
    const derivedSortedBookings = [...eventBookings].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at).getTime()
      const bTime = new Date(b.updated_at || b.created_at).getTime()
      return bTime - aTime
    })
    const derivedSortedInvoices = [...eventInvoices].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at).getTime()
      const bTime = new Date(b.updated_at || b.created_at).getTime()
      return bTime - aTime
    })
    const derivedSortedPayments = [...eventPayments].sort((a, b) => {
      const aTime = new Date(a.paid_at || a.updated_at || a.created_at).getTime()
      const bTime = new Date(b.paid_at || b.updated_at || b.created_at).getTime()
      return bTime - aTime
    })

    return {
      chatMessages: (lead.metadata?.chatMessages as { role: string; content: string }[]) || [],
      isGrandOpeningLead: isGrandOpeningRsvp(lead),
      isNewsletter: isNewsletterLead(lead),
      latestInvoice: derivedSortedInvoices[0] ?? null,
      noteEntries: derivedNoteEntries,
      emailEntries: derivedEmailEntries,
      callEntries: derivedCallEntries,
      allActivityEntries: derivedAllActivityEntries,
      activityCounts: {
        all: derivedNoteEntries.length + derivedEmailEntries.length + derivedCallEntries.length,
        notes: notes.filter((note) => note.note_type === 'note').length,
        comms: derivedEmailEntries.length + derivedCallEntries.length + notes.filter((note) => note.note_type === 'call_log' || note.note_type === 'email_log').length,
        system: notes.filter((note) => note.note_type === 'status_change').length,
      },
      sortedTasks: derivedSortedTasks,
      pendingTaskCount: derivedSortedTasks.filter((task) => task.status === 'pending').length,
      sortedBookings: derivedSortedBookings,
      sortedInvoices: derivedSortedInvoices,
      sortedPayments: derivedSortedPayments,
    }
  }, [bookings, callRecords, emailMessages, eventBookings, eventInvoices, eventPayments, lead, notes, payments, tasks])

  const activityEntries = useMemo(() => {
    return leadDerivedData.allActivityEntries.filter((entry) => {
      if (activeFeedTab === 'notes' && !(entry.kind === 'note' && entry.note.note_type === 'note')) return false
      if (activeFeedTab === 'comms') {
        const isCommunication = entry.kind === 'email' || entry.kind === 'call' || (entry.kind === 'note' && (entry.note.note_type === 'call_log' || entry.note.note_type === 'email_log'))
        if (!isCommunication) return false
      }
      if (activeFeedTab === 'system' && !(entry.kind === 'note' && entry.note.note_type === 'status_change')) return false

      if (activityWindow !== 'all') {
        const days = activityWindow === '30d' ? 30 : activityWindow === '90d' ? 90 : 365
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
        if (new Date(entry.createdAt).getTime() < cutoff) return false
      }

      const query = activitySearch.trim().toLowerCase()
      if (query) {
        const searchable = entry.kind === 'email'
          ? `${entry.email.subject} ${entry.email.from} ${entry.email.to} ${entry.email.summary}`
          : entry.kind === 'call'
            ? `${entry.call.caller_number} ${entry.call.callee_number} ${entry.call.direction} ${entry.call.status}`
            : `${entry.note.content} ${entry.note.note_type}`
        if (!searchable.toLowerCase().includes(query)) return false
      }

      return true
    })
  }, [activeFeedTab, activitySearch, activityWindow, leadDerivedData.allActivityEntries])
  const visibleActivityEntries = useMemo(
    () => activityEntries.slice(0, visibleActivityCount),
    [activityEntries, visibleActivityCount],
  )
  const sharedFiles = useMemo(
    () => emailMessages.flatMap((email) => (email.attachments || []).map((attachment) => ({ email, attachment }))).slice(0, 4),
    [emailMessages],
  )
  const sharedAttachmentEmails = useMemo(
    () => emailMessages.filter((email) => email.hasAttachment && !email.attachments?.length).slice(0, 4),
    [emailMessages],
  )
  const hiddenActivityCount = Math.max(0, activityEntries.length - visibleActivityEntries.length)

  const activeStage = useMemo(() => {
    if (!lead) return 'inquiry'
    const steps = getLeadLifecycleSteps(lifecycleLead || lead, lifecycleBooking, currentProposalInvoice, proposalWorkflowDisplay.proposalAccepted)

    const activeIndex = steps.findIndex(s => s.isActive)
    if (activeIndex !== -1) {
      return steps[activeIndex].id
    }
    
    const firstNonCompletedIdx = steps.findIndex(s => !s.isCompleted)
    if (firstNonCompletedIdx !== -1) {
      return steps[firstNonCompletedIdx].id
    }
    
    return 'closing'
  }, [currentProposalInvoice, lead, lifecycleBooking, lifecycleLead])

  // Set Event Summary states from lead metadata or latestBooking
  useEffect(() => {
    if (!selectedLeadEvent || proposalEditorOpenRef.current) return
    const savedItems = selectedLeadEvent.metadata?.proposalLineItems
    setInvoiceItems(Array.isArray(savedItems) && savedItems.length
      ? savedItems as LuxorInvoiceLineItem[]
      : [{ description: '', quantity: 1, unitPrice: 0, total: 0 }])
    setInvoiceTaxRate(typeof selectedLeadEvent.metadata?.proposalTaxRate === 'number'
      ? String(Number(selectedLeadEvent.metadata.proposalTaxRate) * 100)
      : DEFAULT_TEXAS_SALES_TAX_RATE_PERCENT)
  }, [selectedLeadEvent?.id])

  useEffect(() => {
    if (lead) {
      const metadata = activeEventForDisplay?.metadata || lead.metadata || {}
      const grandOpeningLead = isGrandOpeningRsvp(lead)
      setSummaryStartTime(String(latestBooking?.start_time || metadata.start_time || (grandOpeningLead ? LUXOR_GRAND_OPENING.startTime : '')))
      setSummaryEndTime(String(latestBooking?.end_time || metadata.end_time || (grandOpeningLead ? LUXOR_GRAND_OPENING.endTime : '')))
    }
  }, [activeEventForDisplay, lead, latestBooking])

  const handleSaveTourAttendance = async () => {
    if (!lead) return
    try {
      setSavingTourAttendance(true)
      const updatedMetadata = {
        ...lead.metadata,
        tourGuests,
        tourNotes,
        estimatedBudget: tourBudget,
        cateringPreferences,
        tour_assignees: [...tourAssignees.filter((item) => ['Arianna', 'Carlos', 'Alex'].includes(item)), ...(tourAssigneeCustom.trim() ? [tourAssigneeCustom.trim()] : [])],
      }

      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          metadata: updatedMetadata,
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update tour attendance.')
      }

      const updated = payload as LuxorInquiry
      setLead(updated)
      setIsEditingTourAttendance(false)
    } catch (err) {
      console.error(err)
      notify({ title: 'Tour details not saved', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setSavingTourAttendance(false)
    }
  }

  const handleEventMetadataUpdate = async (updatedMetadata: Record<string, unknown>, targetEventId = selectedLeadEvent?.id) => {
    if (!lead || !targetEventId) return false
    const previousEvent = leadEvents.find((event) => event.id === targetEventId)
    if (!previousEvent) return false
    const mergedMetadata = { ...previousEvent.metadata, ...updatedMetadata }
    setLeadEvents((current) => current.map((event) => event.id === targetEventId
      ? { ...event, metadata: mergedMetadata, updated_at: new Date().toISOString() }
      : event))
    try {
      const res = await fetch('/api/lead-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetEventId, inquiry_id: lead.id, metadata: mergedMetadata }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to update event details.')
      const updated = payload as LuxorLeadEvent
      setLeadEvents((current) => current.map((event) => event.id === updated.id ? updated : event))
      return true
    } catch (err) {
      console.error(err)
      setLeadEvents((current) => current.map((event) => event.id === previousEvent.id ? previousEvent : event))
      notify({ title: 'Event update failed', description: err instanceof Error ? err.message : 'Failed to update event details.', variant: 'error' })
      return false
    }
  }

  const handleEventPlanningTimeUpdate = async (updatedMetadata: Record<string, unknown>, targetEventId: string) => {
    if (hasActiveLuxorEventBooking(targetEventId, bookingsRef.current)) {
      notify({ title: 'Event time not saved', description: 'This event has a booking. Update its timing through the booking workflow.', variant: 'error' })
      return false
    }
    return handleEventMetadataUpdate(updatedMetadata, targetEventId)
  }

  const openTourDetailsEditor = () => {
    if (!lead) return
    const metadata = lead.metadata || {}
    setTourGuests(String(metadata.tourGuests || ''))
    setTourNotes(String(metadata.tourNotes || ''))
    setTourBudget(String(metadata.estimatedBudget || ''))
    setCateringPreferences(String(metadata.cateringPreferences || ''))
    const storedAssignees = Array.isArray(metadata.tour_assignees)
      ? metadata.tour_assignees.map((value) => String(value)).filter(Boolean)
      : metadata.tour_coordinator ? [String(metadata.tour_coordinator)] : []
    setTourAssignees(storedAssignees)
    setTourAssigneeCustom(storedAssignees.find((value) => !['Arianna', 'Carlos', 'Alex'].includes(value)) || '')
    setIsEditingTourAttendance(true)
  }

  useLayoutEffect(() => {
    let frame = 0
    const updateIndicator = () => {
      const activeButton = tabButtonRefs.current[activeLeadTab]
      if (!activeButton) return

      const nextIndicator = {
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      }
      setTabIndicator((current) => {
        if (current.left === nextIndicator.left && current.width === nextIndicator.width) {
          return current
        }
        return nextIndicator
      })
    }
    const scheduleIndicatorUpdate = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateIndicator)
    }

    updateIndicator()
    window.addEventListener('resize', scheduleIndicatorUpdate)
    return () => {
      window.removeEventListener('resize', scheduleIndicatorUpdate)
      cancelAnimationFrame(frame)
    }
  }, [activeLeadTab, lead?.id])

  useEffect(() => {
    setShowInternalSignals(false)
    setShowTaskTools(false)
  }, [id])

  useEffect(() => {
    setVisibleActivityCount(ACTIVITY_BATCH_SIZE)
  }, [activeFeedTab, activitySearch, activityWindow, id])

  useEffect(() => {
    const email = lead?.email
    if (!email) return
    let active = true

    const checkSubscription = async () => {
      try {
        const res = await fetch(`/api/marketing/members?email=${encodeURIComponent(email)}`)
        if (res.ok && active) {
          const data = await res.json()
          setIsSubscribed(data.subscribed)
        }
      } catch (err) {
        console.error('Failed to query subscriber status:', err)
      }
    }

    checkSubscription()
    return () => { active = false }
  }, [lead?.email])

  const fetchMarketingEngagement = async (email: string, options: { silent?: boolean } = {}) => {
    if (!email) {
      setMarketingEngagement(null)
      setMarketingEngagementError(null)
      return
    }

    try {
      if (!options.silent) setLoadingMarketingEngagement(true)
      setMarketingEngagementError(null)

      const response = await fetch(`/api/marketing/lead?email=${encodeURIComponent(email)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as LeadMarketingEngagement & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to load marketing engagement.')

      setMarketingEngagement(payload)
      setIsSubscribed(payload.subscribed)
    } catch (err) {
      console.error('Failed to load marketing engagement:', err)
      setMarketingEngagementError(err instanceof Error ? err.message : 'Unable to load marketing engagement.')
    } finally {
      if (!options.silent) setLoadingMarketingEngagement(false)
    }
  }

  useEffect(() => {
    const email = lead?.email
    if (!email) {
      setMarketingEngagement(null)
      setMarketingEngagementError(null)
      return
    }

    void fetchMarketingEngagement(email)
  }, [lead?.email])

  useEffect(() => {
    const email = lead?.email
    if (!email) return

    let active = true
    let timeoutId: number | null = null

    const pollMarketingEngagement = async () => {
      if (!active) return

      await fetchMarketingEngagement(email, { silent: true })

      if (active) {
        timeoutId = window.setTimeout(pollMarketingEngagement, 15000)
      }
    }

    timeoutId = window.setTimeout(pollMarketingEngagement, 15000)

    return () => {
      active = false
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [lead?.email])

  const handleToggleMarketing = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!lead?.email || togglingMarketing) return

    setTogglingMarketing(true)
    const newStatus = !isSubscribed

    try {
      const res = await fetch('/api/marketing/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: lead.email,
          fullName: lead.full_name,
          source: lead.source,
          action: newStatus ? 'subscribe' : 'unsubscribe',
        }),
      })

      if (res.ok) {
        setIsSubscribed(newStatus)
        setMarketingMessage(newStatus ? 'added' : 'removed')
        setMarketingEngagement((current) => current ? { ...current, subscribed: newStatus } : current)
        window.setTimeout(() => setMarketingMessage(null), 2500)
      } else {
        throw new Error('Failed to update marketing list subscription.')
      }
    } catch (err) {
      console.error(err)
      notify({ title: 'Marketing status not updated', description: 'Please try again.', variant: 'error' })
    } finally {
      setTogglingMarketing(false)
    }
  }

  const eventPreferenceCacheKey = `luxor:lead-event:${id}`

  const persistLeadEventPreference = async (eventId: string) => {
    try {
      window.localStorage.setItem(eventPreferenceCacheKey, eventId)
    } catch {
      // Browser storage can be unavailable in private browsing; Supabase remains the durable fallback.
    }
    try {
      await fetch('/api/portal/lead-event-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiry_id: id, lead_event_id: eventId }),
      })
    } catch (error) {
      console.warn('Lead event preference could not be synced.', error)
    }
  }

  const selectLeadEvent = (eventId: string) => {
    if (eventId !== selectedLeadEventIdRef.current) {
      eventDetailsEditSessionRef.current += 1
      setEventDetailsDraft({})
      setEventDetailsDraftEventId(null)
      setEventDetailsEditing(false)
    }
    selectedLeadEventIdRef.current = eventId
    setActiveEventId(eventId)
    setShowEventPicker(false)
    setShowActionsMenu(false)
    window.requestAnimationFrame(() => eventPickerTriggerRef.current?.focus())
    void persistLeadEventPreference(eventId)
  }

  const openAddEventModal = () => {
    setShowActionsMenu(false)
    window.requestAnimationFrame(() => actionsMenuTriggerRef.current?.focus())
    setNewEventType('')
    setNewEventDate('')
    setNewEventGuestCount('')
    setNewEventPackage('')
    setNewEventNotes('')
    setIsAddEventModalOpen(true)
  }

  const handleAddEvent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!lead || !newEventType.trim()) return
    try {
      setSubmittingEvent(true)
      const res = await fetch('/api/lead-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiry_id: lead.id,
        event_type: newEventType.trim(),
          target_date: newEventDate || null,
          guest_count: newEventGuestCount || null,
          package_interest: newEventPackage || null,
          notes: newEventNotes || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to add event.')
      const created = payload as LuxorLeadEvent
      setLeadEvents((current) => [...current, created])
      setActiveEventId(created.id)
      await persistLeadEventPreference(created.id)
      setIsAddEventModalOpen(false)
      notify({ title: 'Event added', description: `${created.event_type || 'New event'} is now selected.`, variant: 'success' })
    } catch (error) {
      console.error(error)
      notify({ title: 'Event not added', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setSubmittingEvent(false)
    }
  }

  useEffect(() => {
    if (!showEventPicker) return
    const updatePopoverPositions = () => {
      const place = (
        anchor: HTMLButtonElement | null,
        menu: HTMLDivElement | null,
        width: number,
        set: (value: { top: number; left: number; maxHeight: number }) => void,
      ) => {
        const rect = anchor?.getBoundingClientRect()
        if (!rect) return
        const margin = 8
        const maxWidth = Math.min(width, window.innerWidth - margin * 2)
        const height = Math.min(menu?.scrollHeight ?? 360, window.innerHeight - margin * 2)
        const below = Math.max(0, window.innerHeight - rect.bottom - margin)
        const above = Math.max(0, rect.top - margin)
        const openAbove = below < Math.min(height, 180) && above > below
        const maxHeight = Math.max(100, Math.min(height, openAbove ? above : below))
        set({
          top: openAbove ? Math.max(margin, rect.top - maxHeight - 8) : Math.min(window.innerHeight - maxHeight - margin, rect.bottom + 8),
          left: Math.max(margin, Math.min(rect.left, window.innerWidth - maxWidth - margin)),
          maxHeight,
        })
      }
      if (showEventPicker) place(eventPickerTriggerRef.current, eventPickerMenuRef.current, 340, setEventPickerPosition)
    }
    const frame = window.requestAnimationFrame(updatePopoverPositions)
    window.addEventListener('resize', updatePopoverPositions)
    window.addEventListener('scroll', updatePopoverPositions, true)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowEventPicker(false)
        setShowActionsMenu(false)
        if (showEventPicker) eventPickerTriggerRef.current?.focus()
        if (showActionsMenu) actionsMenuTriggerRef.current?.focus()
      }
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (showEventPicker && !eventPickerTriggerRef.current?.contains(target) && !eventPickerMenuRef.current?.contains(target)) setShowEventPicker(false)
      if (showActionsMenu && !actionsMenuTriggerRef.current?.contains(target) && !actionsMenuRef.current?.contains(target)) setShowActionsMenu(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePopoverPositions)
      window.removeEventListener('scroll', updatePopoverPositions, true)
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [showActionsMenu, showEventPicker])

  useEffect(() => {
    if (!lead?.phone) {
      setSmsConsent(null)
      return
    }
    let isMounted = true
    const fetchConsent = () => {
      fetch(`/api/twilio/consent?phone=${encodeURIComponent(lead.phone!)}`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isMounted) return
          if (data && typeof data.status === 'string') {
            setSmsConsent({
              status: data.status,
              updated_at: data.updated_at ?? null,
              consent_scopes: Array.isArray(data.consent_scopes) ? data.consent_scopes : [],
              consent_request_status: data.consent_request_status ?? null,
            })
          } else {
            setSmsConsent({ status: 'unknown', consent_request_status: null })
          }
        })
        .catch(() => {
          if (isMounted) setSmsConsent({ status: 'unknown', consent_request_status: null })
        })
    }
    fetchConsent()

    const handleConsentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ phone?: string; state?: SmsConsentState }>
      const updatedPhone = customEvent.detail?.phone
      if (
        !updatedPhone ||
        updatedPhone === lead.phone ||
        updatedPhone.replace(/\D/g, '') === lead.phone?.replace(/\D/g, '')
      ) {
        if (customEvent.detail?.state) {
          setSmsConsent(customEvent.detail.state)
        } else {
          fetchConsent()
        }
      }
    }
    window.addEventListener('luxor-sms-consent-updated', handleConsentUpdated)

    return () => {
      isMounted = false
      window.removeEventListener('luxor-sms-consent-updated', handleConsentUpdated)
    }
  }, [lead?.phone])

  const requestSmsConsent = async () => {
    if (!lead?.phone || consentRequestSending) return
    setConsentRequestSending(true)
    try {
      const response = await fetch('/api/twilio/consent-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.phone,
          inquiryId: lead.id,
          contactName: lead.full_name,
        }),
      })
      const payload = await response.json() as { simulated?: boolean; message?: unknown; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to request SMS consent.')
      setShowActionsMenu(false)
      if (payload.simulated) {
        notify({ title: 'Test simulation recorded', description: 'No SMS was sent to this test contact.', variant: 'success' })
      } else {
        const nextState: SmsConsentState = { status: 'unknown', consent_request_status: 'pending' }
        setSmsConsent(nextState)
        window.dispatchEvent(new CustomEvent('luxor-sms-consent-updated', { detail: { phone: lead.phone, state: nextState } }))
        notify({ title: 'Consent request sent', description: `Verification text sent to ${lead.full_name || lead.phone}.`, variant: 'success' })
      }
    } catch (error) {
      notify({ title: 'Consent request not sent', description: error instanceof Error ? error.message : 'Unable to request SMS consent.', variant: 'error' })
    } finally {
      setConsentRequestSending(false)
    }
  }

  const manualOptIn = async () => {
    if (!lead?.phone || manualOptInLoading) return
    setManualOptInLoading(true)
    try {
      const response = await fetch('/api/twilio/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: lead.phone,
          reason: `Manual opt-in from lead #${lead.id}`,
        }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to record SMS opt-in.')
      const nextState: SmsConsentState = {
        status: 'opted_in',
        consent_request_status: null,
        consent_scopes: ['customer_care', 'transactional', 'tour', 'event', 'payment', 'invoice', 'marketing'],
      }
      setSmsConsent(nextState)
      setShowActionsMenu(false)
      window.dispatchEvent(new CustomEvent('luxor-sms-consent-updated', { detail: { phone: lead.phone, state: nextState } }))
      notify({
        title: 'SMS opt-in recorded',
        description: `Marked ${lead.full_name || lead.phone} as opted in to text messages.`,
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: 'Opt-in not recorded',
        description: error instanceof Error ? error.message : 'Unable to record SMS opt-in.',
        variant: 'error',
      })
    } finally {
      setManualOptInLoading(false)
    }
  }

  const fetchAllData = async (showPageLoader = true, refreshEmailHistory = showPageLoader) => {
    try {
      if (showPageLoader) setLoading(true)
      setError(null)

      const leadRes = await fetch(`/api/inquiries?id=${id}`)
      if (!leadRes.ok) throw new Error('Failed to fetch lead details.')
      const leadData = await leadRes.json()
      setLead(leadData)
      void fetch(`/api/portal/leads/${encodeURIComponent(id)}/brochure-clicks`, { cache: 'no-store' })
        .then(async (response) => setBrochureClick(response.ok ? await response.json() : 'unavailable'))
        .catch(() => setBrochureClick('unavailable'))
      if (!proposalEditorOpenRef.current) {
        const savedProposalItems = leadData.metadata?.proposalLineItems
        if (Array.isArray(savedProposalItems) && savedProposalItems.length) {
          setInvoiceItems(savedProposalItems as LuxorInvoiceLineItem[])
        }
        if (typeof leadData.metadata?.proposalTaxRate === 'number') {
          setInvoiceTaxRate(String(leadData.metadata.proposalTaxRate * 100))
        }
      }

      const targetEmail = normalizeLuxorEmailAddress(leadData.email)
      if (
        refreshEmailHistory
        || (targetEmail && emailHistoryRequestedRecipientRef.current !== targetEmail)
      ) void fetchClientEmailThread(leadData.email || '')

      const [notesData, tasksData, invoicesData, bookingsData, paymentsData, tourJobsData, callsData, leadEventsData, eventPreferenceData, documentsData, signaturesData] = await Promise.all([
        fetch(`/api/notes?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/tasks?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/invoices?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/bookings?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/payments?inquiryId=${id}`)
          .then(async (res) => {
            if (!res.ok) throw new Error('Payment records could not be verified.')
            const result: unknown = await res.json()
            if (!Array.isArray(result)) throw new Error('Payment records could not be verified.')
            return result as LuxorPayment[]
          })
          .catch(() => null),
        fetch(`/api/tour-actions?inquiryId=${id}`)
          .then(async (res) => res.ok ? ((await res.json()).jobs || []) : [])
          .catch(() => []),
        fetch(`/api/twilio/calls?inquiryId=${id}&limit=100`, { cache: 'no-store' })
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/lead-events?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/portal/lead-event-preference?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : null))
          .catch(() => null),
        fetch(`/api/documents?inquiryId=${id}`, { cache: 'no-store' })
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch('/api/signatures?limit=250', { cache: 'no-store' })
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
      ])

      setNotes(isLuxorTestInquiry(leadData) ? [] : notesData)
      setTasks(isLuxorTestInquiry(leadData) ? [] : tasksData)
      setInvoices(invoicesData)
      setDocuments((documentsData as LuxorDocument[]).filter((document) => document.inquiry_id === id))
      setSignatureRequests((signaturesData as Array<{ id: string; booking_id: string; inquiry_id: string | null; client_name: string; status: string; created_at: string; signed_at: string | null }>).filter((signature) => signature.inquiry_id === id))
      const nextBookings = bookingsData as LuxorBooking[]
      const previousStatuses = contractStatusSnapshotRef.current
      if (Object.keys(previousStatuses).length) {
        nextBookings.forEach((booking) => {
          if (previousStatuses[booking.id] === 'sent' && booking.contract_status === 'viewed') {
            notify({
              title: 'Contract viewed',
              description: `${booking.client_name || leadData.full_name} opened the agreement in the secure portal.`,
              variant: 'success',
            })
          }
        })
      }
      contractStatusSnapshotRef.current = Object.fromEntries(nextBookings.map((booking) => [booking.id, booking.contract_status || 'not_sent']))
      setBookings(nextBookings)
      setPaymentLoadError(paymentsData === null ? 'Payment records could not be verified. Refresh before collecting another payment or confirming a date.' : null)
      setPayments(paymentsData || [])
      setTourEmailJobs(tourJobsData)
      void fetch(`/api/leads/${encodeURIComponent(id)}/correct-email-resend`, { cache: 'no-store' })
        .then(async (response) => response.ok ? response.json() : { options: [] })
        .then((payload) => {
          setCorrectEmailResendOptions(Array.isArray(payload.options) ? payload.options : [])
          setCorrectEmailResendSuggestedId(typeof payload.suggestedId === 'string' ? payload.suggestedId : null)
        })
        .catch(() => {
          setCorrectEmailResendOptions([])
          setCorrectEmailResendSuggestedId(null)
        })
      const preparedResend = (tourJobsData as LuxorEmailJob[])
        .filter((job) => {
          const metadata = job.metadata as Record<string, unknown> | null
          const prepared = metadata?.prepared_tour_email_resend === true || metadata?.awaiting_owner_confirmation === true
          const current = !metadata?.superseded_at && !metadata?.superseded_by_request_id
          const availableStatus = job.status === 'failed'
            || ['queued', 'sending', 'sent'].includes(job.status)
            || (job.status === 'cancelled' && metadata?.awaiting_owner_confirmation === true)
          return prepared && current && availableStatus && job.recipient_email === leadData.email
        })
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0] || null
      setEmailResendCandidate(preparedResend || null)
      setCallRecords(callsData)
      const nextLeadEvents = leadEventsData as LuxorLeadEvent[]
      setLeadEvents(nextLeadEvents)
      if (!initializedEventPreferenceRef.current) {
        let cachedEventId: string | null = null
        try {
          cachedEventId = window.localStorage.getItem(eventPreferenceCacheKey)
        } catch {
          cachedEventId = null
        }
        const serverEventId = eventPreferenceData?.lead_event_id || null
        const rememberedEventId = [serverEventId, cachedEventId].find((eventId) => eventId && nextLeadEvents.some((event) => event.id === eventId))
        const fallbackEventId = nextLeadEvents.find((event) => event.is_primary)?.id || nextLeadEvents[0]?.id || null
        const initialEventId = rememberedEventId || fallbackEventId
        setActiveEventId(initialEventId)
        initializedEventPreferenceRef.current = true
        if (initialEventId) void persistLeadEventPreference(initialEventId)
      } else if (activeEventId && !nextLeadEvents.some((event) => event.id === activeEventId)) {
        const fallbackEventId = nextLeadEvents.find((event) => event.is_primary)?.id || nextLeadEvents[0]?.id || null
        setActiveEventId(fallbackEventId)
        if (fallbackEventId) void persistLeadEventPreference(fallbackEventId)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'An error occurred loading the client profile.')
    } finally {
      if (showPageLoader) setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [id])

  const ensureActiveTestRun = useCallback(async (showSuccess = false) => {
    if (!lead || !isLuxorTestInquiry(lead)) return
    const requestKey = `${lead.id}:${requestedTestRunId || 'active'}`
    activeTestRunRequestRef.current = requestKey
    setLoadingTestRun(true)
    try {
      if (requestedTestRunId && !showSuccess) {
        const response = await fetch(`/api/portal/test-lead/proposal?testRunId=${encodeURIComponent(requestedTestRunId)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({})) as { error?: string }
        if (!response.ok) throw new Error(payload.error || 'This test email refers to a run that is no longer active.')
        setActiveTestRunId(requestedTestRunId)
        return
      }
      const response = await fetch('/api/portal/test-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ensure_active_run' }),
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({})) as { leadId?: string; run?: { id?: string; status?: string }; error?: string }
      if (!response.ok || payload.leadId !== lead.id || !payload.run?.id || payload.run.status !== 'in_progress') {
        throw new Error(payload.error || 'Open Test Settings and enable the verified inbox before using the isolated workflow.')
      }
      setActiveTestRunId(payload.run.id)
      if (showSuccess) notify({ title: 'Isolated test run ready', description: 'This Test Lead is connected to a run-scoped simulation.', variant: 'success' })
    } catch (error) {
      activeTestRunRequestRef.current = null
      if (requestedTestRunId) setActiveTestRunId(null)
      notify({ title: 'Test run unavailable', description: error instanceof Error ? error.message : 'The isolated Test Lead run could not be prepared.', variant: 'error' })
    } finally {
      setLoadingTestRun(false)
    }
  }, [lead, notify, requestedTestRunId])

  useEffect(() => {
    if (!lead || !isLuxorTestInquiry(lead)) {
      setActiveTestRunId(null)
      setLoadingTestRun(false)
      activeTestRunRequestRef.current = null
      return
    }
    const requestKey = `${lead.id}:${requestedTestRunId || 'active'}`
    if (activeTestRunRequestRef.current === requestKey) return
    void ensureActiveTestRun()
  }, [ensureActiveTestRun, lead?.id, lead?.is_test, lead?.metadata?.is_test_record, requestedTestRunId])

  useEffect(() => {
    const handleReset = () => {
      activeTestRunRequestRef.current = null
      setActiveTestRunId(null)
    }
    const handleReady = (event: Event) => {
      const runId = (event as CustomEvent<{ runId?: string }>).detail?.runId
      if (!runId) return
      if (requestedTestRunId && runId !== requestedTestRunId) return
      activeTestRunRequestRef.current = lead ? `${lead.id}:${requestedTestRunId || 'active'}` : null
      setActiveTestRunId(runId)
    }
    window.addEventListener('luxor-test-run-reset', handleReset)
    window.addEventListener('luxor-test-run-ready', handleReady)
    return () => {
      window.removeEventListener('luxor-test-run-reset', handleReset)
      window.removeEventListener('luxor-test-run-ready', handleReady)
    }
  }, [lead?.id, requestedTestRunId])

  // The Luxor tables are private behind RLS, so browser Realtime may not receive
  // their row payloads. Keep the payment/open cards current through the
  // portal-authenticated API even when the WebSocket is unavailable.
  useEffect(() => {
    if (!id) return
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchAllData(false, false)
    }, 5_000)
    return () => window.clearInterval(intervalId)
  }, [id])

  // Sub-100ms Supabase Realtime WebSocket listener for instant Lead Dossier UI & field updates (opens, clicks, payments, SMS, calls)
  useEffect(() => {
    if (!id) return
    const supabase = getPortalSupabaseClient()
    if (!supabase) return

    const channel = supabase
      .channel(`luxor-lead-dossier-realtime-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_inquiries', filter: `id=eq.${id}` },
        () => {
          void fetchAllData(false)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_payments' },
        () => {
          void fetchAllData(false)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_invoices' },
        () => {
          void fetchAllData(false)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_marketing_events' },
        () => {
          void fetchAllData(false)
          if (lead?.email) void fetchMarketingEngagement(lead.email, { silent: true })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_messages' },
        () => {
          void fetchAllData(false)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_calls' },
        () => {
          void fetchAllData(false)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_notes' },
        () => {
          void fetchAllData(false)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'luxor_bookings' },
        () => {
          void fetchAllData(false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, lead?.email])

  useEffect(() => {
    const refreshCalls = () => {
      void fetch(`/api/twilio/calls?inquiryId=${id}&limit=100`, { cache: 'no-store' })
        .then(async (response) => response.ok ? await response.json() as LuxorCall[] : [])
        .then(setCallRecords)
        .catch(() => undefined)
    }
    window.addEventListener('luxor-call-history-refresh', refreshCalls)
    return () => window.removeEventListener('luxor-call-history-refresh', refreshCalls)
  }, [id])

  const saveCallSummary = async (callId: string) => {
    setSavingCallSummaryId(callId)
    try {
      const response = await fetch('/api/twilio/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: callId, notes: callSummaryDraft.trim() || null }),
      })
      const payload = await response.json().catch(() => ({})) as LuxorCall & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to save the call summary.')
      setCallRecords((current) => current.map((call) => call.id === callId ? payload : call))
      setEditingCallSummaryId(null)
      setCallSummaryDraft('')
      window.dispatchEvent(new Event('luxor-call-history-refresh'))
      notify({ title: 'Call summary saved', description: 'The summary is saved with this lead’s call history.', variant: 'success' })
    } catch (error) {
      notify({ title: 'Could not save summary', description: error instanceof Error ? error.message : 'Unable to save the call summary.', variant: 'error' })
    } finally {
      setSavingCallSummaryId(null)
    }
  }

  const showCallSummary = async (call: LuxorCall) => {
    setCallViewModes((current) => ({ ...current, [call.id]: 'summary' }))
    if (call.summary_text || call.transcription_status !== 'completed') return
    setGeneratingCallSummaryId(call.id)
    try {
      const endpoint = `/api/portal/calls/${encodeURIComponent(call.id)}/summary?inquiryId=${encodeURIComponent(id)}`
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId: id }),
      })
      let payload = await response.json() as { status?: LuxorCall['summary_status']; summary?: string | null; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to summarize this call.')
      for (let attempt = 0; attempt < 8 && payload.status === 'generating'; attempt += 1) {
        setCallRecords((current) => current.map((item) => item.id === call.id ? { ...item, summary_status: payload.status } : item))
        await new Promise((resolve) => window.setTimeout(resolve, 1500))
        const statusResponse = await fetch(endpoint, { cache: 'no-store' })
        payload = await statusResponse.json() as { status?: LuxorCall['summary_status']; summary?: string | null; error?: string }
        if (!statusResponse.ok) throw new Error(payload.error || 'Unable to load the call summary.')
      }
      if (payload.status === 'failed') throw new Error('Summary generation failed. Select Summary to retry.')
      setCallRecords((current) => current.map((item) => item.id === call.id ? { ...item, summary_status: payload.status, summary_text: payload.summary || item.summary_text } : item))
    } catch (error) {
      notify({ title: 'Summary unavailable', description: error instanceof Error ? error.message : 'Unable to summarize this call.', variant: 'error' })
    } finally {
      setGeneratingCallSummaryId(null)
    }
  }

  const seekCallRecording = (callId: string, seconds: number | null | undefined) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return
    const audio = document.getElementById(`luxor-call-audio-${callId}`) as HTMLAudioElement | null
    if (!audio) return
    audio.currentTime = Math.max(0, seconds)
    void audio.play().catch(() => undefined)
  }

  const fetchClientEmailThread = async (email: string) => {
    const requestId = ++emailThreadRequestRef.current
    if (!email) {
      emailHistoryRequestedRecipientRef.current = ''
      setEmailHistoryRecipient('')
      setEmailMessages([])
      setEmailThreadError(null)
      setZohoReconnectRequired(false)
      setLoadingEmailMessages(false)
      return
    }

    const normalizedEmail = normalizeLuxorEmailAddress(email)
    emailHistoryRequestedRecipientRef.current = normalizedEmail
    setEmailHistoryRecipient('')
    try {
      setLoadingEmailMessages(true)
      setEmailThreadError(null)
      setZohoReconnectRequired(false)
      const response = await fetch(`/api/email/inbox?limit=1000&includeAttachments=1&email=${encodeURIComponent(email)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as {
        messages?: ZohoEmailMessage[]
        error?: string
        reconnectRequired?: boolean
      }
      if (!response.ok) {
        setZohoReconnectRequired(Boolean(payload.reconnectRequired))
        throw new Error(payload.error || 'Unable to load email history.')
      }
      if (requestId !== emailThreadRequestRef.current) return
      setEmailMessages(payload.messages || [])
      setEmailHistoryRecipient(normalizedEmail)
    } catch (threadError) {
      if (requestId !== emailThreadRequestRef.current) return
      setEmailMessages([])
      setEmailHistoryRecipient(normalizedEmail)
      const message = threadError instanceof Error ? threadError.message : 'Unable to load email history.'
      setEmailThreadError(message.includes('reconnected with email search permission') ? 'The mailbox needs to be reconnected in Settings.' : 'Email history could not be refreshed. Please try again.')
      setZohoReconnectRequired((current) => current || message.includes('reconnected with email search permission'))
    } finally {
      if (requestId === emailThreadRequestRef.current) setLoadingEmailMessages(false)
    }
  }

  useEffect(() => {
    const resolution = emailNoticeResolution
    if (!lead || resolution?.kind !== 'resolved') {
      setEmailNoticeTracker(null)
      return
    }

    let storage: Storage | null = null
    try { storage = window.localStorage } catch { /* Keep the notice in memory if storage is unavailable. */ }
    let tracker = ensureLeadEmailNoticeTracker(storage, resolution)
    if (resolution.supersededByLaterEmail && tracker.dismissedAt === null) {
      tracker = dismissLeadEmailNoticeTracker(storage, resolution, tracker)
    }
    setEmailNoticeTracker(tracker)
  }, [lead?.id, resolvedNoticeKey, resolutionSuperseded])

  useEffect(() => {
    const resolution = emailNoticeResolution
    if (resolution?.kind !== 'resolved' || !emailNoticeTracker || !showResolvedEmailNotice) return

    const millisecondsRemaining = emailNoticeTracker.firstSeenAt + LUXOR_EMAIL_NOTICE_TTL_MS - Date.now()
    if (millisecondsRemaining <= 0) return

    const timer = window.setTimeout(() => {
      let storage: Storage | null = null
      try { storage = window.localStorage } catch { /* The timeout still hides this page's notice. */ }
      setEmailNoticeTracker((current) => current
        ? dismissLeadEmailNoticeTracker(storage, resolution, current)
        : current)
    }, millisecondsRemaining)

    return () => window.clearTimeout(timer)
  }, [resolvedNoticeKey, emailNoticeTracker, resolutionSuperseded, showResolvedEmailNotice])

  useEffect(() => {
    if (!lead?.id || !lead.email) return
    const currentLeadEmail = lead.email

    const handleEmailSent = (event: Event) => {
      const detail = (event as CustomEvent<LeadEmailSentEventDetail>).detail
      if (!detail || normalizeLuxorEmailAddress(detail.recipient) !== normalizeLuxorEmailAddress(currentLeadEmail)) return
      if (detail.leadId && detail.leadId !== lead.id) return

      const resolution = emailNoticeResolution
      if (resolution?.kind === 'resolved' && !resolution.supersededByLaterEmail && detail.messageId !== resolution.successEventId) {
        let storage: Storage | null = null
        try { storage = window.localStorage } catch { /* The in-memory notice still dismisses. */ }
        const current = emailNoticeTracker || ensureLeadEmailNoticeTracker(storage, resolution)
        setEmailNoticeTracker(dismissLeadEmailNoticeTracker(storage, resolution, current))
      }

      void fetchClientEmailThread(currentLeadEmail)
    }

    window.addEventListener(LUXOR_EMAIL_SENT_EVENT, handleEmailSent)
    return () => window.removeEventListener(LUXOR_EMAIL_SENT_EVENT, handleEmailSent)
  }, [lead?.id, lead?.email, emailNoticeResolution?.kind === 'resolved' ? emailNoticeResolution.successEventId : '', emailNoticeTracker])

  const handleStatusChange = async (newStatus: LuxorInquiry['status']) => {
    if (!lead) return false
    if (newStatus === 'closed_lost') {
      setLeadLifecycleAction('archive')
      return false
    }
    const eventScopedStatus = Boolean(selectedLeadEvent && ['proposal_sent', 'booked'].includes(newStatus))
    const previousStatus = eventScopedStatus ? selectedLeadEvent?.status || lead.status : lead.status
    try {
      setUpdatingStatus(true)
      setPendingLifecycleStatus(newStatus)
      const pipelineStage = newStatus === 'tour_requested' || newStatus === 'tour_confirmed'
        ? 'tour'
        : newStatus === 'proposal_sent'
          ? 'proposal'
          : newStatus === 'booked'
            ? 'contract'
            : 'inquiry'
      const res = await fetch(eventScopedStatus ? '/api/lead-events' : '/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventScopedStatus
          ? { id: selectedLeadEvent?.id, inquiry_id: id, status: newStatus, pipeline_stage: pipelineStage }
          : { id, status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update status.')
      const updated = await res.json()
      if (eventScopedStatus) {
        setLeadEvents((current) => current.map((event) => event.id === updated.id ? updated : event))
      } else {
        setLead(updated)
      }
      const statusNote = await createFlowNote(
        `${eventScopedStatus ? `${selectedLeadEvent?.event_type || 'Event'} status` : 'Lead status'} changed from ${previousStatus.replaceAll('_', ' ')} to ${newStatus.replaceAll('_', ' ')}.`,
        'status_change',
      )
      setNotes((current) => [statusNote, ...current])
      await fetchAllData(false)
      notify({ title: 'Lead status updated', description: `Moved to ${newStatus.replaceAll('_', ' ')}.`, variant: 'success' })
      return true
    } catch (err) {
      console.error(err)
      notify({ title: 'Status not updated', description: 'The lead stayed at its previous stage. Please try again.', variant: 'error' })
      return false
    } finally {
      setUpdatingStatus(false)
      setPendingLifecycleStatus(null)
    }
  }

  const handleLeadFieldUpdate = async (field: EditableLeadField, nextValue: string) => {
    if (!lead || savingLeadField) return false

    let normalizedValue: string | number | null
    try {
      normalizedValue = field === 'event_type'
        ? normalizeLuxorEventType(nextValue)
        : normalizeLeadFieldValue(field, nextValue)
    } catch (eventTypeError) {
      notify({ title: field === 'full_name' ? 'Client name not saved' : 'Event type not saved', description: eventTypeError instanceof Error ? eventTypeError.message : 'Please check the value and try again.', variant: 'error' })
      return false
    }
    if (field === 'event_type' && !normalizedValue) {
      notify({ title: 'Event type required', description: 'Enter an event type before saving.', variant: 'error' })
      return false
    }

    if (field === 'address') {
      const currentValue = lead.metadata?.address || ''
      if (normalizeComparableValue(currentValue) === normalizeComparableValue(normalizedValue)) {
        return true
      }

      const previousLead = lead
      try {
        setSavingLeadField(field)
        const updatedMetadata = { ...lead.metadata, address: normalizedValue }
        setLead((current) => current ? { ...current, metadata: updatedMetadata, updated_at: new Date().toISOString() } : current)

        const res = await fetch('/api/inquiries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, metadata: updatedMetadata }),
        })

        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(payload.error || 'Failed to update address detail.')
        }

        const updated = payload as LuxorInquiry
        setLead(updated)
        return true
      } catch (err) {
        console.error(err)
        setLead(previousLead)
        notify({ title: 'Address not saved', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
        return false
      } finally {
        setSavingLeadField(null)
      }
    }

    const eventField = selectedLeadEvent && (field === 'event_type' || field === 'guest_count' || field === 'target_date' || field === 'package_interest')
      ? field
      : null
    if (eventField && selectedLeadEvent) {
      const currentValue = selectedLeadEvent[eventField]
      if (normalizeComparableValue(currentValue) === normalizeComparableValue(normalizedValue)) return true
      const previousEvent = selectedLeadEvent
      try {
        setSavingLeadField(field)
        const nextValue = field === 'guest_count' ? (normalizedValue ? Number(normalizedValue) : null) : normalizedValue
        setLeadEvents((current) => current.map((event) => event.id === selectedLeadEvent.id ? { ...event, [eventField]: nextValue } : event))
        const res = await fetch('/api/lead-events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedLeadEvent.id, inquiry_id: lead.id, [eventField]: nextValue }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(payload.error || 'Failed to update event detail.')
        setLeadEvents((current) => current.map((event) => event.id === payload.id ? payload : event))
        return true
      } catch (err) {
        console.error(err)
        setLeadEvents((current) => current.map((event) => event.id === previousEvent.id ? previousEvent : event))
        notify({ title: 'Event detail not saved', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
        return false
      } finally {
        setSavingLeadField(null)
      }
    }

    const fieldKey = field as Exclude<EditableLeadField, 'address'>
    const currentValue = lead[fieldKey]

    if (normalizeComparableValue(currentValue) === normalizeComparableValue(normalizedValue)) {
      return true
    }

    const previousLead = lead
    try {
      setSavingLeadField(field)
      setLead((current) => current ? { ...current, [fieldKey]: normalizedValue, updated_at: new Date().toISOString() } : current)

      const emailChange = fieldKey === 'email'
      const normalizedEmail = String(normalizedValue ?? '').trim().toLowerCase()
      if (emailChange && (!emailChangeRequestRef.current
        || emailChangeRequestRef.current.previous !== String(previousLead.email || '').toLowerCase()
        || emailChangeRequestRef.current.next !== normalizedEmail)) {
        emailChangeRequestRef.current = {
          previous: String(previousLead.email || '').toLowerCase(),
          next: normalizedEmail,
          requestId: crypto.randomUUID(),
        }
      }
      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          [fieldKey]: emailChange ? normalizedEmail : normalizedValue,
          ...(emailChange ? {
            expectedEmail: emailChangeRequestRef.current?.previous ?? String(previousLead.email || '').toLowerCase(),
            emailChangeRequestId: emailChangeRequestRef.current?.requestId ?? crypto.randomUUID(),
          } : {}),
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update lead detail.')
      }

      const updated = (emailChange ? payload.inquiry : payload) as LuxorInquiry
      setLead(updated)
      if (fieldKey === 'email') {
        emailChangeRequestRef.current = null
        const candidate = payload.resendCandidate as LuxorEmailJob | null
        const candidateMetadata = candidate?.metadata as Record<string, unknown> | null
        const candidateIsAvailable = Boolean(candidate && (
          candidate.status === 'failed'
          || ['queued', 'sending', 'sent'].includes(candidate.status)
          || (candidate.status === 'cancelled' && candidateMetadata?.awaiting_owner_confirmation === true)
        ))
        // Every successful edit replaces the candidate, including edits for
        // which no matching confirmation exists. Never leave an older
        // address or tour revision available for owner confirmation.
        setEmailResendCandidate(candidateIsAvailable ? candidate : null)
        void fetchClientEmailThread(updated.email || '')
      }
      return true
    } catch (err) {
      console.error(err)
      setLead(previousLead)
      notify({ title: 'Lead detail not saved', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
      return false
    } finally {
      setSavingLeadField(null)
    }
  }

  const saveIsolatedTestActivity = async (activityType: string, details: Record<string, unknown>) => {
    if (!activeTestRunId) throw new Error('Start or resume the isolated Test Lead run before saving activity.')
    const response = await fetch('/api/portal/test-lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record_activity', testRunId: activeTestRunId, activityType, details }),
    })
    const payload = await response.json().catch(() => ({})) as { activity?: { id?: string | number; created_at?: string }; error?: string }
    if (!response.ok) throw new Error(payload.error || 'Unable to save isolated Test Lead activity.')
    window.dispatchEvent(new CustomEvent('luxor-test-activity-recorded'))
    return payload.activity || { id: crypto.randomUUID(), created_at: new Date().toISOString() }
  }

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteContent.trim()) return
    try {
      setSubmittingNote(true)
      if (lead && isLuxorTestInquiry(lead)) {
        const activity = await saveIsolatedTestActivity('test_note', { title: noteType.replaceAll('_', ' '), body: noteContent, noteType })
        const note: LuxorNote = {
          id: `test-${activity.id}`,
          created_at: activity.created_at || new Date().toISOString(),
          inquiry_id: lead.id,
          author: 'Test run',
          content: noteContent,
          note_type: noteType,
        }
        setNotes((prev) => [...prev, note])
        setNoteContent('')
        setNoteType('note')
        setActiveFeedTab('notes')
        notify({ title: 'Test activity saved', description: 'Saved with this isolated run; no production note was created.', variant: 'success' })
        return
      }
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: id,
          content: noteContent,
          noteType,
          author: 'Admin Owner',
        }),
      })
      if (!res.ok) throw new Error('Failed to post note.')
      const note = await res.json()
      setNotes((prev) => [...prev, note])
      setNoteContent('')
      setNoteType('note')
      setActiveFeedTab('notes')
      notify({ title: 'Activity saved', variant: 'success' })
    } catch (err) {
      console.error(err)
      notify({ title: 'Note not saved', description: 'Please try again.', variant: 'error' })
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle.trim()) return
    try {
      setSubmittingTask(true)
      if (lead && isLuxorTestInquiry(lead)) {
        const activity = await saveIsolatedTestActivity('test_task', { title: taskTitle, body: taskDesc, dueDate: taskDueDate || null, priority: taskPriority, completionStatus: 'pending' })
        const task: LuxorTask = {
          id: `test-${activity.id}`,
          created_at: activity.created_at || new Date().toISOString(),
          inquiry_id: lead.id,
          title: taskTitle,
          description: taskDesc || null,
          due_date: taskDueDate || null,
          completed_at: null,
          priority: taskPriority,
          status: 'pending',
        }
        setTasks((prev) => [task, ...prev])
        setTaskTitle(''); setTaskDesc(''); setTaskDueDate(''); setTaskPriority('medium')
        notify({ title: 'Test task saved', description: 'Saved with this isolated run; no production task was created.', variant: 'success' })
        return
      }
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: id,
          title: taskTitle,
          description: taskDesc || null,
          dueDate: taskDueDate || null,
          priority: taskPriority,
        }),
      })
      if (!res.ok) throw new Error('Failed to create task.')
      const task = await res.json()
      setTasks((prev) => [task, ...prev])
      setTaskTitle('')
      setTaskDesc('')
      setTaskDueDate('')
      setTaskPriority('medium')
      notify({ title: 'Task created', variant: 'success' })
    } catch (err) {
      console.error(err)
      notify({ title: 'Task not added', description: 'Please try again.', variant: 'error' })
    } finally {
      setSubmittingTask(false)
    }
  }

  const handleToggleTask = async (task: LuxorTask) => {
    try {
      const isCompleted = task.status === 'completed'
      const newStatus = isCompleted ? 'pending' : 'completed'
      const completedAt = isCompleted ? null : new Date().toISOString()

      if (lead && isLuxorTestInquiry(lead)) {
        await saveIsolatedTestActivity(isCompleted ? 'test_task' : 'test_task_completed', {
          title: task.title,
          body: task.description || '',
          dueDate: task.due_date,
          priority: task.priority,
          completionStatus: newStatus,
        })
        setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, status: newStatus, completed_at: completedAt } : item))
        notify({ title: newStatus === 'completed' ? 'Test task completed' : 'Test task reopened', description: 'Saved as isolated Test Lead activity.', variant: 'success' })
        return
      }

      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          status: newStatus,
          completed_at: completedAt,
        }),
      })

      if (!res.ok) throw new Error('Failed to update task.')
      const updated = await res.json()
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      notify({ title: newStatus === 'completed' ? 'Task completed' : 'Task reopened', variant: 'success' })
    } catch (err) {
      console.error(err)
      notify({ title: 'Task not updated', description: 'Please try again.', variant: 'error' })
    }
  }

  const handleInvoiceItemChange = (index: number, field: keyof LuxorInvoiceLineItem, val: string | number) => {
    const updated = [...invoiceItems]
    const item = { ...updated[index] }
    if (field === 'quantity') item.quantity = Math.max(1, Number(val))
    else if (field === 'unitPrice') item.unitPrice = Math.max(0, Number(val))
    else if (field === 'description') item.description = String(val)
    item.total = item.quantity * item.unitPrice
    updated[index] = item
    setInvoiceItems(updated)
  }

  const addInvoiceItem = () => setInvoiceItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, total: 0 }])

  const addCatalogItem = () => {
    const catalogItem = LUXOR_SERVICE_CATALOG.find((item) => item.id === selectedCatalogItem)
    if (!catalogItem) return
    const nextItem = catalogItemToLineItem(catalogItem)
    setInvoiceItems((current) => {
      const replaceBlank = current.length === 1 && !current[0].description.trim() && current[0].unitPrice === 0
      return replaceBlank ? [nextItem] : [...current, nextItem]
    })
    setSelectedCatalogItem('')
  }

  const removeInvoiceItem = (index: number) => {
    if (invoiceItems.length === 1) return
    setInvoiceItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const getInvoiceSubtotal = () => invoiceItems.reduce((acc, item) => acc + item.total, 0)
  const getInvoiceTax = () => getInvoiceSubtotal() * (Math.max(0, Number(invoiceTaxRate) || 0) / 100)
  const getInvoiceTotal = () => getInvoiceSubtotal() + getInvoiceTax()

  const defaultProposalTitle = (fullName?: string | null, requestedEventType?: string | null) => {
    const firstName = String(fullName || '').trim().split(/\s+/)[0] || 'Client'
    const proposalEventType = String(requestedEventType || '').trim() || 'Event'
    return `${firstName}’s ${proposalEventType}`
  }

  const initializeProposalBuilder = (invoice?: LuxorInvoice | null) => {
    if (invoiceSubmitBusy.current) return
    invoiceCreationRequest.current = crypto.randomUUID()
    breakdownCreationRequest.current = null
    savedPublicationInvoice.current = null
    setInvoiceSubmissionError(null)
    setPublicationPending(false)
    setBreakdownPublished(false)
    proposalEditorOpenRef.current = true
    setEditingInvoiceId(invoice?.id || null)
    const sourceEvent = invoice ? findProposalLeadEvent(invoice, leadEvents, bookings) : selectedLeadEvent
    setProposalLeadEventId(invoice ? invoice.lead_event_id || sourceEvent?.id || null : sourceEvent?.id || null)
    setProposalCalculation(null)

    const savedContext = invoice?.proposal_context || null
    const eventDate = String(savedContext?.event_date || sourceEvent?.target_date || (invoice ? '' : lead?.target_date) || '')
    const guestCount = asProposalNumber(savedContext?.expected_guest_count, sourceEvent?.guest_count, invoice ? undefined : lead?.guest_count)
    const requestedRentalPeriod = String(savedContext?.rental_period || sourceEvent?.metadata?.rental_period || 'evening')
    const rentalPeriod = requestedRentalPeriod === 'morning' || requestedRentalPeriod === 'full_day'
      ? requestedRentalPeriod
      : 'evening'
    const packageId = normalizeProposalPackageId(
      savedContext?.package_id
      || invoice?.proposal_context?.package_name
      || sourceEvent?.package_interest
      || (invoice ? null : lead?.package_interest),
    ) || 'rent_only'
    const savedSelection = asProposalRecord(savedContext?.pricing_selection) || {}
    const savedPromotionId = String(savedSelection.promotionId || savedSelection.promotion_id || savedContext?.promotionId || savedContext?.promotion_id || '').trim() || null
    const sourceMetadata = sourceEvent?.metadata || {}
    const eventPlanningTimes = resolveLuxorEventPlanningTimes(sourceMetadata, savedContext)
    const hasMetadataRentalStartTime = Object.prototype.hasOwnProperty.call(sourceMetadata, 'venue_access_time')
    const hasMetadataGuestArrivalTime = Object.prototype.hasOwnProperty.call(sourceMetadata, 'event_time')
    const sourceEventHasBooking = Boolean(sourceEvent && bookings.some(
      (booking) => booking.lead_event_id === sourceEvent.id && booking.status !== 'cancelled',
    ))
    const canSyncPlanningTimes = !sourceEventHasBooking && (!invoice || Boolean(
      !invoice.price_locked_at
      && !invoice.proposal_sent_at
      && !invoice.proposal_accepted_at
      && invoice.status === 'draft',
    ))
    proposalTimingBaselineRef.current = createLuxorEventPlanningTimeBaseline(sourceEvent?.id, sourceMetadata)
    const nextContext: ProposalBuilderContext = {
      version: asProposalNumber(savedContext?.version, 1) || 1,
      event_type: String(savedContext?.event_type || invoice?.event_type || sourceEvent?.event_type || (invoice ? 'Event' : lead?.event_type) || 'Event Booking'),
      ...(eventDate ? { event_date: eventDate } : {}),
      ...(guestCount ? { expected_guest_count: guestCount } : {}),
      rental_period: rentalPeriod,
      package_id: packageId,
      package_name: String(savedContext?.package_name || packageId.replace('_', ' ')),
      ...savedContext,
      ...(canSyncPlanningTimes && (hasMetadataRentalStartTime || eventPlanningTimes.venueAccessTime)
        ? { rental_start_time: eventPlanningTimes.venueAccessTime, start_time: eventPlanningTimes.venueAccessTime }
        : {}),
      ...(canSyncPlanningTimes && (hasMetadataGuestArrivalTime || eventPlanningTimes.eventTime)
        ? { guest_arrival_time: eventPlanningTimes.eventTime, guestArrivalTime: eventPlanningTimes.eventTime }
        : {}),
      pricing_selection: { ...savedSelection },
      ...(!invoice && !savedContext?.payment_plan ? { payment_plan: { ...DEFAULT_NEW_PROPOSAL_PAYMENT_PLAN } } : {}),
    }
    setProposalContext(nextContext)
    setSelectedProposalPackageId(packageId)
    setSelectedProposalPromotionId(savedPromotionId)
    setProposalGuestCount(guestCount ? String(guestCount) : '')

    if (invoice) {
      const expiry = invoice.offer_expires_at ? new Date(invoice.offer_expires_at) : null
      const expiryTime = expiry && !Number.isNaN(expiry.getTime())
        ? String(expiry.getHours()).padStart(2, '0') + ':' + String(expiry.getMinutes()).padStart(2, '0')
        : DEFAULT_OFFER_EXPIRY_TIME
      const lineItems = Array.isArray(invoice.line_items) && invoice.line_items.length
        ? invoice.line_items.map((item) => ({
            ...item,
            quantity: Math.max(1, Number(item.quantity) || 1),
            unitPrice: Math.max(0, Number(item.unitPrice) || 0),
            total: Math.round((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0) * 100) / 100,
          }))
        : [{ description: '', quantity: 1, unitPrice: 0, total: 0 }]

      // Older drafts can have an invoice record without a title. Treat that
      // the same as a new proposal so the owner starts with a real editable
      // value (not only a placeholder), while never replacing an existing
      // custom title.
      setInvoiceDesc(invoice.description?.trim() || defaultProposalTitle(lead?.full_name, invoice.event_type || sourceEvent?.event_type || lead?.event_type || 'Event'))
      setInvoiceDueDate(invoice.due_date || expiry?.toISOString().slice(0, 10) || '')
      setInvoiceOfferExpiryTime(normalizeOfferExpiryTime(expiryTime))
      const discountType = invoice.discount_type === 'fixed' ? 'fixed' : 'percent'
      const discountValue = asProposalNumber(invoice.discount_value, invoice.discount_percent, 0) || 0
      setInvoiceDiscountType(discountType)
      setInvoiceDiscountValue(String(discountValue))
      setInvoiceDiscountPercent(String(discountType === 'percent' ? discountValue : 0))
      setInvoiceItems(lineItems)
      setInvoiceNotes(invoice.notes || '')
      setInvoiceTaxRate(String(Number(invoice.tax_rate || 0) * 100))
      setLegacyProposalDiscount(!savedPromotionId && discountValue > 0 ? { type: discountType, value: discountValue } : null)
    } else {
      setInvoiceDesc(defaultProposalTitle(lead?.full_name, currentEventType || 'Event'))
      setInvoiceDueDate('')
      setInvoiceOfferExpiryTime(DEFAULT_OFFER_EXPIRY_TIME)
      setInvoiceDiscountType('percent')
      setInvoiceDiscountValue('0')
      setInvoiceDiscountPercent('0')
      // A genuinely new proposal starts without a previous quote's amounts.
      // Dossier summary line items can be stale; only an explicit duplicate
      // action should copy a saved proposal into a new draft.
      setInvoiceItems([{ description: '', quantity: 1, unitPrice: 0, total: 0 }])
      setInvoiceNotes('')
      setInvoiceTaxRate(DEFAULT_TEXAS_SALES_TAX_RATE_PERCENT)
      setLegacyProposalDiscount(null)
    }

    setIsInvoiceModalOpen(true)
  }

  const openProposalBuilder = async (invoice?: LuxorInvoice | null) => {
    if (!lead || !isLuxorTestInquiry(lead)) {
      setTestProposalReadOnly(false)
      initializeProposalBuilder(invoice)
      return
    }
    if (!activeTestRunId) {
      notify({ title: 'Test run is not ready', description: loadingTestRun ? 'The isolated Test Lead run is being prepared. Try again in a moment.' : 'Start or resume the isolated Test Lead run before opening its proposal.', variant: 'warning' })
      return
    }
    if (testProposalLoadBusyRef.current) return
    testProposalLoadBusyRef.current = true
    try {
      const response = await fetch(`/api/portal/test-lead/proposal?testRunId=${encodeURIComponent(activeTestRunId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { artifact?: { status?: string; revision?: number; details?: { invoice?: unknown } | null }; error?: string }
      if (!response.ok) throw new Error(payload.error || 'The test proposal could not be loaded.')
      setTestProposalRevision(payload.artifact?.revision ?? 0)
      const artifactStatus = payload.artifact?.status
      setTestProposalReadOnly(Boolean(artifactStatus && !['simulated', 'drafted'].includes(artifactStatus)))
      const savedInvoice = payload.artifact?.details?.invoice
      initializeProposalBuilder(savedInvoice && typeof savedInvoice === 'object' ? savedInvoice as LuxorInvoice : null)
    } catch (error) {
      notify({ title: 'Test proposal unavailable', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      testProposalLoadBusyRef.current = false
    }
  }

  useEffect(() => {
    if (!lead || !isLuxorTestInquiry(lead) || !activeTestRunId || searchParams?.get('createTestProposal') !== '1'
      || (requestedTestRunId && requestedTestRunId !== activeTestRunId)) return
    const requestKey = `${lead.id}:${activeTestRunId}`
    if (testProposalOpenRequestRef.current === requestKey) return
    testProposalOpenRequestRef.current = requestKey
    void (async () => {
      try {
        const response = await fetch(`/api/portal/test-lead/proposal?testRunId=${encodeURIComponent(activeTestRunId)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({})) as { artifact?: { status?: string; revision?: number; details?: { invoice?: unknown } | null }; error?: string }
        if (!response.ok) throw new Error(payload.error || 'The test proposal could not be loaded.')
        setTestProposalRevision(payload.artifact?.revision ?? 0)
        const artifactStatus = payload.artifact?.status
        setTestProposalReadOnly(Boolean(artifactStatus && !['simulated', 'drafted'].includes(artifactStatus)))
        const savedInvoice = payload.artifact?.details?.invoice
        if (savedInvoice && typeof savedInvoice === 'object') openProposalBuilder(savedInvoice as LuxorInvoice)
        else openProposalBuilder()
      } catch (error) {
        notify({ title: 'Test proposal unavailable', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
      }
    })()
  }, [lead, notify, openProposalBuilder, activeTestRunId, requestedTestRunId, searchParams])

  const duplicateProposalDraft = (invoice: LuxorInvoice) => {
    openProposalBuilder()
    const sourceEvent = findProposalLeadEvent(invoice, leadEvents, bookings)
    const duplicateEventId = invoice.lead_event_id || sourceEvent?.id || null
    const duplicateTargetEvent = duplicateEventId ? leadEvents.find((event) => event.id === duplicateEventId) || sourceEvent : sourceEvent
    const savedContext = asProposalRecord(invoice.proposal_context) || {}
    const duplicatePlanningTimes = resolveLuxorEventPlanningTimes(duplicateTargetEvent?.metadata, savedContext)
    const duplicateCanSyncPlanningTimes = Boolean(
      duplicateTargetEvent
      && !hasActiveLuxorEventBooking(duplicateTargetEvent.id, bookings),
    )
    proposalTimingBaselineRef.current = createLuxorEventPlanningTimeBaseline(duplicateEventId, duplicateTargetEvent?.metadata)
    const savedSelection = asProposalRecord(savedContext.pricing_selection) || {}
    const promotionSnapshot = asProposalRecord(invoice.promotion_snapshot) || {}
    const savedPromotionId = String(savedSelection.promotionId || savedSelection.promotion_id || savedContext.promotionId || savedContext.promotion_id || invoice.promotion_id || promotionSnapshot.id || '').trim() || null
    const packageId = normalizeProposalPackageId(savedContext.package_id || savedContext.package_name) || 'rent_only'
    const rentalPeriod = String(savedContext.rental_period || sourceEvent?.metadata?.rental_period || 'evening')
    const sourceRentalPeriod = sourceEvent?.metadata?.rental_period
    const sourceRentalPeriodFallback = sourceRentalPeriod === 'morning' || sourceRentalPeriod === 'full_day' || sourceRentalPeriod === 'custom' || sourceRentalPeriod === 'evening'
      ? sourceRentalPeriod
      : 'evening'
    const savedLineItems = Array.isArray(invoice.line_items) ? invoice.line_items : []
    const duplicateSelection = getDuplicatedProposalSelection(savedSelection, savedLineItems)
    const discountType = invoice.discount_type === 'fixed' ? 'fixed' : 'percent'
    const discountValue = asProposalNumber(invoice.discount_value, invoice.discount_percent, 0) || 0
    const nextContext: ProposalBuilderContext = {
      version: 1,
      event_type: String(savedContext.event_type || invoice.event_type || sourceEvent?.event_type || 'Event Booking'),
      ...(savedContext.event_date || savedContext.eventDate || sourceEvent?.target_date ? { event_date: String(savedContext.event_date || savedContext.eventDate || sourceEvent?.target_date) } : {}),
      ...(asProposalNumber(savedContext.expected_guest_count, sourceEvent?.guest_count) ? { expected_guest_count: asProposalNumber(savedContext.expected_guest_count, sourceEvent?.guest_count)! } : {}),
      rental_period: rentalPeriod === 'morning' || rentalPeriod === 'full_day' || rentalPeriod === 'custom' || rentalPeriod === 'evening' ? rentalPeriod : sourceRentalPeriodFallback,
      ...(savedContext.event_access ? { event_access: String(savedContext.event_access) } : {}),
      ...getDuplicatedProposalTimingContext(savedContext),
      ...(duplicateCanSyncPlanningTimes && Object.prototype.hasOwnProperty.call(duplicateTargetEvent?.metadata || {}, 'venue_access_time')
        ? { rental_start_time: duplicatePlanningTimes.venueAccessTime, start_time: duplicatePlanningTimes.venueAccessTime }
        : {}),
      ...(duplicateCanSyncPlanningTimes && Object.prototype.hasOwnProperty.call(duplicateTargetEvent?.metadata || {}, 'event_time')
        ? { guest_arrival_time: duplicatePlanningTimes.eventTime, guestArrivalTime: duplicatePlanningTimes.eventTime }
        : {}),
      package_id: packageId,
      package_name: String(savedContext.package_name || packageId.replace('_', ' ')),
      pricing_selection: duplicateSelection,
      ...(savedPromotionId ? { promotion_id: savedPromotionId } : {}),
      ...(savedContext.payment_plan && typeof savedContext.payment_plan === 'object'
        ? { payment_plan: savedContext.payment_plan as ProposalBuilderContext['payment_plan'] }
        : {}),
    }
    const lineItems = savedLineItems.length
      ? savedLineItems.filter((item) => !isPreferredVendorEstimateLine(item)).map((item) => ({ ...item }))
      : [{ description: '', quantity: 1, unitPrice: 0, total: 0 }]

    setProposalContext(nextContext)
    setProposalLeadEventId(duplicateEventId)
    setSelectedProposalPackageId(packageId)
    setSelectedProposalPromotionId(savedPromotionId)
    setProposalGuestCount(asProposalNumber(savedContext.expected_guest_count, sourceEvent?.guest_count) ? String(asProposalNumber(savedContext.expected_guest_count, sourceEvent?.guest_count)) : '')
    setInvoiceDesc(`${invoice.description?.trim() || defaultProposalTitle(lead?.full_name, invoice.event_type || lead?.event_type || 'Event')} copy`)
    setInvoiceDueDate('')
    setInvoiceOfferExpiryTime(DEFAULT_OFFER_EXPIRY_TIME)
    setInvoiceDiscountType(discountType)
    setInvoiceDiscountValue(String(discountValue))
    setInvoiceDiscountPercent(String(discountType === 'percent' ? discountValue : 0))
    setInvoiceItems(lineItems)
    setInvoiceNotes(invoice.notes || '')
    setInvoiceTaxRate(String(Math.max(0, Number(invoice.tax_rate || 0)) * 100))
    setLegacyProposalDiscount(!savedPromotionId && discountValue > 0 ? { type: discountType, value: discountValue } : null)
  }

  const handleProposalCalculationChange = (calculation: ProposalPricingCalculation | null) => {
    setProposalCalculation(calculation)
    if (!calculation) return

    const activePackageId = normalizeProposalPackageId(selectedProposalPackageId || proposalContext?.package_id)
    const selectedPackage = calculation.packages?.find((candidate) => normalizeProposalPackageId(candidate.id) === activePackageId)
    const calculationRecord = calculation as Record<string, unknown>
    const calculationContext = calculation.context || {}
    const calculationContextRecord = calculationContext as Record<string, unknown>
    const selectedPackageRecord = asProposalRecord(selectedPackage)
    const calculatedItems = selectedPackage?.lineItems?.length
      ? selectedPackage.lineItems
      : calculation.lineItems || []

    if (calculatedItems.length) {
      setInvoiceItems(calculatedItems.map((item) => ({
        ...item,
        quantity: Math.max(1, Number(item.quantity) || 1),
        // The server calculator owns pricing. Preserve an approved negative
        // adjustment here so the owner-facing review remains reconciled with
        // the immutable final proposal rather than turning a discount into $0.
        unitPrice: Math.round((Number(item.unitPrice) || 0) * 100) / 100,
        total: Math.round((Number(item.total ?? ((Number(item.quantity) || 1) * (Number(item.unitPrice) || 0))) || 0) * 100) / 100,
      })))
    }

    const calculatedTaxRate = asProposalNumber(
      selectedPackageRecord?.tax_rate,
      selectedPackageRecord?.taxRate,
      calculationContextRecord.tax_rate,
      calculationRecord.tax_rate,
    )
    if (calculatedTaxRate !== undefined) {
      setInvoiceTaxRate(String(calculatedTaxRate <= 1 ? calculatedTaxRate * 100 : calculatedTaxRate))
    }

    const calculationDiscount = asProposalRecord(calculationRecord.discount)
    const contextDiscount = asProposalRecord(calculationContextRecord.discount)
    const calculatedDiscountType = calculationDiscount?.type === 'fixed' || contextDiscount?.type === 'fixed' || calculationContextRecord.discount_type === 'fixed'
      ? 'fixed'
      : 'percent'
    const calculatedDiscountValue = asProposalNumber(
      calculationDiscount?.value,
      contextDiscount?.value,
      calculationContextRecord.discount_value,
      calculationContextRecord.discount_percent,
    )
    if (calculatedDiscountValue !== undefined) {
      setInvoiceDiscountType(calculatedDiscountType)
      setInvoiceDiscountValue(String(calculatedDiscountValue))
      setInvoiceDiscountPercent(String(calculatedDiscountType === 'percent' ? calculatedDiscountValue : 0))
    }

    setProposalContext((current) => {
      const currentSelection = asProposalRecord(current?.pricing_selection) || {}
      const calculatedSelection = asProposalRecord(calculationContext.pricing_selection) || {}
      // A calculation response can finish just after the owner adds, edits, or
      // removes a custom row. Keep the locally selected custom list in that
      // race so a stale response cannot resurrect a removed charge.
      const currentCustomItems = Array.isArray(currentSelection.customItems)
        ? currentSelection.customItems
        : Array.isArray(currentSelection.custom_items)
          ? currentSelection.custom_items
          : undefined
      // Treat a deliberately empty removal list as meaningful too. Without
      // this, an older calculation response can put an item back after the
      // owner has restored it (or remove one again after the owner kept it).
      const currentRemovedServiceIds = Array.isArray(currentSelection.removedServiceIds)
        ? currentSelection.removedServiceIds
        : Array.isArray(currentSelection.removed_service_ids)
          ? currentSelection.removed_service_ids
          : undefined
      // Calculation responses arrive asynchronously. A response that began
      // before the owner selected (or completed) Step 5 has no valid payment
      // plan yet, so it must never erase the in-progress owner input.
      const currentPaymentPlan = current?.payment_plan
      const calculatedPaymentPlan = calculationContext.payment_plan
      return {
        ...current,
        ...calculationContext,
        ...(current && (Object.prototype.hasOwnProperty.call(current, 'rental_start_time') || Object.prototype.hasOwnProperty.call(current, 'start_time'))
          ? {
              rental_start_time: Object.prototype.hasOwnProperty.call(current, 'rental_start_time') ? current.rental_start_time : current.start_time,
              start_time: Object.prototype.hasOwnProperty.call(current, 'start_time') ? current.start_time : current.rental_start_time,
            }
          : {}),
        ...(current && (Object.prototype.hasOwnProperty.call(current, 'guest_arrival_time') || Object.prototype.hasOwnProperty.call(current, 'guestArrivalTime'))
          ? {
              guest_arrival_time: Object.prototype.hasOwnProperty.call(current, 'guest_arrival_time') ? current.guest_arrival_time : current.guestArrivalTime,
              guestArrivalTime: Object.prototype.hasOwnProperty.call(current, 'guestArrivalTime') ? current.guestArrivalTime : current.guest_arrival_time,
            }
          : {}),
        ...(currentPaymentPlan && !calculatedPaymentPlan ? { payment_plan: currentPaymentPlan } : {}),
        package_id: activePackageId || normalizeProposalPackageId(calculationContext.package_id) || current?.package_id,
        pricing_selection: {
          ...currentSelection,
          ...calculatedSelection,
          ...proposalDecorSelection(currentSelection),
          ...(currentCustomItems ? { customItems: currentCustomItems } : {}),
          ...(currentRemovedServiceIds ? {
            removedServiceIds: currentRemovedServiceIds,
            removed_service_ids: currentRemovedServiceIds,
          } : {}),
        },
      }
    })
  }

  const buildProposalSelection = () => {
    const calculationContext = proposalCalculation?.context || {}
    const context = proposalContext || calculationContext
    const contextSelection = asProposalRecord(context.pricing_selection)
    const calculationSelection = asProposalRecord(calculationContext.pricing_selection)
    const packageId = engineProposalPackageId(selectedProposalPackageId || context.package_id || calculationContext.package_id)
    const eventDate = String(context.event_date || calculationContext.event_date || currentEventDate || '')
    const guestCount = asProposalNumber(context.expected_guest_count, calculationContext.expected_guest_count, proposalGuestCount)
    const rentalPeriod = context.rental_period || calculationContext.rental_period || 'evening'
    const addOns = proposalServiceIds(contextSelection).length
      ? proposalServiceIds(contextSelection)
      : proposalServiceIds(calculationSelection)
    const removedServiceIds = hasProposalRemovedServiceIds(contextSelection)
      ? proposalRemovedServiceIds(contextSelection)
      : proposalRemovedServiceIds(calculationSelection)
    const customItems = Array.isArray(contextSelection?.customItems)
      ? contextSelection.customItems
      : Array.isArray(contextSelection?.custom_items)
        ? contextSelection.custom_items
        : Array.isArray(calculationSelection?.customItems)
          ? calculationSelection.customItems
          : Array.isArray(calculationSelection?.custom_items)
            ? calculationSelection.custom_items
            : undefined
    const paymentPlan = asProposalRecord(context.payment_plan || calculationContext.payment_plan)
    const rawPackageTier = contextSelection?.packageTierId !== undefined
      ? contextSelection.packageTierId
      : contextSelection?.package_tier_id !== undefined
        ? contextSelection.package_tier_id
        : context.package_tier_id !== undefined
          ? context.package_tier_id
          : calculationSelection?.packageTierId !== undefined
            ? calculationSelection.packageTierId
            : calculationSelection?.package_tier_id !== undefined
              ? calculationSelection.package_tier_id
              : calculationContext.package_tier_id
    const packageTierId = normalizeLuxorProposalPackageTierId(rawPackageTier)
    const proposalPricingPolicyVersion = asProposalNumber(
      context.proposal_pricing_policy_version,
      contextSelection?.proposal_pricing_policy_version,
      calculationContext.proposal_pricing_policy_version,
      calculationSelection?.proposal_pricing_policy_version,
    )
    if (proposalPricingPolicyVersion !== undefined && proposalPricingPolicyVersion >= 4 && !packageTierId) {
      throw new Error('Choose Essentials, Signature, Luxor, or Customized before saving this proposal.')
    }
    const promotionId = selectedProposalPromotionId
      || String(contextSelection?.promotionId || contextSelection?.promotion_id || calculationSelection?.promotionId || calculationSelection?.promotion_id || '').trim()
    const hasRentalStartTime = Object.prototype.hasOwnProperty.call(context, 'rental_start_time')
    const hasStartTime = Object.prototype.hasOwnProperty.call(context, 'start_time')
    const hasGuestArrivalTime = Object.prototype.hasOwnProperty.call(context, 'guest_arrival_time')
    const hasGuestArrivalTimeAlias = Object.prototype.hasOwnProperty.call(context, 'guestArrivalTime')
    const resolvedRentalStartTime = hasRentalStartTime
      ? context.rental_start_time
      : hasStartTime
        ? context.start_time
        : context.guest_arrival_time || context.guestArrivalTime || calculationContext.rental_start_time || calculationContext.start_time || ''
    const resolvedGuestArrivalTime = hasGuestArrivalTime
      ? context.guest_arrival_time
      : hasGuestArrivalTimeAlias
        ? context.guestArrivalTime
        : ''

    return {
      packageId,
      ...(packageTierId ? { packageTierId, package_tier_id: packageTierId } : {}),
      eventDate,
      guestCount,
      eventType: context.event_type || currentEventType || null,
      rentalPeriod,
      rentalStartTime: String(resolvedRentalStartTime || ''),
      rentalEndTime: String(context.rental_end_time || context.end_time || context.event_end_time || context.eventEndTime || calculationContext.rental_end_time || calculationContext.end_time || ''),
      guestArrivalTime: String(resolvedGuestArrivalTime || ''),
      eventEndTime: String(context.event_end_time || context.eventEndTime || ''),
      addOns,
      ...proposalDecorSelection(calculationSelection),
      ...proposalDecorSelection(contextSelection),
      ...(hasProposalRemovedServiceIds(contextSelection) || removedServiceIds.length ? { removedServiceIds } : {}),
      ...(promotionId ? { promotionId } : {}),
      taxCoveragePromotionId: contextSelection?.taxCoveragePromotionId ?? contextSelection?.tax_coverage_promotion_id ?? null,
      taxRate: invoiceTaxRate.trim() === '' ? null : Math.max(0, Number(invoiceTaxRate) || 0),
      ...(proposalPricingPolicyVersion !== undefined ? { proposalPricingPolicyVersion } : {}),
      ...(customItems ? { customItems } : {}),
      ...(paymentPlan ? { paymentPlan } : {}),
    }
  }

  const handleSendProposalBreakdown = async (invoice: LuxorInvoice, recipientEmail: string) => {
    const response = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/breakdown-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientEmail }),
    })
    const payload = await response.json().catch(() => ({})) as { invoice?: LuxorInvoice; reviewUrl?: string; alreadyCompleted?: boolean; error?: string }
    if (!response.ok || !payload.invoice || !payload.reviewUrl) {
      throw new Error(payload.error || 'The Proposal Breakdown email could not be confirmed. Retry to recover its saved result.')
    }
    savedPublicationInvoice.current = payload.invoice
    setInvoices((previous) => [payload.invoice!, ...previous.filter((item) => item.id !== payload.invoice!.id)])
    setPublicationPending(true)
    setBreakdownPublished(true)
    setInvoiceSubmissionError(null)
    void fetchAllData(false)
    notify({
      title: payload.alreadyCompleted ? 'Proposal Breakdown already sent' : 'Proposal Breakdown sent',
      description: 'The selected package and private Book Now link are saved. Continue to the final step if you also want to email the individual proposal.',
      variant: 'success',
    })
  }

  const handleCreateInvoice = async (action: 'save' | 'email' | 'in_person' | 'breakdown', details?: { recipientEmail?: string }) => {
    if (!lead || invoiceSubmitBusy.current) return
    invoiceSubmitBusy.current = true
    setSubmittingInvoice(true)
    setInvoiceSubmissionError(null)
    let handoffWindow: Window | null = null
    let planningTimesSavedBeforeProposal = false
    try {
      if (isLuxorTestInquiry(lead)) {
        if (action === 'breakdown') throw new Error('Proposal Breakdown email delivery is disabled for isolated Test Leads. Use the preview only.')
        if (!activeTestRunId) throw new Error('Start or resume the isolated Test Lead run before saving this proposal.')
        if (action === 'in_person') throw new Error('In-person handoff and signing are blocked for the permanent test lead.')
        if (!invoiceDueDate) throw new Error('Choose when this proposal offer expires before saving it.')
        const response = await fetch('/api/portal/test-lead/proposal', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testRunId: activeTestRunId,
            action: action === 'save' ? 'save' : 'publish',
            expectedRevision: testProposalRevision,
            description: invoiceDesc,
            notes: invoiceNotes || null,
            selection: buildProposalSelection(),
          }),
        })
        const payload = await response.json().catch(() => ({})) as { error?: string; recipient?: string; revision?: number; replayed?: boolean }
        if (!response.ok) throw new Error(payload.error || 'The isolated test proposal could not be saved or published.')
        setTestProposalRevision(payload.revision ?? testProposalRevision + 1)
        notify({
          title: action === 'save' ? 'Test proposal draft saved' : 'Test proposal published',
          description: action === 'save'
            ? 'The calculated proposal and production-rendered PDF are stored in this test run only.'
            : `The production-rendered proposal email and PDF are queued only for ${payload.recipient || 'luxoratlaspalmas@gmail.com'}. No customer or financial workflow was started.`,
          variant: 'success',
        })
        setIsInvoiceModalOpen(false)
        setEditingInvoiceId(null)
        return
      }
      if (action === 'in_person') handoffWindow = window.open('about:blank', 'luxor-client-handoff')
      if (savedPublicationInvoice.current) {
        if (action === 'breakdown') {
          await handleSendProposalBreakdown(savedPublicationInvoice.current, String(details?.recipientEmail || lead.email || ''))
          return
        }
        if (action === 'in_person') await prepareClientProposalHandoff(savedPublicationInvoice.current, handoffWindow)
        else await handleSendFinalProposal(savedPublicationInvoice.current, true)
        setIsInvoiceModalOpen(false)
        setEditingInvoiceId(null)
        return
      }
      if (!invoiceDueDate) {
        throw new Error('Choose when this proposal offer expires before saving it.')
      }
      setSubmittingInvoice(true)
      const taxRate = invoiceTaxRate.trim() === '' ? null : Math.max(0, Number(invoiceTaxRate) || 0) / 100
      const offerExpiresAt = invoiceDueDate
        ? new Date(invoiceDueDate + 'T' + (invoiceOfferExpiryTime || DEFAULT_OFFER_EXPIRY_TIME) + ':00').toISOString()
        : null
      const editingInvoice = editingInvoiceId ? invoices.find((invoice) => invoice.id === editingInvoiceId) || null : null
      const createRevision = Boolean(editingInvoice && (
        editingInvoice.price_locked_at
        || editingInvoice.proposal_sent_at
        || editingInvoice.status === 'sent'
      ))
      if (action === 'breakdown' && createRevision) {
        throw new Error('Use the final proposal action to publish revised pricing through the existing revision flow.')
      }
      const updateExistingDraft = Boolean(editingInvoice && !createRevision)
      const proposalSelection = buildProposalSelection()
      const syncEventPlanningTimes = Boolean(
        action === 'save'
        && proposalLeadEventId
        && !createRevision
        && !hasActiveLuxorEventBooking(proposalLeadEventId, bookingsRef.current)
        && (!editingInvoice || (
          editingInvoice.status === 'draft'
          && !editingInvoice.price_locked_at
          && !editingInvoice.proposal_sent_at
          && !editingInvoice.proposal_accepted_at
        )),
      )
      if (syncEventPlanningTimes && proposalLeadEventId) {
        const baseline = proposalTimingBaselineRef.current
        const targetEvent = leadEvents.find((event) => event.id === proposalLeadEventId)
        if (!baseline || baseline.eventId !== proposalLeadEventId || !targetEvent) {
          throw new Error('The selected event changed while this proposal was open. Close and reopen the proposal before saving its times.')
        }
        const currentTimes = resolveLuxorEventPlanningTimes(targetEvent.metadata)
        const proposedTimes = {
          venueAccessTime: String(proposalSelection.rentalStartTime || '').trim(),
          eventTime: String(proposalSelection.guestArrivalTime || '').trim(),
        }
        if (hasLuxorEventPlanningTimeConflict({ current: currentTimes, baseline, proposed: proposedTimes })) {
          throw new Error('Event Details changed while this proposal was open. Close and reopen the proposal to review the latest saved times before saving.')
        }
      }
      const selectedPackage = proposalCalculation?.packages?.find((candidate) => (
        normalizeProposalPackageId(candidate.id) === normalizeProposalPackageId(selectedProposalPackageId || proposalContext?.package_id)
      ))
      const displayedFinalPrice = asProposalNumber(
        selectedPackage?.finalEventPrice,
        proposalCalculation?.context?.final_event_price,
        proposalContext?.final_event_price,
      )

      if (syncEventPlanningTimes && proposalLeadEventId) {
        const savedTimes = await handleEventPlanningTimeUpdate(buildLuxorEventPlanningTimePatch({
          venueAccessTime: String(proposalSelection.rentalStartTime || ''),
          eventTime: String(proposalSelection.guestArrivalTime || ''),
        }), proposalLeadEventId)
        if (!savedTimes) throw new Error('The proposal times could not be linked to Event Details, so the proposal was not saved. Please retry after checking the selected event.')
        planningTimesSavedBeforeProposal = true
      }

      const res = await fetch('/api/invoices', {
        method: updateExistingDraft ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(updateExistingDraft && editingInvoiceId
            ? { id: editingInvoiceId }
            : action === 'breakdown'
              ? { creation_request_id: breakdownCreationRequest.current ||= crypto.randomUUID() }
              : { creation_request_id: invoiceCreationRequest.current ||= crypto.randomUUID() }),
          ...(createRevision && editingInvoice ? { supersedes_invoice_id: editingInvoice.id } : {}),
          client_name: lead.full_name,
          event_type: proposalContext?.event_type || currentEventType || 'Event Booking',
          description: invoiceDesc || (editingInvoice ? editingInvoice.description || null : defaultProposalTitle(lead.full_name, currentEventType || 'Event')),
          line_items: invoiceItems,
          tax_rate: taxRate,
          due_date: invoiceDueDate || null,
          offer_expires_at: offerExpiresAt,
          proposal_selection: proposalSelection,
          ...(action === 'breakdown' ? { proposal_record_type: 'proposal_breakdown' } : {}),
          inquiry_id: id,
          lead_event_id: proposalLeadEventId,
          notes: invoiceNotes || null,
        }),
      })

      const responseBody = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(responseBody.error || ('Failed to ' + (updateExistingDraft ? 'update' : 'create') + ' final proposal.'))
      if (!responseBody.id || !responseBody.proposal_context) throw new Error('The save response was interrupted. Retry to recover the same proposal.')
      const invoice = responseBody as LuxorInvoice
      setInvoices((prev) => [invoice, ...prev.filter(item => item.id !== invoice.id)])
      setActiveLeadTab('proposals')
      if (action !== 'save') {
        savedPublicationInvoice.current = invoice
        setPublicationPending(true)
      }
      // Optional dossier summaries cannot turn a successful save into a duplicate retry.
      if (action !== 'breakdown' && (selectedLeadEvent?.id || null) === proposalLeadEventId) {
        await (selectedLeadEvent
          ? handleEventMetadataUpdate({ proposalLineItems: invoice.line_items, proposalTaxRate: Number(invoice.tax_rate || 0) })
          : handleMetadataUpdate({ proposalLineItems: invoice.line_items, proposalTaxRate: Number(invoice.tax_rate || 0) }))
          .catch(error => console.error('Proposal saved; dossier summary refresh failed:', error))
      }
      if (action === 'breakdown') {
        await handleSendProposalBreakdown(invoice, String(details?.recipientEmail || lead.email || ''))
        return
      }
      if (action === 'email') await handleSendFinalProposal(invoice, true)
      if (action === 'in_person') await prepareClientProposalHandoff(invoice, handoffWindow)
      if (action === 'save') {
        notify({
          title: 'Final proposal saved',
          description: `${displayedFinalPrice === undefined ? 'The final price' : formatMoney(displayedFinalPrice)} is ready to review or publish.`,
          variant: 'success',
        })
        setProposalDeliveryPreview({ invoice, initialTab: 'email' })
      }
      setIsInvoiceModalOpen(false)
      setEditingInvoiceId(null)
      if (createRevision) void fetchAllData(false)
    } catch (err) {
      handoffWindow?.close()
      const errorMessage = err instanceof Error ? err.message : 'Review the proposal fields and try again.'
      const message = planningTimesSavedBeforeProposal && !savedPublicationInvoice.current
        ? `Event times were saved to Event Details, but the proposal was not saved. ${errorMessage}`
        : errorMessage
      setInvoiceSubmissionError(message)
      notify({ title: savedPublicationInvoice.current ? 'Proposal saved; delivery incomplete' : 'Final proposal not saved', description: message, variant: 'error' })
    } finally {
      invoiceSubmitBusy.current = false
      setSubmittingInvoice(false)
    }
  }

  const createFlowNote = async (content: string, noteType: LuxorNote['note_type'] = 'note') => {
    if (lead && isLuxorTestInquiry(lead)) {
      const activity = await saveIsolatedTestActivity('test_note', { title: noteType.replaceAll('_', ' '), body: content, noteType })
      return {
        id: `test-${activity.id}`,
        created_at: activity.created_at || new Date().toISOString(),
        inquiry_id: lead.id,
        author: 'Test run',
        content,
        note_type: noteType,
      } satisfies LuxorNote
    }
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiryId: id,
        content,
        noteType,
        author: 'Admin Owner',
      }),
    })
    if (!res.ok) throw new Error('Failed to write activity note.')
    return await res.json() as LuxorNote
  }

  const createFlowTask = async (title: string, description: string, priority: LuxorTask['priority'] = 'medium') => {
    if (lead && isLuxorTestInquiry(lead)) {
      const activity = await saveIsolatedTestActivity('test_task', { title, body: description, priority, completionStatus: 'pending' })
      return {
        id: `test-${activity.id}`,
        created_at: activity.created_at || new Date().toISOString(),
        inquiry_id: lead.id,
        title,
        description,
        due_date: null,
        completed_at: null,
        priority,
        status: 'pending',
      } satisfies LuxorTask
    }
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiryId: id,
        title,
        description,
        priority,
      }),
    })
    if (!res.ok) throw new Error('Failed to create follow-up task.')
    return await res.json() as LuxorTask
  }

  const handleGuidedStatusChange = async (newStatus: LuxorInquiry['status']) => {
    const statusUpdated = await handleStatusChange(newStatus)
    if (!statusUpdated) return

    try {
      if (newStatus === 'contacted') {
        const task = await createFlowTask('Confirm tour date or next decision', 'Follow up with the client to lock the next step after first outreach.', 'high')
        setTasks((prev) => [task, ...prev])
      } else if (newStatus === 'tour_confirmed') {
        const task = await createFlowTask('Prepare tour recap and proposal numbers', 'Capture tour notes, pricing assumptions, and package fit before sending the proposal.', 'high')
        setTasks((prev) => [task, ...prev])
      } else if (newStatus === 'proposal_sent') {
        const task = await createFlowTask('Follow up on proposal decision', 'Check for objections, confirm package fit, and move toward booking.', 'high')
        setTasks((prev) => [task, ...prev])
      }
    } catch (err) {
      console.error(err)
    }
  }

  const getInvoicePaidTotal = (invoiceId: string) => eventPayments
    .filter((payment) => payment.invoice_id === invoiceId && payment.status === 'paid')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  const getInvoiceBalance = (invoice: LuxorInvoice) => Math.max(0, Math.round((Number(invoice.total) - getInvoicePaidTotal(invoice.id)) * 100) / 100)

  const getSuggestedInvoiceDeposit = (invoice: LuxorInvoice) => {
    if (invoice.invoice_kind === 'deposit') return getInvoiceBalance(invoice)
    if (invoice.invoice_kind === 'final_balance') return getInvoiceBalance(invoice)
    const booking = bookings.find((item) => item.invoice_id === invoice.id) || latestBooking
    const balance = getInvoiceBalance(invoice)
    const amount = booking?.deposit_required ? Number(booking.deposit_required) : balance
    return Math.min(amount, balance)
  }

  const handleSendContractPackage = async (booking: LuxorBooking) => {
    try {
      setSendingContractBookingId(booking.id)
      setUpdatingStatus(true)
      const invoice = invoices.find((item) => item.id === booking.invoice_id) || invoices[0]
      if (!invoice) throw new Error('Build the final proposal before publishing it.')
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'proposal' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The final proposal could not be published.')
      await fetchAllData(false)
      notify({ title: 'Final proposal published', description: 'The client received the locked proposal PDF and private selection link. The Event Agreement is sent automatically after they accept.', variant: 'success' })
    } catch (err) {
      console.error(err)
      notify({ title: 'Final proposal not published', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setSendingContractBookingId(null)
      setUpdatingStatus(false)
    }
  }

  const handlePrepareAgreement = async (invoice: LuxorInvoice) => {
    try {
      setPreparingAgreementInvoiceId(invoice.id)
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}/send-agreement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id }),
      })
      const data = await response.json().catch(() => ({})) as { delivery?: 'queued' | 'already_sent'; message?: string; error?: string }
      if (!response.ok) throw new Error(data.error || 'The agreement could not be prepared.')
      await fetchAllData(false)
      notify({
        title: data.delivery === 'already_sent' ? 'Agreement already queued' : 'Agreement delivery queued',
        description: data.message || 'Luxor will mark the agreement sent only after email delivery is confirmed.',
        variant: 'success',
      })
    } catch (error) {
      console.error(error)
      notify({
        title: 'Agreement not prepared',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setPreparingAgreementInvoiceId(null)
    }
  }

  const handleSendDateLockInvoice = async (booking: LuxorBooking) => {
    try {
      setSendingContractBookingId(booking.id)
      setUpdatingStatus(true)
      const invoice = invoices.find((item) => item.id === booking.invoice_id) || invoices[0]
      if (!invoice) throw new Error('Create the final proposal first.')
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'proposal' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The final proposal could not be published.')
      await fetchAllData(false)
      notify({
        title: 'Final Proposal Published',
        description: `Sent the locked proposal and private selection link to ${lead?.email}. The Event Agreement is sent after acceptance, and Stripe is sent after signature.`,
        variant: 'success',
      })
    } catch (err) {
      console.error(err)
      notify({ title: 'Final proposal not published', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setSendingContractBookingId(null)
      setUpdatingStatus(false)
    }
  }

  const handleRefundSecurityDeposit = async () => {
    if (!latestBooking) return
    try {
      setRefundingDeposit(true)
      const res = await fetch('/api/payments/refund-security-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: latestBooking.id, refundAmount: refundableSecurityDepositAmount }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to refund security deposit via Stripe.')
      setConfirmRefundModalOpen(false)
      notify({
        title: 'Security Deposit Refunded',
        description: `${formatMoney(refundableSecurityDepositAmount)} security deposit refunded to ${lead?.full_name} via Stripe.`,
        variant: 'success',
      })
      await fetchAllData(false)
    } catch (err) {
      console.error(err)
      notify({
        title: 'Refund Failed',
        description: err instanceof Error ? err.message : 'Could not process Stripe refund.',
        variant: 'error',
      })
    } finally {
      setRefundingDeposit(false)
    }
  }

  const beginPlanningEdit = (section: Exclude<PlanningEditSection, null>) => {
    if (!lead) return
    const metadata = selectedLeadEvent?.metadata || lead.metadata || {}
    setPlanningEditSection(section)
    setPlanningDraft({
      event_style: String(metadata.event_style || ''),
      music_style: String(metadata.music_style || ''),
      lighting_preference: String(metadata.lighting_preference || ''),
      special_requests: String(metadata.special_requests || lead.message || ''),
      head_table: String(metadata.head_table || ''),
      dance_floor: String(metadata.dance_floor || ''),
      stage_needed: String(metadata.stage_needed || ''),
      other_areas: String(metadata.other_areas || ''),
      floor_plan_layout: String(metadata.floor_plan_layout || 'classic-banquet'),
      decor_style: String(metadata.decor_style || ''),
      centerpieces: String(metadata.centerpieces || ''),
      linens: String(metadata.linens || ''),
    })
    const storedColors = Array.isArray(metadata.color_palette) ? metadata.color_palette.map(String) : []
    setPlanningColors(storedColors)
  }

  const savePlanningSection = async () => {
    if (!planningEditSection) return
    setSavingPlanningSection(true)
    const fieldsBySection: Record<Exclude<PlanningEditSection, null>, string[]> = {
      event: ['event_style'],
      preferences: ['music_style', 'lighting_preference', 'special_requests'],
      layout: ['head_table', 'dance_floor', 'stage_needed', 'other_areas', 'floor_plan_layout'],
      decor: ['decor_style', 'centerpieces', 'linens'],
    }
    const updates: Record<string, unknown> = {}
    for (const field of fieldsBySection[planningEditSection]) updates[field] = planningDraft[field]?.trim() || null
    if (planningEditSection === 'preferences') updates.color_palette = planningColors
    const saved = await (selectedLeadEvent ? handleEventMetadataUpdate(updates) : handleMetadataUpdate(updates))
    setSavingPlanningSection(false)
    if (saved) {
      setPlanningEditSection(null)
      notify({ title: 'Planning details saved', description: 'The lead record is up to date.', variant: 'success' })
    }
  }

  const handleContractRequestAction = async (booking: LuxorBooking, action: 'cancel' | 'resend') => {
    try {
      setContractActionKey(`${action}-${booking.id}`)
      setUpdatingStatus(true)
      const isCurrentProposalAgreement = action === 'resend' && proposalInvoice?.id === booking.invoice_id
      if (isCurrentProposalAgreement && proposalInvoice) {
        const res = await fetch(`/api/leads/${encodeURIComponent(id)}/send-agreement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: proposalInvoice.id, resend: true }),
        })
        const data = await res.json().catch(() => ({})) as { delivery?: 'queued' | 'already_sent' | 'preparing'; message?: string; error?: string }
        if (!res.ok) throw new Error(data.error || 'The agreement resend could not be queued.')
        await fetchAllData(false)
        notify({
          title: data.delivery === 'already_sent' ? 'Agreement already queued' : 'Agreement resend queued',
          description: data.message || 'The complete proposal, agreement, and Guest Guide will be delivered together once the queue confirms it.',
          variant: 'success',
        })
        return
      }

      const res = await fetch('/api/signatures', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `The contract could not be ${action === 'cancel' ? 'cancelled' : 'resent'}.`)
      await createFlowNote(
        action === 'cancel'
          ? 'Active contract signing request cancelled. The previous client link is no longer valid.'
          : 'Contract signing email and Guest Guide resent to the client. The signing link was renewed.',
        'status_change',
      )
      await fetchAllData(false)
      if (action === 'cancel') setContractToCancel(null)
      notify({
        title: action === 'cancel' ? 'Contract cancelled' : 'Contract resent',
        description: action === 'cancel' ? 'The old signing link has been disabled.' : 'The client received the agreement and Guest Guide again.',
        variant: 'success',
      })
    } catch (err) {
      console.error(err)
      notify({ title: 'Contract not updated', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setContractActionKey(null)
      setUpdatingStatus(false)
    }
  }

  const openContractReview = async (booking: LuxorBooking) => {
    const previewWindow = window.open('about:blank', '_blank')
    try {
      setContractActionKey(`review-${booking.id}`)
      const response = await fetch(`/api/signatures?bookingId=${encodeURIComponent(booking.id)}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as { signingUrl?: string; error?: string }
      if (!response.ok || !data.signingUrl) throw new Error(data.error || 'The contract could not be opened.')
      if (previewWindow) {
        previewWindow.location.href = data.signingUrl
      } else {
        window.location.href = data.signingUrl
      }
    } catch (err) {
      previewWindow?.close()
      notify({ title: 'Contract could not be opened', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setContractActionKey(null)
    }
  }

  const openPaymentRequest = (invoice: LuxorInvoice) => {
    const booking = eventBookings.find((item) => item.invoice_id === invoice.id) || latestBooking
    const paymentInvoice = invoice.invoice_kind === 'event' && booking?.contract_status === 'signed'
      ? invoices.find((item) => item.booking_id === booking.id && item.invoice_kind === 'deposit') || invoice
      : invoice
    const balance = getInvoiceBalance(paymentInvoice)
    setPaymentRequestInvoice(paymentInvoice)
    setPaymentRequestKind(paymentInvoice.invoice_kind === 'final_balance' ? 'balance' : 'deposit')
    setCustomPaymentAmount(String(balance))
  }

  const handleSendInvoice = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!paymentRequestInvoice) return
    const invoiceId = paymentRequestInvoice.id
    const balance = getInvoiceBalance(paymentRequestInvoice)
    const suggestedDeposit = getSuggestedInvoiceDeposit(paymentRequestInvoice)
    const isScheduledPayment = paymentRequestInvoice.invoice_kind === 'deposit' || paymentRequestInvoice.invoice_kind === 'final_balance'
    const paymentAmount = isScheduledPayment
      ? balance
      : paymentRequestKind === 'balance'
        ? balance
        : paymentRequestKind === 'deposit'
          ? Math.min(suggestedDeposit, balance)
          : Number(customPaymentAmount)
    const paymentLabel = paymentRequestInvoice.invoice_kind === 'deposit'
      ? 'Initial Booking Payment - Luxor at Las Palmas Events'
      : paymentRequestInvoice.invoice_kind === 'final_balance'
        ? 'Remaining Final Event Price Balance'
        : paymentRequestKind === 'deposit'
          ? 'Initial Booking Payment - Luxor at Las Palmas Events'
          : paymentRequestKind === 'balance'
            ? 'Remaining Final Event Price Balance'
            : 'Custom post-signature payment installment'
    try {
      setSendingInvoiceId(invoiceId)
      const response = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'payment', paymentAmount, paymentLabel }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'The proposal could not be sent.')
      if (payload.invoice) setInvoices((current) => current.map((item) => item.id === invoiceId ? payload.invoice : item))
      if (payload.inquiry) setLead(payload.inquiry)
      setPaymentRequestInvoice(null)
      setSelectedStageOverride(null)
      await fetchAllData(false)
      notify({ title: 'Payment request sent', description: `${formatMoney(paymentAmount)} was emailed to the client with a secure Stripe link.`, variant: 'success' })
    } catch (err) {
      notify({ title: 'Payment request not sent', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setSendingInvoiceId(null)
    }
  }

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return
    const invoiceId = invoiceToDelete.id
    try {
      setDeletingInvoiceId(invoiceId)
      const response = await fetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'The invoice could not be deleted.')
      setInvoices((current) => current.filter((invoice) => invoice.id !== invoiceId))
      setPayments((current) => current.filter((payment) => payment.invoice_id !== invoiceId))
      setInvoiceToDelete(null)
      notify({ title: 'Invoice deleted', description: 'The invoice, saved PDF, and unused payment link were removed.', variant: 'success' })
    } catch (error) {
      notify({ title: 'Invoice not deleted', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setDeletingInvoiceId(null)
    }
  }

  const openTourScheduleModal = (intent: 'new_visit' | 'reschedule') => {
    if (!lead) return
    setTourVisitIntent(intent)
    tourScheduleAttempt.current = null
    setTourExpectedVisitId(lead.current_tour_visit_id || null)
    setTourExpectedVisitVersion(lead.current_tour_visit_version || 0)
    setTourVisitId(intent === 'reschedule' && lead.current_tour_visit_id ? lead.current_tour_visit_id : crypto.randomUUID())
    setTourScheduleDate(lead.preferred_tour_date || '')
    setTourScheduleTime(normalizeTimeInputValue(lead.preferred_tour_time))
    setTourScheduleDuration(String(lead.metadata?.tourDurationMinutes || 30))
    setTourMeetingType(String(lead.metadata?.tourMeetingType || 'Private Venue Tour'))
    setTourClientFacingNotes(String(lead.metadata?.tourClientFacingNotes || lead.message || ''))
    const savedAssignees = Array.isArray(lead.metadata?.tour_assignees)
      ? lead.metadata.tour_assignees.map((value) => String(value)).filter(Boolean)
      : lead.metadata?.tour_coordinator ? [String(lead.metadata.tour_coordinator)] : []
    setTourAssignees(savedAssignees)
    setTourAssigneeCustom(savedAssignees.find((value) => !['Arianna', 'Carlos', 'Alex'].includes(value)) || '')
    setIsTourScheduleModalOpen(true)
  }

  const previewContractPdf = async (booking: LuxorBooking) => {
    try {
      setContractActionKey(`preview-${booking.id}`)
      let response = await fetch(`/api/signatures?bookingId=${encodeURIComponent(booking.id)}`, { cache: 'no-store' })
      let data = await response.json().catch(() => ({})) as { signature?: { id: string; status: string }; error?: string }
      if (!response.ok) {
        response = await fetch('/api/signatures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: booking.id, sendEmail: false, signingMode: 'in_person' }),
        })
        data = await response.json().catch(() => ({})) as { signature?: { id: string; status: string }; error?: string }
      }
      if (!response.ok || !data.signature?.id) throw new Error(data.error || 'The agreement preview could not be prepared.')
      const signed = data.signature.status === 'signed'
      setDocumentPreview({
        title: signed ? 'Executed agreement preview' : 'Agreement preview',
        url: `/api/signatures/${encodeURIComponent(data.signature.id)}/document?kind=${signed ? 'executed' : 'contract'}`,
      })
      await fetchAllData(false)
    } catch (error) {
      notify({ title: 'Agreement preview unavailable', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setContractActionKey(null)
    }
  }

  const openClientProposalHandoff = (invoice: LuxorInvoice, handoffWindow?: Window | null, reviewUrl?: string | null) => {
    const destination = reviewUrl || (invoice.public_token ? `/proposal/${encodeURIComponent(invoice.public_token)}` : null)
    if (!destination) {
      handoffWindow?.close()
      notify({ title: 'Client handoff unavailable', description: 'This final proposal does not have a secure client link yet. Open the proposal builder and prepare it for review together.', variant: 'error' })
      return
    }
    setManualSignedAgreementFile(null)
    setInPersonCloseInvoice(invoice)
    setInPersonHandoffUrl(destination)
    if (handoffWindow) {
      handoffWindow.location.assign(destination)
      return
    }
    const clientWindow = window.open(destination, 'luxor-client-handoff')
    if (!clientWindow) window.location.assign(destination)
  }

  const prepareClientProposalHandoff = async (invoice: LuxorInvoice, handoffWindow: Window | null) => {
    try {
      setSendingInvoiceId(invoice.id)
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'proposal_in_person' }),
      })
      const data = await response.json().catch(() => ({})) as { invoice?: LuxorInvoice; inquiry?: LuxorInquiry; reviewUrl?: string; error?: string }
      if (!response.ok || !data.invoice || !data.reviewUrl) throw new Error(data.error || 'The client handoff could not be prepared.')
      setInvoices((current) => current.map((item) => item.id === data.invoice!.id ? data.invoice! : item))
      if (data.inquiry) setLead(data.inquiry)
      openClientProposalHandoff(data.invoice, handoffWindow, data.reviewUrl)
      void fetchAllData(false)
      notify({ title: 'Ready for the client', description: 'Hand over the iPad for proposal review, acceptance, agreement signing, and payment choice.', variant: 'success' })
    } catch (error) {
      handoffWindow?.close()
      throw error
    } finally {
      setSendingInvoiceId(null)
    }
  }

  const startInPersonSignature = async () => {
    if (!inPersonCloseInvoice) return
    const handoffWindow = window.open('about:blank', 'luxor-in-person-signing')
    try {
      setInPersonCloseBusy(true)
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}/in-person-close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: inPersonCloseInvoice.id }),
      })
      const data = await response.json().catch(() => ({})) as { signingUrl?: string; error?: string }
      if (!response.ok || !data.signingUrl) throw new Error(data.error || 'The in-person agreement could not be prepared.')
      if (handoffWindow) handoffWindow.location.href = data.signingUrl
      else window.location.assign(data.signingUrl)
      await fetchAllData(false)
      notify({ title: 'Ready to hand over', description: 'The client can review and sign the agreement on the iPad. Stripe opens next for card payment.', variant: 'success' })
    } catch (error) {
      handoffWindow?.close()
      notify({ title: 'Client handoff not started', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setInPersonCloseBusy(false)
    }
  }

  const uploadManualSignedAgreement = async () => {
    if (!inPersonCloseInvoice || !manualSignedAgreementFile) return
    try {
      setInPersonCloseBusy(true)
      const acceptance = await fetch(`/api/leads/${encodeURIComponent(id)}/in-person-close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: inPersonCloseInvoice.id }),
      })
      const acceptanceData = await acceptance.json().catch(() => ({})) as { bookingId?: string; error?: string }
      if (!acceptance.ok || !acceptanceData.bookingId) throw new Error(acceptanceData.error || 'Proposal acceptance could not be recorded.')
      const form = new FormData()
      form.append('bookingId', acceptanceData.bookingId)
      form.append('file', manualSignedAgreementFile)
      form.append('actualSignedAt', paperSignedAt)
      form.append('signatureEvidence', paperSignatureEvidence)
      form.append('signatureTimingConfirmed', String(paperSignatureConfirmed))
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}/manual-signed-agreement`, { method: 'POST', body: form })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'The signed agreement could not be uploaded.')
      setManualSignedAgreementFile(null)
      await fetchAllData(false)
      notify({ title: 'Signed agreement saved', description: 'The paper agreement is in Documents and the booking can now collect its initial payment.', variant: 'success' })
    } catch (error) {
      notify({ title: 'Agreement not uploaded', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setInPersonCloseBusy(false)
    }
  }

  const openInPersonCardCheckout = async (booking: LuxorBooking) => {
    const handoffWindow = window.open('about:blank', 'luxor-in-person-payment')
    try {
      setInPersonCloseBusy(true)
      const response = await fetch('/api/payments/in-person-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: booking.id }),
      })
      const data = await response.json().catch(() => ({})) as { checkoutUrl?: string; error?: string }
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error || 'Secure card payment could not be opened.')
      if (handoffWindow) handoffWindow.location.href = data.checkoutUrl
      else window.location.assign(data.checkoutUrl)
    } catch (error) {
      handoffWindow?.close()
      notify({ title: 'Card payment not opened', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setInPersonCloseBusy(false)
    }
  }

  const previewInvoiceEmail = async (invoice: LuxorInvoice, mode: 'proposal' | 'proposal_contract' = 'proposal') => {
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/email-preview?mode=${mode}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as { subject?: string; html?: string; error?: string }
      if (!response.ok || !data.subject || !data.html) throw new Error(data.error || 'The email preview could not be prepared.')
      setEmailPreview({ subject: data.subject, html: data.html })
    } catch (error) {
      notify({ title: 'Email preview unavailable', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    }
  }

  const openProposalDeliveryPreview = (invoice: LuxorInvoice, initialTab: 'email' | 'pdf' = 'email') => {
    setProposalDeliveryPreview({ invoice, initialTab })
  }

  const handleSendFinalProposal = async (invoice: LuxorInvoice, propagateError = false, resend = false) => {
    try {
      setSendingInvoiceId(invoice.id)
      const response = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'proposal', ...(resend ? { resend: true } : {}) }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.invoice || !payload.reviewUrl) throw new Error(payload.error || 'Delivery could not be confirmed. Retry to recover the same proposal.')
      void fetchAllData(false)
      notify({
        title: resend ? 'Proposal resent' : 'Final proposal sent',
        description: resend ? 'A new send attempt was recorded for this saved proposal.' : 'The client can accept the final proposal. Acceptance automatically sends the Event Agreement; Stripe is emailed only after signature.',
        variant: 'success',
      })
    } catch (error) {
      if (propagateError) throw error
      notify({ title: 'Final proposal not sent', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setSendingInvoiceId(null)
    }
  }

  const saveBookingPaymentPreference = async (booking: LuxorBooking, changes: Partial<{ method: 'card' | 'zelle' | 'cash' | 'check'; amount: 'deposit' | 'full' }>) => {
    const current = (booking.metadata?.client_payment_preference || {}) as { method?: 'card' | 'zelle' | 'cash' | 'check'; amount?: 'deposit' | 'full' }
    const preference = { method: changes.method || current.method || 'card', amount: changes.amount || current.amount || 'deposit', setBy: 'owner', selectedAt: new Date().toISOString() }
    try {
      const response = await fetch('/api/bookings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: booking.id, metadata: { ...booking.metadata, client_payment_preference: preference } }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Payment preference could not be saved.')
      await fetchAllData(false)
      notify({ title: 'Payment preference saved', description: `Client page will default to ${preference.method === 'zelle' ? 'Zelle' : preference.method} and ${preference.amount === 'deposit' ? 'reservation deposit' : 'full event balance'}.`, variant: 'success' })
    } catch (error) {
      notify({ title: 'Payment preference not saved', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    }
  }

  const handleTourAttendanceAction = async (attendance: 'attended' | 'no_show') => {
    if (!lead) return
    try {
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createLuxorTourAttendancePayload({ inquiryId: lead.id, leadEventId: selectedLeadEvent?.id, attendance, expectedAttendance: lead.tour_attendance_status || null, visitId: lead.current_tour_visit_id, visitVersion: lead.current_tour_visit_version }), expectedInquiryUpdatedAt: lead.updated_at }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; inquiry?: unknown; warnings?: string[]; simulated?: boolean }
      if (!response.ok) throw new Error(payload.error || 'Tour attendance could not be updated.')
      if (payload.inquiry) setLead(payload.inquiry as LuxorInquiry)
      if (attendance === 'attended') {
        setSelectedStageOverride('proposal')
        const nextParams = new URLSearchParams(searchParams?.toString() || '')
        nextParams.set('tab', 'overview')
        nextParams.set('stage', 'proposal')
        router.replace(`${pathname || `/portal/leads/${id}`}?${nextParams.toString()}`, { scroll: false })
      }
      await fetchAllData(false)
      const warnings = payload.warnings ?? []
      notify({
        title: attendance === 'attended' ? (lead.tour_attendance_status === 'no_show' ? 'Tour outcome corrected to complete' : 'Tour marked complete') : 'Tour marked no show',
        description: warnings.length ? warnings.join(' ') : payload.simulated
          ? 'Saved in the isolated Test Lead run. No customer message, venue calendar event, or inventory slot changed.'
          : 'The outcome was saved without sending a message.',
        variant: warnings.length ? 'warning' : 'success',
      })
    } catch (error) {
      notify({ title: 'Tour status not saved', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    }
  }

  const handleScheduleTour = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!lead) return

    try {
      setSchedulingTour(true)
      const scheduleBody = {
        inquiryId: id,
        action: 'schedule-tour',
        tourDate: tourScheduleDate,
        tourTime: tourScheduleTime,
        durationMinutes: Number(tourScheduleDuration),
        meetingType: tourMeetingType,
        clientFacingNotes: tourClientFacingNotes,
        tourAssignees,
        visitIntent: tourVisitIntent,
        visitId: tourVisitId,
        expectedVisitId: tourExpectedVisitId,
        expectedVisitVersion: tourExpectedVisitVersion,
        expectedInquiryUpdatedAt: lead.updated_at,
      }
      const signature = JSON.stringify(scheduleBody)
      if (tourScheduleAttempt.current?.signature !== signature) {
        tourScheduleAttempt.current = { signature, id: crypto.randomUUID() }
      }
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scheduleBody, scheduleRequestId: tourScheduleAttempt.current.id }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; inquiry?: LuxorInquiry; simulated?: boolean; confirmationJob?: LuxorEmailJob | null; reminderJobs?: LuxorEmailJob[] }
      if (!response.ok) throw new Error(payload.error || 'The tour could not be scheduled.')

      setLead(payload.inquiry as LuxorInquiry)
      setTourEmailJobs(payload.simulated ? [] : [payload.confirmationJob, ...(payload.reminderJobs || [])].filter(Boolean) as LuxorEmailJob[])
      setIsTourScheduleModalOpen(false)
      await fetchAllData(false)
      notify({
        title: payload.simulated ? 'Simulated tour scheduled' : 'Tour scheduled and invite sent',
        description: payload.simulated
          ? 'Saved in the isolated Test Lead run. No email, calendar event, or venue inventory was changed.'
          : `${payload.reminderJobs?.length || 0} reminder email${payload.reminderJobs?.length === 1 ? '' : 's'} queued automatically.`,
        variant: 'success',
      })
    } catch (err) {
      notify({ title: 'Tour not scheduled', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setSchedulingTour(false)
    }
  }

  const handleRecordManualPayment = async (booking: LuxorBooking, paymentKind: 'deposit' | 'final', receivedMethod?: 'cash' | 'zelle' | 'check', timingEvidence?: SameDayReceiptEvidence) => {
    const master = invoices.find(invoice => invoice.id === booking.invoice_id)
    if (paymentKind === 'deposit' && sameDayBookingPromotion(master)?.coverage_amount && !timingEvidence) { setSameDayReceipt({ booking, method: receivedMethod }); return }
    const preferredMethod = receivedMethod || ((booking.metadata?.client_payment_preference as { method?: string } | undefined)?.method || 'manual').toLowerCase()
    try {
      setUpdatingStatus(true)
      const paymentRes = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          paymentKind,
          paymentMethod: preferredMethod,
          ...timingEvidence,
        }),
      })
      const paymentPayload = await paymentRes.json().catch(() => ({})) as {
        error?: string
        alreadyPaid?: boolean
        payment?: { amount?: number }
        invoice?: LuxorInvoice
        reviewRequired?: boolean
        message?: string
      }
      if (!paymentRes.ok) throw new Error(paymentPayload.error || 'Failed to record payment.')
      await fetchAllData(false)
      setPaymentInstallmentRefresh((revision) => revision + 1)
      setSameDayReceipt(null)
      if (paymentPayload.reviewRequired) { notify({ title: 'Payment received — review required', description: paymentPayload.message || 'Please do not collect another payment. The reservation is pending owner review.', variant: 'info' }); return }
      if (paymentPayload.alreadyPaid) {
        notify({
          title: paymentKind === 'deposit' ? 'Initial payment already recorded' : 'Final balance already recorded',
          description: paymentKind === 'deposit'
            ? 'The initial booking payment is complete and the $750 refundable security deposit is held.'
            : 'The final event balance is already paid. The $750 refundable security deposit remains held separately.',
          variant: 'success',
        })
        return
      }
      const amount = Number(paymentPayload.payment?.amount || paymentPayload.invoice?.total || 0)
      notify({
        title: paymentKind === 'deposit' ? 'Initial payment recorded' : 'Final event balance recorded',
        description: paymentKind === 'deposit'
          ? formatMoney(amount) + ' recorded. This includes the initial booking payment and the separate $750 refundable security deposit, now held.'
          : formatMoney(amount) + ' recorded for the final event balance. The $750 refundable security deposit remains held separately.',
        variant: 'success',
      })
    } catch (err) {
      console.error(err)
      notify({ title: 'Payment not recorded', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleSendAiInvoiceReminder = async (invoice: LuxorInvoice) => {
    if (!lead?.email) return
    try {
      setSendingReminderId(invoice.id)
      const res = await fetch(`/api/invoices/${invoice.id}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'unpaid_invoice' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send AI invoice reminder.')
      notify({
        title: 'AI Invoice Reminder Sent',
        description: `Delivered to ${lead.email} (${data.aiGenerated ? 'AI personalized copy' : 'Luxor branded copy'}).`,
        variant: 'success',
      })
      await fetchAllData(false)
    } catch (err) {
      console.error(err)
      notify({
        title: 'Reminder failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSendingReminderId(null)
    }
  }

  const handleBookingMilestone = async (booking: LuxorBooking, milestone: 'planning' | 'event' | 'closing' | 'complete') => {
    if (milestone === 'planning' && (!booking.event_date || !booking.start_time || !booking.end_time || !booking.final_payment_due_date)) {
      notify({
        title: 'Planning is not ready yet',
        description: 'Add the event date, start time, end time, and final-payment due date before confirming planning.',
        variant: 'error',
      })
      return
    }
    try {
      setUpdatingStatus(true)
      const now = new Date().toISOString()
      const isClosing = milestone === 'closing'
      const isComplete = milestone === 'complete'
      const isPlanning = milestone === 'planning'
      const res = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: booking.id,
          status: isComplete ? 'completed' : isPlanning ? 'confirmed' : booking.status,
          metadata: {
            ...booking.metadata,
            ...(isComplete
              ? { lead_completed_at: now }
              : isClosing
              ? { closeout_completed_at: now }
              : isPlanning
                ? { planning_completed_at: now }
                : { event_completed_at: now }),
          },
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to update the booking milestone.')

      await createFlowNote(
        isComplete
          ? 'Booking marked complete after event closeout.'
          : isClosing
          ? 'Event closeout completed. The booking is ready for final completion.'
          : isPlanning
            ? 'Planning details confirmed. Final payment is now ready.'
            : 'Event marked complete. Closeout is now ready.',
        'status_change',
      )
      await fetchAllData(false)
      notify({ title: isComplete ? 'Lead completed' : isClosing ? 'Closeout completed' : isPlanning ? 'Planning confirmed' : 'Event completed', variant: 'success' })
    } catch (err) {
      console.error(err)
      notify({ title: 'Milestone not updated', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setUpdatingStatus(false)
    }
  }

  useEffect(() => {
    const requestedTab = searchParams?.get('tab')
    const requestedSection = searchParams?.get('section')
    const requestedStage = searchParams?.get('stage')
    const requestedPlanningTab = searchParams?.get('planningTab')
    let timeoutId: number | null = null

    if (requestedTab && ['overview', 'activity', 'tasks', 'vendors', 'timeline', 'proposals', 'contract', 'payments', 'planning', 'documents', 'messages', 'notes'].includes(requestedTab)) {
      setActiveLeadTab(requestedTab as LeadDetailTab)
      if (requestedTab === 'tasks') {
        setShowTaskTools(true)
      }
      if (requestedTab === 'planning') setSelectedStageOverride('planning')
    }

    if (requestedStage) {
      const completedTourOpenedAtTourStage = requestedStage === 'tour' && lead?.tour_attendance_status === 'attended' && activeStage === 'proposal'
      const effectiveRequestedStage = completedTourOpenedAtTourStage ? 'proposal' : requestedStage
      setSelectedStageOverride(effectiveRequestedStage)
      setActiveLeadTab('overview')
      if (completedTourOpenedAtTourStage) {
        const nextParams = new URLSearchParams(searchParams?.toString() || '')
        nextParams.set('stage', 'proposal')
        router.replace(`${pathname || `/portal/leads/${id}`}?${nextParams.toString()}`, { scroll: false })
      }
    }

    if (requestedPlanningTab && ['details', 'vendors', 'fb', 'decor', 'timeline', 'files'].includes(requestedPlanningTab)) {
      setPlanningSubTab(requestedPlanningTab as 'details' | 'vendors' | 'fb' | 'decor' | 'timeline' | 'files')
    }

    if (requestedSection) {
      timeoutId = window.setTimeout(() => {
        document.getElementById(requestedSection)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [activeStage, id, lead?.tour_attendance_status, pathname, router, searchParams])

  if (loading) {
    return <ClientDossierLoading />
  }

  if (error || !lead) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-10 w-10 text-red-500/80" />
        <h3 className="text-lg font-bold text-white">Dossier Unavailable</h3>
        <p className="max-w-md text-sm text-zinc-500 leading-relaxed">{error || 'The requested client inquiry could not be found.'}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => fetchAllData()}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-blue-300 transition-all hover:bg-blue-500/15 hover:text-white"
          >
            Retry Load
          </button>
          <Link href="/portal/leads" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300 transition-all hover:text-white">
            <ArrowLeft size={12} /> Back to Leads
          </Link>
        </div>
      </div>
    )
  }

  const {
    chatMessages,
    isGrandOpeningLead,
    isNewsletter,
    latestInvoice,
    noteEntries,
    emailEntries,
    allActivityEntries,
    activityCounts,
    sortedTasks,
    pendingTaskCount,
    sortedBookings,
    sortedInvoices,
    sortedPayments,
  } = leadDerivedData
  const originalInquiryText = lead.message?.trim() || (isNewsletterLead(lead) ? 'No event or tour request was included with this signup.' : 'No written request was included with this inquiry.')
  const isLongOriginalInquiry = originalInquiryText.length > 320
  const isOriginalInquiryExpanded = expandedOriginalInquiryId === lead.id
  const activeEventMetadata = activeEventForDisplay?.metadata || lead.metadata || {}
  const agreementBooking = proposalInvoice ? proposalBooking : latestBooking
  const bookingContractAmount = Number(agreementBooking?.contract_total || 0)
  const bookingDepositAmount = Number(agreementBooking?.deposit_required || 0)
  const currentBookingInvoices = agreementBooking
    ? sortedInvoices.filter((invoice) => invoice.booking_id === agreementBooking.id)
    : []
  const depositInvoice = currentBookingInvoices.find((invoice) => invoice.invoice_kind === 'deposit')
  const finalBalanceInvoice = currentBookingInvoices.find((invoice) => invoice.invoice_kind === 'final_balance')
  const paymentCollectionScope = proposalInvoice?.proposal_context?.payment_collection_scope
  const luxorOnlyCollection = paymentCollectionScope === 'luxor_services_only'
  const refundableSecurityDepositAmount = Number(depositInvoice?.line_items.find((item) => item.paymentBucket === 'security_deposit' || item.category === 'Security Deposit' || /refundable security deposit/i.test(item.description))?.total || agreementBooking?.security_deposit_amount || LUXOR_DEFAULT_SECURITY_DEPOSIT)
  const initialBookingPaymentAmount = Number(depositInvoice?.line_items.find((item) => item.paymentBucket === 'venue' || /initial booking payment/i.test(item.description))?.total || bookingDepositAmount)
  const initialPaymentInvoiceTotal = Number(depositInvoice?.total || (initialBookingPaymentAmount + refundableSecurityDepositAmount))
  const depositPaidTotal = depositInvoice ? getInvoicePaidTotal(depositInvoice.id) : getPaidTotal(sortedPayments, 'deposit')
  const depositBalance = Math.max(0, initialPaymentInvoiceTotal - depositPaidTotal)
  const finalPaymentTotal = Number(finalBalanceInvoice?.total || Math.max(0, bookingContractAmount - initialBookingPaymentAmount))
  const finalPaymentBalance = finalBalanceInvoice
    ? getInvoiceBalance(finalBalanceInvoice)
    : Math.max(0, finalPaymentTotal - getPaidTotal(sortedPayments, 'final'))
  const finalPaymentDueDate = agreementBooking?.final_payment_due_date || null
  const finalBalanceInvoiceId = finalBalanceInvoice?.id || null
  const clientPaymentPreference = agreementBooking?.metadata?.client_payment_preference as {
    method?: unknown
    amount?: unknown
    client_handoff_completed_at?: unknown
    client_reported_payment_sent_at?: unknown
  } | undefined
  const clientPaymentMethod = (() : 'card' | 'cash' | 'zelle' | 'check' | null => {
    const method = String(clientPaymentPreference?.method || '').toLowerCase()
    return method === 'card' || method === 'cash' || method === 'zelle' || method === 'check' ? method : null
  })()
  const clientPaymentAmount = clientPaymentPreference?.amount === 'full' ? 'full' : 'deposit'
  const clientSelectedManualMethod: 'cash' | 'zelle' | null = clientPaymentMethod === 'cash' || clientPaymentMethod === 'zelle' ? clientPaymentMethod : null
  const clientManualHandoffComplete = typeof clientPaymentPreference?.client_handoff_completed_at === 'string'
  const clientReportedZelleSent = typeof clientPaymentPreference?.client_reported_payment_sent_at === 'string'
  // Event-price progress deliberately excludes the separate $750 security
  // hold. The deposit child invoice contains both amounts, so count only its
  // initial-booking-payment portion here and show the security deposit in its
  // own status/card instead of making the Event Price balance look smaller.
  const proposalPaidTotal = Math.round((
    (proposalInvoice ? getInvoicePaidTotal(proposalInvoice.id) : 0) +
    Math.min(initialBookingPaymentAmount, depositPaidTotal) +
    (finalBalanceInvoice ? getInvoicePaidTotal(finalBalanceInvoice.id) : getPaidTotal(sortedPayments, 'final'))
  ) * 100) / 100
  const proposalBalance = Math.max(0, Math.round((Number(proposalInvoice?.total || latestBooking?.contract_total || 0) - proposalPaidTotal) * 100) / 100)
  const proposalAmount = proposalInvoice?.total || latestBooking?.contract_total || 0
  const proposalPublicationErrors = Array.isArray(proposalInvoice?.proposal_context?.publication_errors)
    ? proposalInvoice.proposal_context.publication_errors.filter((error): error is string => typeof error === 'string' && Boolean(error.trim()))
    : []
  const proposalHasCompletePaymentPlan = (() => {
    const plan = proposalInvoice?.proposal_context?.payment_plan
    if (!plan) return false
    return (plan.mode === 'deposit_and_balance' || plan.mode === 'pay_in_full') &&
      Number.isFinite(Number(plan.booking_payment_percent)) &&
      Number(plan.booking_payment_percent) >= 0 &&
      Number(plan.booking_payment_percent) <= 100 &&
      Number.isInteger(Number(plan.final_payment_due_days_before_event)) &&
      Number(plan.final_payment_due_days_before_event) >= 0 &&
      (plan.mode !== 'deposit_and_balance' || Number(plan.booking_payment_percent) > 0)
  })()
  const proposalLegacyPaymentPlanRequired = Boolean(
    !proposalHasCompletePaymentPlan &&
    proposalInvoice?.proposal_context?.calculation_errors?.length === 1 &&
    proposalInvoice.proposal_context.calculation_errors[0] === 'Pricing configuration required — administrator review.',
  )
  const proposalPublicationBlocker = proposalPublicationErrors[0]
    || (proposalLegacyPaymentPlanRequired ? 'Set the payment plan in Step 5 before publishing this final proposal.' : null)
  const proposalDelivery = proposalInvoice?.proposal_context?.delivery_snapshot
  const proposalDeliveryEmail = proposalDelivery && typeof proposalDelivery === 'object' && !Array.isArray(proposalDelivery)
    ? (proposalDelivery as Record<string, unknown>).proposal_email
    : null
  const proposalDeliveryState = proposalDeliveryEmail && typeof proposalDeliveryEmail === 'object' && !Array.isArray(proposalDeliveryEmail)
    ? (proposalDeliveryEmail as Record<string, unknown>).delivery_state
    : null
  const proposalInPersonDelivery = proposalDelivery && typeof proposalDelivery === 'object' && !Array.isArray(proposalDelivery)
    ? (proposalDelivery as Record<string, unknown>).in_person
    : null
  const proposalReviewTogetherReady = Boolean(
    proposalInPersonDelivery && typeof proposalInPersonDelivery === 'object' && !Array.isArray(proposalInPersonDelivery)
    && (proposalInPersonDelivery as Record<string, unknown>).handoff_state === 'ready',
  )
  const proposalDeliveryPrepared = proposalDeliveryState === 'prepared'
  const proposalSentAt = getPublishedFinalProposalSentAt(proposalInvoice)
  const proposalAcceptedAt = proposalInvoice?.proposal_accepted_at || null
  const proposalViewedAt = proposalInvoice?.proposal_viewed_at || null
  const agreementDeliveryJob = agreementBooking
    ? [...tourEmailJobs]
      .filter((job) => job.booking_id === agreementBooking.id && job.job_type === 'contract_signature')
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0] || null
    : null
  const directAgreementHandoffConfirmed = agreementBooking?.metadata?.direct_handoff_channel === 'proposal_acceptance'
    || typeof agreementBooking?.metadata?.direct_handoff_at === 'string'
  const agreementDeliveryConfirmed = directAgreementHandoffConfirmed || agreementDeliveryJob?.status === 'sent'
  const agreementDeliveryPending = !directAgreementHandoffConfirmed && (agreementDeliveryJob?.status === 'queued' || agreementDeliveryJob?.status === 'sending')
  const agreementDeliveryFailed = agreementDeliveryJob?.status === 'failed'
  const agreementAwaitingSignature = Boolean(
    agreementBooking &&
    agreementBooking.contract_status !== 'signed' &&
    ['sent', 'viewed', 'needs_follow_up'].includes(agreementBooking.contract_status || ''),
  )
  const agreementCanBeResent = Boolean(agreementDeliveryConfirmed && agreementBooking && agreementAwaitingSignature)
  const agreementStatusLabel = !proposalInvoice
    ? 'Not started'
    : agreementBooking?.contract_status === 'signed'
      ? 'Signed'
      : agreementBooking?.contract_status === 'viewed'
        ? 'Opened'
        : agreementDeliveryConfirmed
          ? 'Sent'
          : agreementDeliveryPending
            ? 'Sending'
            : agreementDeliveryFailed
              ? 'Delivery failed'
              : proposalAcceptedAt
                ? 'Delivery pending'
                : 'Awaiting proposal acceptance'
  const proposalReminderJobs = tourEmailJobs.filter((job) => job.job_type === 'proposal_view_reminder' || job.job_type === 'proposal_payment_reminder')
  const queuedProposalReminders = proposalReminderJobs.filter((job) => job.status === 'queued')
  const nextBestMove = getLeadNextStep(lifecycleLead || lead, agreementBooking, proposalInvoice)
  const marketingRecentEvents = marketingEngagement?.recent_events ?? []
  const marketingCampaigns = marketingEngagement?.campaigns ?? []
  const marketingTopCampaign = marketingCampaigns[0] ?? null
  const marketingLastTouchedAt = marketingEngagement?.latest_clicked_at || marketingEngagement?.latest_opened_at || null
  const selectedEventProposalContext = selectedLeadEvent && currentProposalEvent?.id === selectedLeadEvent.id
    ? currentProposalInvoice?.proposal_context
    : null
  const selectedEventBooking = [...eventBookings]
    .filter((booking) => booking.status !== 'cancelled')
    .sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime())[0]
  const resolvedPlanningTimes = resolveLuxorEventPlanningTimes(
    selectedLeadEvent?.metadata,
    selectedEventProposalContext,
    selectedEventBooking ? { ...selectedEventBooking.metadata, start_time: selectedEventBooking.start_time } : null,
  )
  const venueAccessTime = String(resolvedPlanningTimes.venueAccessTime)
  const eventTime = String(resolvedPlanningTimes.eventTime)
  const eventDetails: Array<{
    label: string
    value: string
    editValue: string
    copyValue: string
    field: EventDetailsField
    icon: React.ReactNode
    inputType?: LeadDetailInputType
    placeholder?: string
    isMono?: boolean
    options?: { value: string; label: string }[]
    readOnly?: boolean
  }> = [
    {
      label: 'Event Type',
      value: currentEventType || (isNewsletter ? '' : 'Not specified'),
      editValue: currentEventType || '',
      copyValue: currentEventType || '',
      field: 'event_type',
      icon: <Sparkles size={14} />,
      inputType: 'event-type',
      placeholder: 'Search or enter an event type...',
    },
    {
      label: 'Package Interest',
      value: currentEventPackageInterest || 'Not selected',
      editValue: currentEventPackageInterest || '',
      copyValue: currentEventPackageInterest || '',
      field: 'package_interest',
      icon: <Briefcase size={14} />,
      inputType: 'select',
      placeholder: 'Select a package of interest',
      options: [...LUXOR_INQUIRY_PACKAGE_INTEREST_OPTIONS],
    },
    {
      label: 'Guest Count',
      value: currentEventGuestCount ? `${currentEventGuestCount} guests` : (isNewsletter ? '' : 'Unspecified'),
      editValue: currentEventGuestCount ? String(currentEventGuestCount) : '',
      copyValue: currentEventGuestCount ? String(currentEventGuestCount) : '',
      field: 'guest_count',
      icon: <Users size={14} />,
      inputType: 'number',
      placeholder: 'Guest count',
    },
    {
      label: 'Target Date',
      value: currentEventDate ? formatDisplayDate(currentEventDate) : (isNewsletter ? '' : 'TBD'),
      editValue: currentEventDate || '',
      copyValue: currentEventDate || '',
      field: 'target_date',
      icon: <Calendar size={14} />,
      inputType: 'date',
    },
    {
      label: 'Venue Access Time',
      value: venueAccessTime ? formatTimeString(venueAccessTime) : 'Not set',
      editValue: venueAccessTime,
      copyValue: venueAccessTime,
      field: 'venue_access_time',
      icon: <Clock size={14} />,
      inputType: 'time',
      readOnly: Boolean(selectedEventBooking),
    },
    {
      label: 'Event Time',
      value: eventTime ? formatTimeString(eventTime) : 'Not set',
      editValue: eventTime,
      copyValue: eventTime,
      field: 'event_time',
      icon: <Clock size={14} />,
      inputType: 'time',
      readOnly: Boolean(selectedEventBooking),
    },
  ]
  const isEventDetailsEditing = eventDetailsEditing && eventDetailsDraftEventId === selectedLeadEvent?.id
  const beginEventDetailsEdit = () => {
    if (!selectedLeadEvent?.id) return
    eventDetailsEditSessionRef.current += 1
    setEventDetailsDraftEventId(selectedLeadEvent.id)
    setEventDetailsDraft(Object.fromEntries(eventDetails.map((item) => [item.field, item.editValue])))
    setEventDetailsEditing(true)
  }
  const saveEventDetails = async () => {
    const draftEventId = eventDetailsDraftEventId
    const editSessionId = eventDetailsEditSessionRef.current
    if (!draftEventId || draftEventId !== selectedLeadEvent?.id) {
      cancelEventDetailsEdit()
      notify({ title: 'Event details not saved', description: 'The selected event changed. Reopen Edit and review the current event before saving.', variant: 'error' })
      return
    }
    const fieldUpdates = eventDetails.flatMap((item) => {
      if (item.readOnly || item.field === 'venue_access_time' || item.field === 'event_time') return []
      const nextValue = eventDetailsDraft[item.field] ?? item.editValue
      return normalizeComparableValue(nextValue) === normalizeComparableValue(item.editValue)
        ? []
        : [{ field: item.field, value: nextValue }]
    })
    const timingUpdates: { venueAccessTime?: string; eventTime?: string } = {}
    if (!eventDetails.find((item) => item.field === 'venue_access_time')?.readOnly) {
      const nextVenueAccessTime = eventDetailsDraft.venue_access_time ?? venueAccessTime
      if (nextVenueAccessTime.trim() !== venueAccessTime.trim()) timingUpdates.venueAccessTime = nextVenueAccessTime.trim()
    }
    if (!eventDetails.find((item) => item.field === 'event_time')?.readOnly) {
      const nextEventTime = eventDetailsDraft.event_time ?? eventTime
      if (nextEventTime.trim() !== eventTime.trim()) timingUpdates.eventTime = nextEventTime.trim()
    }
    const result = await persistLuxorEventDetailsDraft({
      draftEventId,
      selectedEventId: selectedLeadEvent?.id || null,
      editSessionId,
      getSelectedEventId: () => selectedLeadEventIdRef.current,
      getEditSessionId: () => eventDetailsEditSessionRef.current,
      fieldUpdates,
      timingUpdates,
      persistField: (field, value) => handleLeadFieldUpdate(field as EditableLeadField, value),
      persistTimes: async (updates, eventId) => handleEventPlanningTimeUpdate(buildLuxorEventPlanningTimePatch(updates), eventId),
    })
    if (result !== 'saved') return
    setEventDetailsDraft({})
    setEventDetailsDraftEventId(null)
    setEventDetailsEditing(false)
  }
  const cancelEventDetailsEdit = () => {
    eventDetailsEditSessionRef.current += 1
    setEventDetailsDraft({})
    setEventDetailsDraftEventId(null)
    setEventDetailsEditing(false)
  }
  const openEventDetailsEditor = () => {
    if (!selectedLeadEvent?.id) return
    if ((selectedStageOverride || activeStage) !== 'inquiry' || activeLeadTab !== 'overview') {
      setSelectedStageOverride('inquiry')
      setActiveLeadTab('overview')
    }
    beginEventDetailsEdit()
    window.setTimeout(() => {
      document.getElementById('event-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }
  const renderEventSummaryCard = () => (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Event Summary</p>
        <button
          type="button"
          onClick={openEventDetailsEditor}
          disabled={!selectedLeadEvent?.id}
          title={selectedLeadEvent?.id ? 'Edit event details' : 'Select an event to edit its details'}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>
      <div className="space-y-1">
        {eventDetails.map((item) => (
          <div key={item.field} className="flex min-w-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] py-2 last:border-b-0">
            <span className="shrink-0 text-[10px] font-bold uppercase text-[color:var(--portal-muted)]">{item.label}</span>
            <span className="min-w-0 text-right text-xs font-bold text-[color:var(--portal-text)]">{item.value || 'Not captured'}</span>
          </div>
        ))}
      </div>
    </section>
  )
  const clientDetails: Array<{
    label: string
    value: string
    editValue: string
    copyValue: string
    field: EditableLeadField
    icon: React.ReactNode
    inputType?: LeadDetailInputType
    placeholder?: string
    isMono?: boolean
  }> = [
    {
      label: 'Email',
      value: lead.email || 'None',
      editValue: lead.email || '',
      copyValue: lead.email || '',
      field: 'email',
      icon: <Mail size={14} />,
      inputType: 'email',
      placeholder: 'client@email.com',
      isMono: true,
    },
    {
      label: 'Phone',
      value: lead.phone ? formatPhoneDisplay(lead.phone) : 'None',
      editValue: lead.phone || '',
      copyValue: lead.phone || '',
      field: 'phone',
      icon: <Phone size={14} />,
      inputType: 'tel',
      placeholder: 'Phone number',
      isMono: true,
    },
  ]
  const internalDetails: Array<{ label: string; value: string; subtext?: string; isMono?: boolean }> = [
    { label: 'Created', value: new Date(lead.created_at).toLocaleString(), isMono: true },
    { label: 'Updated', value: new Date(lead.updated_at).toLocaleString(), isMono: true },
    { label: 'Flow Type', value: lead.flow.replaceAll('_', ' '), isMono: true },
    { label: 'Source Node', value: formatSourceLabel(lead), isMono: true },
    { label: 'Campaign Key', value: lead.campaign_key || 'None', isMono: true },
    { label: 'Page Path', value: lead.page_path || 'None', isMono: true },
    { label: 'Referrer', value: lead.referrer || 'None', isMono: true },
    { label: 'Marketing Opt In', value: lead.marketing_opt_in ? 'Yes' : 'No' },
    { label: 'User Agent', value: lead.user_agent || 'Not captured', isMono: true },
  ]
  const recommendedActions: Array<{
    icon: React.ReactNode
    label: string
    detail: string
    onClick: () => void
    disabled?: boolean
    loading?: boolean
  }> = []
  const pushRecommendedAction = (action: (typeof recommendedActions)[number]) => {
    recommendedActions.push(action)
  }
  const derivedLeadStatus = lead.status === 'closed_lost'
    || lead.pipeline_stage === 'closed_lost'
    || activeEventForDisplay?.status === 'closed_lost'
    || activeEventForDisplay?.pipeline_stage === 'closed_lost'
    ? 'closed_lost'
    : proposalWorkflowDisplay.workflowStageAdvanced ? 'booked' : lead.status

  if (derivedLeadStatus === 'closed_lost') {
    pushRecommendedAction({
      icon: <ArrowLeft size={15} />,
      label: 'Re-open lead',
      detail: 'Reopens the lead only; cancelled proposals and contracts stay cancelled',
      onClick: () => handleGuidedStatusChange('new'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (derivedLeadStatus === 'new') {
    pushRecommendedAction({
      icon: <Phone size={15} />,
      label: 'Mark contacted',
      detail: 'Log the first outreach touch',
      onClick: () => handleGuidedStatusChange('contacted'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (derivedLeadStatus === 'contacted' || derivedLeadStatus === 'tour_requested') {
    pushRecommendedAction({
      icon: <Calendar size={15} />,
      label: 'Schedule tour & send invite',
      detail: 'Create one branded calendar invite and later reminders',
      onClick: () => openTourScheduleModal('new_visit'),
      disabled: !lead.email,
    })
  } else if (derivedLeadStatus === 'tour_confirmed') {
    pushRecommendedAction({
      icon: <FileSignature size={15} />,
      label: 'Mark proposal sent',
      detail: 'Use after sending pricing',
      onClick: () => handleGuidedStatusChange('proposal_sent'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (derivedLeadStatus === 'proposal_sent') {
    pushRecommendedAction({
      icon: <MessageSquare size={15} />,
      label: 'Follow up on proposal',
      detail: 'Nudge for a decision or objections',
      onClick: () => {
        setNoteType('call_log')
        scrollToSection('lead-activity')
      },
    })
  } else if (derivedLeadStatus === 'booked') {
    pushRecommendedAction({
      icon: <FileSignature size={15} />,
      label: !proposalInvoice
        ? 'Build final proposal'
        : !proposalAcceptedAt
          ? 'Edit proposal'
          : !agreementBooking
            ? 'Prepare agreement'
            : agreementBooking.contract_status === 'signed'
              ? 'Review booking'
              : agreementCanBeResent
                ? 'Resend agreement'
                : 'Review contract status',
      detail: !proposalInvoice
        ? 'Calculate the exact package price for client selection'
        : !proposalAcceptedAt
          ? 'Review the locked proposal while the client considers it'
          : !agreementBooking
            ? 'The proposal is accepted; prepare the matching agreement without using an older booking'
            : agreementBooking.contract_status === 'signed'
              ? 'Contract is already signed'
              : agreementCanBeResent
                ? 'The client still needs to sign the current agreement'
                : 'Open the current contract record and review progress',
      onClick: !proposalInvoice
        ? () => openProposalBuilder()
        : !proposalAcceptedAt
          ? () => openProposalBuilder(proposalInvoice)
          : !agreementBooking
            ? () => handlePrepareAgreement(proposalInvoice)
            : agreementBooking.contract_status === 'signed'
              ? () => scrollToSection('lead-booking')
              : agreementCanBeResent
                ? () => handleContractRequestAction(agreementBooking, 'resend')
                : () => scrollToSection('lead-booking'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  }

  if (lead.status === 'new') {
    pushRecommendedAction({
      icon: <Calendar size={15} />,
      label: 'Schedule tour & send invite',
      detail: lead.email ? 'Create one branded calendar invite and later reminders' : 'Add an email address first',
      onClick: () => openTourScheduleModal('new_visit'),
      disabled: !lead.email,
    })
  }

  if (['attended', 'no_show', 'cancelled', 'rescheduled'].includes(lead.tour_attendance_status || '')) {
    pushRecommendedAction({
      icon: <Calendar size={15} />,
      label: 'Schedule another visit',
      detail: 'Create a separate visit and keep each visit’s follow-up history',
      onClick: () => openTourScheduleModal('new_visit'),
      disabled: !lead.email || lead.status === 'closed_lost',
    })
  }

  pushRecommendedAction({
    icon: <NotebookPen size={15} />,
    label: 'Log a quick call note',
    detail: 'Jump to the activity feed',
    onClick: () => {
      setNoteType('call_log')
      scrollToSection('lead-activity')
    },
  })

  pushRecommendedAction({
    icon: <ReceiptText size={15} />,
    label: 'Draft booking invoice',
    detail: 'Create deposit or event invoice',
    onClick: () => openProposalBuilder(),
  })

  if (lead.status !== 'closed_lost' && lead.status !== 'booked') {
    pushRecommendedAction({
      icon: <FileSignature size={15} />,
      label: !proposalInvoice
        ? 'Build final proposal'
        : proposalAcceptedAt && !agreementBooking
          ? 'Prepare agreement'
          : 'Edit proposal',
      detail: !proposalInvoice
        ? 'Calculate the exact package price for client selection'
        : proposalAcceptedAt && !agreementBooking
          ? 'The proposal is accepted; prepare its matching agreement'
          : 'Review the current final proposal',
      onClick: !proposalInvoice
        ? () => openProposalBuilder()
        : proposalAcceptedAt && !agreementBooking
          ? () => handlePrepareAgreement(proposalInvoice)
          : () => openProposalBuilder(proposalInvoice),
    })
  }

  const scrollToSection = (sectionId: string) => {
    const tabMap: Record<string, LeadDetailTab> = {
      'lead-overview': 'overview',
      'lead-activity': 'activity',
      'lead-tasks': 'tasks',
      'lead-booking': 'documents',
      'lead-billing': 'documents',
      'lead-documents': 'documents',
      'lead-messages': 'messages',
      'lead-notes': 'notes',
    }
    const nextTab = tabMap[sectionId] ?? 'overview'
    setActiveLeadTab(nextTab)
    if (nextTab === 'messages') {
      setActiveFeedTab('comms')
    }
    if (nextTab === 'notes') {
      setActiveFeedTab('notes')
    }
    if (nextTab === 'activity') {
      setActiveFeedTab('all')
    }
    if (nextTab === 'tasks') {
      setShowTaskTools(true)
    }
  }

  const quickNoteTemplates = [
    { label: 'Call recap', value: 'Call recap:\n- \nNext step:\n', type: 'call_log' as const },
    { label: 'Follow-up sent', value: 'Follow-up email sent:\n\n', type: 'email_log' as const },
    { label: 'Tour confirmed', value: 'Tour confirmed:\n\n', type: 'note' as const },
    { label: 'Proposal sent', value: 'Proposal sent:\n\n', type: 'email_log' as const },
  ]
  const activityEmptyTitle =
    activeFeedTab === 'notes'
      ? 'No note entries match this filter yet.'
      : activeFeedTab === 'comms'
        ? 'No calls or emails match this filter yet.'
        : activeFeedTab === 'system'
          ? 'No status updates match this filter yet.'
          : 'No activity has been logged yet.'
  const activityEmptyCopy =
    isLuxorTestInquiry(lead) && activeFeedTab === 'notes'
      ? 'Test notes and activity are saved to the isolated run and shown in Test History.'
      : isLuxorTestInquiry(lead) && activeFeedTab === 'comms'
        ? 'Use the isolated Test History controls for simulated client communication; this lead does not create production communication records.'
        : activeFeedTab === 'notes'
      ? 'Use the note box above to capture the first written follow-up or summary.'
      : activeFeedTab === 'comms'
        ? 'Add a call log, email note, or sync email history to populate this view.'
        : activeFeedTab === 'system'
          ? 'Status changes will appear here automatically when the lead moves.'
          : 'Use the note box above to add the first update or wait for email history to sync.'
  const activityFilterChips = [
    ...(activeFeedTab !== 'all' ? [{
      id: 'type',
      label: `Type: ${activeFeedTab === 'notes' ? 'notes' : activeFeedTab === 'comms' ? 'calls & email' : 'status changes'}`,
      onRemove: () => setActiveFeedTab('all'),
    }] : []),
    ...(activityWindow !== 'all' ? [{
      id: 'period',
      label: `Period: ${activityWindow === '30d' ? '30 days' : activityWindow === '90d' ? '90 days' : '1 year'}`,
      onRemove: () => setActivityWindow('all'),
    }] : []),
  ]

  const tabItems: Array<{ id: LeadDetailTab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity', count: activityCounts.all },
    { id: 'proposals', label: 'Proposals', count: clientProposals.length },
    { id: 'contract', label: 'Contract' },
    { id: 'payments', label: 'Payments' },
    { id: 'planning', label: 'Planning' },
    { id: 'messages', label: 'Messages', count: activityCounts.comms },
    { id: 'tasks', label: 'Tasks', count: pendingTaskCount },
    { id: 'vendors', label: 'Vendors', count: (lead?.metadata?.vendors as unknown[])?.length || 0 },
    { id: 'timeline', label: 'Timeline', count: (lead?.metadata?.timeline as unknown[])?.length || 0 },
    { id: 'documents', label: 'Documents', count: documents.length + signatureRequests.length },
    { id: 'notes', label: 'Notes', count: activityCounts.notes },
  ]
  const primaryLeadTabIds: LeadDetailTab[] = ['overview', 'activity', 'proposals', 'contract', 'payments', 'planning', 'messages', 'tasks']
  const isPrimaryLeadTab = (tabId: LeadDetailTab) => primaryLeadTabIds.includes(tabId)
  const primaryLeadTabs = tabItems.filter((item) => isPrimaryLeadTab(item.id))
  const secondaryLeadTabs = tabItems.filter((item) => !isPrimaryLeadTab(item.id))
  const selectLeadTab = (item: { id: LeadDetailTab }) => {
    setActiveLeadTab(item.id)
    if (!isPrimaryLeadTab(item.id)) setShowLeadTabOverflow(true)
    if (item.id === 'planning') setSelectedStageOverride('planning')
    if (item.id === 'messages') setActiveFeedTab('comms')
    if (item.id === 'notes') setActiveFeedTab('notes')
    if (item.id === 'activity') setActiveFeedTab('all')
    if (item.id === 'tasks') setShowTaskTools(true)
  }
  const linkedVendorRefs = (activeEventMetadata.vendors as Array<{ id: string; notes?: string }> | undefined) || []
  const linkedVendorIds = new Set(linkedVendorRefs.map((vendor) => vendor.id))
  const linkedVendors = linkedVendorRefs.map((vendorRef) => ({
    ref: vendorRef,
    vendor: allVendors.find((vendor) => vendor.id === vendorRef.id) || null,
  }))
  const timelineItems = ((activeEventMetadata.timeline as Array<{ time: string; title: string; description?: string }> | undefined) || [])
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => parseTimeToMinutes(a.item.time) - parseTimeToMinutes(b.item.time))

  const renderMarketingEngagementCard = () => (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Marketing Signals</p>
          <p className="mt-1 text-[10px] text-zinc-650 font-medium">
            {lead.email ? 'Opens, clicks, and campaign context for this lead.' : 'Add an email address to track campaign engagement.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => lead.email ? void fetchMarketingEngagement(lead.email) : undefined}
          disabled={!lead.email || loadingMarketingEngagement}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/20 hover:bg-[#caa24c]/10 hover:text-[#a8792f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={11} className={loadingMarketingEngagement ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {brochureClick === 'unavailable' ? (
        <p className="mb-3 text-xs text-[color:var(--portal-muted)]">Brochure click data unavailable.</p>
      ) : brochureClick && brochureClick.click_count > 0 ? (
        <p className="mb-3 text-xs text-[color:var(--portal-muted)]">
          <span className="font-semibold text-[color:var(--portal-text)]">Brochure link clicked</span> · {brochureClick.click_count} {brochureClick.click_count === 1 ? 'click' : 'clicks'}{brochureClick.latest_clicked_at ? ` · Last ${formatRelativeTime(brochureClick.latest_clicked_at)}` : ''}
        </p>
      ) : brochureClick ? (
        <p className="mb-3 text-xs text-[color:var(--portal-muted)]">No recorded brochure link clicks.</p>
      ) : null}

      {!lead.email ? (
        <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-4 py-4 text-xs leading-5 text-[color:var(--portal-muted)]">
          This lead has no email address yet, so Luxor cannot match campaign activity.
        </p>
      ) : marketingEngagementError ? (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-xs leading-5 text-red-200">
          {marketingEngagementError}
        </p>
      ) : loadingMarketingEngagement && !marketingEngagement ? (
        <p className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-4 text-xs leading-5 text-[color:var(--portal-muted)]">
          Loading marketing engagement...
        </p>
      ) : marketingEngagement ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SignalMetric
              label="Campaigns"
              value={String(marketingEngagement.total_campaigns)}
              detail={marketingEngagement.subscribed ? 'On marketing list' : 'Not on list'}
            />
            <SignalMetric
              label="Opens"
              value={String(marketingEngagement.total_opens)}
              detail={marketingEngagement.latest_opened_at ? `Last ${formatRelativeTime(marketingEngagement.latest_opened_at)}` : 'No opens yet'}
            />
            <SignalMetric
              label="Clicks"
              value={String(marketingEngagement.total_clicks)}
              detail={marketingEngagement.latest_clicked_at ? `Last ${formatRelativeTime(marketingEngagement.latest_clicked_at)}` : 'No clicks yet'}
            />
            <SignalMetric
              label="Latest Touch"
              value={marketingLastTouchedAt ? formatRelativeTime(marketingLastTouchedAt) : 'None'}
              detail={decodeHtmlEntities(marketingTopCampaign?.campaign_name || marketingTopCampaign?.campaign_subject) || 'No campaign activity'}
            />
          </div>

          {marketingTopCampaign ? (
            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#caa24c]">Most Recent Campaign</p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {decodeHtmlEntities(marketingTopCampaign.campaign_name || marketingTopCampaign.campaign_subject) || 'Untitled campaign'}
                  </p>
                  {marketingTopCampaign.campaign_subject && marketingTopCampaign.campaign_name !== marketingTopCampaign.campaign_subject ? (
                    <p className="mt-1 text-[11px] text-zinc-400">{decodeHtmlEntities(marketingTopCampaign.campaign_subject)}</p>
                  ) : null}
                </div>
                <span className="rounded border border-[#caa24c]/20 bg-[#caa24c]/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#caa24c]">
                  {marketingTopCampaign.recipient_status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">Audience</p>
                  <p className="mt-1 text-zinc-300">{marketingTopCampaign.audience_label || 'Manual list'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">Sent</p>
                  <p className="mt-1 text-zinc-300">{marketingTopCampaign.sent_at ? formatTimelineDate(marketingTopCampaign.sent_at) : 'Not sent yet'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">Opens</p>
                  <p className="mt-1 text-zinc-300">{marketingTopCampaign.open_count}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">Clicks</p>
                  <p className="mt-1 text-zinc-300">{marketingTopCampaign.click_count}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-4 py-4 text-xs leading-5 text-[color:var(--portal-muted)]">
              No marketing campaigns have reached this lead yet.
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Recent Opens & Clicks</p>
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-600">
                Auto-refreshes every 15s
              </span>
            </div>
            <div className="space-y-2.5">
              {marketingRecentEvents.length ? marketingRecentEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          event.event_type === 'click'
                            ? 'bg-[#caa24c]/12 text-[#caa24c]'
                            : 'bg-blue-500/10 text-blue-300'
                        }`}>
                          {event.event_type === 'click' ? <MousePointerClick size={11} /> : <Eye size={11} />}
                        </span>
                        <p className="text-xs font-bold text-white">
                          {event.event_type === 'click' ? 'Clicked a campaign link' : 'Opened a campaign email'}
                        </p>
                      </div>
                      <p className="mt-2 text-[11px] text-zinc-400">
                        {decodeHtmlEntities(event.campaign_name || event.campaign_subject) || 'Unknown campaign'}
                      </p>
                      {event.url ? (
                        <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">{shortenUrl(event.url)}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[9px] font-mono text-zinc-500">{formatRelativeTime(event.created_at)}</span>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-4 py-4 text-xs leading-5 text-[color:var(--portal-muted)]">
                  No open or click activity has been recorded for this lead yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )

  const displayEventType = currentEventType || 'Event'
  const displayEventDate = currentEventDate
  const displayGuestCount = currentEventGuestCount
  const clientSummaryLead = activeEventForDisplay
    ? { ...lead, event_type: activeEventForDisplay.event_type }
    : lead
  const requestedTourLanguage = getRequestedTourLanguage(lead)

  return (
    <PortalPageFrame className="max-w-[1560px] !gap-0">
      {lead.is_test && !activeTestRunId ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3" role="status">
        <p className="text-xs text-[color:var(--portal-muted)]">{loadingTestRun ? 'Preparing the isolated Test Lead run…' : 'This lead needs an active isolated run before tours or proposals can be simulated.'}</p>
        {!loadingTestRun ? <button type="button" onClick={() => void ensureActiveTestRun(true)} className="min-h-10 rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white">Start or resume isolated run</button> : null}
      </div> : null}
{invoices.some(invoice => invoice.same_day_booking_status === 'review') || payments.some(payment => payment.metadata?.deposit_receipt_review === true || (payment.metadata?.receipt_received && payment.status !== 'paid')) ? <div role="alert" className="mb-4 border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-sm leading-6 text-[color:var(--portal-text)]"><p className="font-semibold">Payment received — owner review required</p><p className="text-[color:var(--portal-muted)]">A payment needs review before the date can be confirmed. Do not collect another payment. Check the receipt and the date, including any other payment link in progress, before making changes.</p></div> : null}
{paymentLoadError ? <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/5 p-4 text-sm text-[color:var(--portal-text)]">{paymentLoadError}</div> : null}

      <div className="mb-4 flex shrink-0 items-center justify-between">
        <Link href="/portal/leads" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)]">
          <ArrowLeft size={13} /> Back to Leads & Clients
        </Link>
        {isLuxorInquiryArchived(lead) ? (
          <PortalStatusBadge status="Archived" tone="neutral" />
        ) : lead.status === 'tour_confirmed' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#f1d27a]">
            <Calendar size={12} /> {tourHeaderStatusLabel(lead)}
          </span>
        ) : <PortalStatusBadge status={proposalWorkflowDisplay.status} />}
      </div>

      <section className="overflow-visible rounded-t-2xl border border-b-0 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] sm:shadow-2xl sm:shadow-black/10">
        <div aria-label="Contact summary" className="relative grid gap-3 p-4 sm:gap-5 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-6">
          <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_2.75rem] items-start gap-x-3 gap-y-2 sm:flex sm:gap-4">
            <div className="relative col-start-1 row-start-1 h-12 w-12 shrink-0 self-start sm:h-20 sm:w-20">
              <PortalContactAvatar
                name={lead.full_name}
                avatarUrl={lead.metadata?.avatar_url as string | null}
                inquiryId={lead.id}
                size="2xl"
                className="h-12 w-12 text-lg sm:h-20 sm:w-20 sm:text-2xl sm:shadow-xl sm:shadow-black/10"
                onAvatarUpdate={(newUrl) => {
                  setLead((current) => current ? {
                    ...current,
                    metadata: {
                      ...(current.metadata || {}),
                      avatar_url: newUrl
                    }
                  } : null)
                }}
              />
              <div
                className="absolute bottom-0 right-0 hidden h-7 w-7 items-center justify-center rounded-full border-2 border-[color:var(--portal-card)] bg-[color:var(--portal-bg)] text-[#caa24c] shadow-md sm:flex"
                title={isNewsletter ? 'Newsletter subscriber' : `${displayEventType} event`}
                aria-label={isNewsletter ? 'Newsletter subscriber' : `${displayEventType} event`}
              >
                {isNewsletter ? <Mail size={13} /> : <EventTypeIcon eventType={displayEventType} />}
              </div>
            </div>
            <div className="contents sm:block sm:min-w-0 sm:pt-1">
              <div className="contents sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
                <div className="col-span-2 col-start-2 row-start-1 flex min-w-0 items-center gap-2 pr-12 sm:pr-0">
                  <h1 className="min-w-0 break-words font-serif text-2xl font-semibold leading-tight text-[color:var(--portal-text)] sm:text-4xl">{lead.full_name}</h1>
                  {lead.email ? (
                    <button
                      onClick={handleToggleMarketing}
                      disabled={togglingMarketing}
                      className="group relative inline-flex h-9 w-9 shrink-0 cursor-pointer select-none items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-50 sm:h-[18px] sm:w-[18px]"
                      aria-label={isSubscribed ? 'Remove from marketing list' : 'Add to marketing list'}
                      title={isSubscribed ? 'Remove from marketing list' : 'Add to marketing list'}
                    >
                      <div className="relative h-[18px] w-[18px] shrink-0">
                        <Star size={18} className="absolute inset-0 text-[color:var(--portal-muted)] transition-colors group-hover:text-[color:var(--portal-text)]" />
                        <div className="absolute bottom-0 left-0 right-0 overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ height: isSubscribed ? '18px' : '0px' }}>
                          <Star size={18} className="absolute bottom-0 left-0 fill-[#caa24c] text-[#caa24c]" style={{ width: '18px', height: '18px' }} />
                        </div>
                      </div>
                    </button>
                  ) : null}
                </div>
                {lead.phone ? (
                  <div className="col-span-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:contents">
                    <span className="inline-flex min-w-0 max-w-full items-center gap-2 text-sm leading-5 tabular-nums text-[color:var(--portal-text)] sm:col-span-3 sm:gap-1.5 sm:rounded-full sm:border sm:border-[color:var(--portal-border)] sm:bg-[color:var(--portal-soft)] sm:px-2.5 sm:py-1 sm:text-[10px] sm:font-semibold">
                      <Phone size={14} className="shrink-0 text-[color:var(--portal-muted)] sm:h-[11px] sm:w-[11px] sm:text-[#caa24c]" /> {formatPhoneDisplay(lead.phone)}
                    </span>
                    <span className="sm:hidden"><PortalSmsConsentBadge phone={lead.phone} initialConsent={smsConsent} compact /></span>
                  </div>
                ) : null}
                {lead.email ? (
                  <span className="col-span-3 inline-flex min-w-0 max-w-full items-start gap-2 text-sm leading-5 text-[color:var(--portal-text)] sm:gap-1.5 sm:rounded-full sm:border sm:border-[color:var(--portal-border)] sm:bg-[color:var(--portal-soft)] sm:px-2.5 sm:py-1 sm:text-[10px] sm:font-semibold">
                    <Mail size={14} className="mt-0.5 shrink-0 text-[color:var(--portal-muted)] sm:mt-0 sm:h-[11px] sm:w-[11px] sm:text-[#caa24c]" /><span className="min-w-0 [overflow-wrap:anywhere]">{lead.email}</span>
                  </span>
                ) : null}
                {emailNoticeResolution?.kind === 'warning' && !loadingEmailMessages ? (
                  <span className="col-span-3 inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/8 px-2.5 py-1 text-[10px] font-semibold text-rose-600 dark:text-rose-300">
                    {bouncedAddressMatchesCurrentEmail(lead) ? 'Email bounced · check address' : 'Earlier email address bounced'}
                  </span>
                ) : null}
                {showResolvedEmailNotice && emailNoticeResolution?.kind === 'resolved' ? (
                  <div role="status" aria-live="polite" className="col-span-3 flex min-w-0 basis-full items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5 text-emerald-800 dark:text-emerald-200 sm:px-3.5">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                    <p className="min-w-0 flex-1 break-words text-xs font-semibold leading-5">
                      {emailNoticeResolution.delivery === 'delivered' ? 'Delivered' : 'Successfully sent'} to {emailNoticeResolution.recipient}.
                    </p>
                    <button
                      type="button"
                      aria-label="Dismiss email delivery notice"
                      title="Dismiss notice"
                      onClick={() => {
                        const resolution = emailNoticeResolution
                        if (resolution?.kind !== 'resolved') return
                        let storage: Storage | null = null
                        try { storage = window.localStorage } catch { /* The in-memory notice still dismisses. */ }
                        const tracker = emailNoticeTracker || ensureLeadEmailNoticeTracker(storage, resolution)
                        setEmailNoticeTracker(dismissLeadEmailNoticeTracker(storage, resolution, tracker))
                      }}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-800 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 dark:text-emerald-200 dark:hover:bg-emerald-400/10"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                {lead.email && (
                  <div className="contents sm:flex sm:items-center sm:gap-3">
                    {isGrandOpeningLead ? (
                      <span className="col-span-3 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.16em] text-[#caa24c]">
                        Grand Opening
                      </span>
                    ) : null}
                    <AnimatePresence>
                      {marketingMessage && (
                        <motion.span
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 4 }}
                          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                          className={`col-span-3 text-[9px] font-black uppercase tracking-[0.18em] ${
                            marketingMessage === 'added' ? 'text-emerald-450' : 'text-zinc-550'
                          }`}
                        >
                          {marketingMessage === 'added' ? 'Added to marketing' : 'Removed from marketing'}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              <div className="col-span-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[color:var(--portal-muted)] sm:mt-1.5 sm:gap-x-2.5">
                {isNewsletter ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Newsletter
                  </span>
                ) : leadEvents.length > 0 ? (
                  <div className="relative min-w-0 max-w-full">
                    <button
                      ref={eventPickerTriggerRef}
                      type="button"
                      onClick={() => setShowEventPicker((current) => !current)}
                      aria-expanded={showEventPicker}
                      aria-haspopup="listbox"
                      className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1 text-left text-[13px] font-semibold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/50 hover:text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:hover:text-[#f1d27a] sm:min-h-0 sm:max-w-[260px] sm:rounded-md sm:px-2 sm:text-[10px] sm:font-black sm:uppercase sm:tracking-[0.08em]"
                    >
                      <EventTypeIcon eventType={displayEventType} />
                      <span className="truncate">{displayEventType}{leadEvents.length > 1 ? ` · ${leadEvents.length} events` : ''}</span>
                      <ChevronDown size={11} className="shrink-0 text-[#caa24c]" />
                    </button>
                    <AnimatePresence>
                      {showEventPicker ? (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                          role="listbox"
                          ref={eventPickerMenuRef}
                          className="portal-dropdown absolute left-0 top-full mt-1.5 z-[71] w-[min(340px,calc(100vw-2rem))] max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 shadow-2xl backdrop-blur-xl"
                        >
                          <div className="px-2.5 pb-1.5 pt-1 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Events under this lead</div>
                          {leadEvents.map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              role="option"
                              aria-selected={event.id === selectedLeadEvent?.id}
                              onClick={() => selectLeadEvent(event.id)}
                              className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${event.id === selectedLeadEvent?.id ? 'bg-[#caa24c]/15' : 'hover:bg-[color:var(--portal-soft)]'}`}
                            >
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#caa24c]/10 text-[#caa24c]"><EventTypeIcon eventType={event.event_type} /></span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-bold text-[color:var(--portal-text)]">{event.event_type || 'Event'}</span>
                                <span className="mt-0.5 block truncate text-[10px] text-[color:var(--portal-muted)]">
                                  {event.target_date ? formatDisplayDate(event.target_date) : 'Date TBD'} · {event.guest_count ? `${event.guest_count} guests` : 'Guest count open'} · {(event.pipeline_stage || 'inquiry').replaceAll('_', ' ')}
                                </span>
                              </span>
                              {event.id === selectedLeadEvent?.id ? <Check size={13} className="mt-1 shrink-0 text-[#caa24c]" /> : null}
                            </button>
                          ))}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : null}
                {requestedTourLanguage ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--portal-muted)] sm:rounded-full sm:border sm:border-[#caa24c]/35 sm:bg-[#caa24c]/10 sm:px-2.5 sm:py-1 sm:text-[9px] sm:font-black sm:uppercase sm:tracking-[0.14em] sm:text-[#a8792f] dark:sm:text-[#f1d27a]">
                    <Languages size={13} className="shrink-0" /><span className="capitalize">{requestedTourLanguage}<span className="hidden sm:inline">-speaking</span></span>
                  </span>
                ) : null}
                <p className="basis-full text-xs leading-5 text-[color:var(--portal-muted)] sm:basis-auto">
                  <span className="hidden sm:inline">Captured via </span><span className="capitalize font-medium sm:text-[color:var(--portal-text)]">{formatSourceLabel(lead)}</span><span className="sm:hidden"> · </span><span className="hidden sm:inline"> on </span><time dateTime={lead.created_at}><span className="sm:hidden">{new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="hidden sm:inline">{new Date(lead.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.</span></time>
                </p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-0.5 border-t-0 pt-0 sm:justify-start sm:gap-3 sm:border-0 sm:pt-0 lg:justify-end">
            {lead.phone ? <span className="hidden sm:inline-flex sm:basis-auto"><PortalSmsConsentBadge phone={lead.phone} initialConsent={smsConsent} compact /></span> : null}
            {lead.email && (
              <button 
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead } }))}
                className="hidden h-11 w-11 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 sm:inline-flex sm:h-9 sm:w-9"
                aria-label="Email client"
                title="Email client"
              >
                <Mail size={18} className="sm:h-[15px] sm:w-[15px]" />
              </button>
            )}
            {lead.phone && (
              <button
                type="button"
                onClick={() => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id })}
                className="hidden h-11 w-11 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 sm:inline-flex sm:h-9 sm:w-9"
                aria-label="Call client"
                title="Call client"
              >
                <Phone size={18} className="sm:h-[15px] sm:w-[15px]" />
              </button>
            )}
            {lead.phone && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('luxor-open-text', {
                      detail: { inquiryId: lead.id, phone: lead.phone, contactName: lead.full_name },
                    })
                  )
                }}
                className="hidden h-11 w-11 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 sm:inline-flex sm:h-9 sm:w-9"
                aria-label="Text client"
                title="Text client"
              >
                <MessageSquare size={18} className="sm:h-[15px] sm:w-[15px]" />
              </button>
            )}
            {lead.is_test ? <LuxorTestLeadPanel leadId={lead.id} /> : null}
            <div className="absolute right-3 top-3 z-10 sm:relative sm:right-auto sm:top-auto sm:z-auto">
              <button
                ref={actionsMenuTriggerRef}
                type="button"
                onClick={() => setShowActionsMenu((current) => !current)}
                aria-expanded={showActionsMenu}
                aria-haspopup="menu"
                aria-label="More lead options"
                title="More options"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 sm:h-9 sm:w-9"
              >
                <MoreVertical size={16} />
              </button>
              <AnimatePresence>
                {showActionsMenu ? (
                  <>
                    <div className="fixed inset-0 z-[70]" onClick={() => setShowActionsMenu(false)} />
                    <motion.div
                      ref={actionsMenuRef}
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                      role="menu"
                      data-portal-dropdown="true"
                      className="portal-dropdown absolute right-0 top-full mt-2 z-[71] w-64 max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-8rem)] overflow-y-auto portal-scrollbar rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 pb-2.5 shadow-2xl backdrop-blur-xl"
                    >
                      <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); actionsMenuTriggerRef.current?.focus(); setShowEnrollWorkflowModal(true) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                        <Workflow size={13} className="text-[#caa24c]" />
                        <span>Enroll in workflow</span>
                      </button>
                      <button type="button" role="menuitem" onClick={openAddEventModal} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                        <Plus size={13} className="text-[#caa24c]" />
                        <span>Add event</span>
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); actionsMenuTriggerRef.current?.focus(); openProposalBuilder() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                        <ReceiptText size={13} className="text-[#caa24c]" />
                        <span>Create invoice for selected event</span>
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); actionsMenuTriggerRef.current?.focus(); setActiveLeadTab('documents') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                        <FileText size={13} className="text-[#caa24c]" />
                        <span>View invoices & documents</span>
                      </button>
                      {hasCancellableTour(lead) ? (
                        <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); actionsMenuTriggerRef.current?.focus(); setLeadLifecycleAction('cancel-tour') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                          <Calendar size={13} className="text-[#caa24c]" />
                          <span>Cancel scheduled tour</span>
                        </button>
                      ) : null}
                      {lead.phone ? (
                        <div className="mt-1 border-t border-[color:var(--portal-border)] pt-1">
                          <p className="px-3 py-1 font-mono text-[8px] uppercase tracking-widest text-[color:var(--portal-muted)]">SMS Messaging</p>
                          {smsConsent?.status === 'opted_in' ? (
                            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                              <Check size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                              <span>SMS consent active</span>
                            </div>
                          ) : (
                            <>
                              {smsConsent?.status === 'opted_out' ? (
                                <p className="px-3 py-1 text-[9px] leading-tight text-red-600 dark:text-red-400">
                                  Client opted out (STOP keyword).
                                </p>
                              ) : null}
                              {smsConsent?.consent_request_status === 'pending' ? (
                                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold text-[color:var(--portal-muted)]">
                                  <MessageSquare size={13} className="shrink-0 text-[#caa24c]" />
                                  <span>Verification text sent · waiting for YES</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => void requestSmsConsent()}
                                  disabled={consentRequestSending}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a] disabled:opacity-50"
                                >
                                  <MessageSquare size={13} className="shrink-0 text-[#caa24c]" />
                                  <span>
                                    {consentRequestSending
                                      ? 'Sending verification…'
                                      : smsConsent?.consent_request_status === 'failed'
                                      ? 'Retry verification text'
                                      : 'Send verification text'}
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => void manualOptIn()}
                                disabled={manualOptInLoading}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                              >
                                <ShieldCheck size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                                <span>{manualOptInLoading ? 'Recording opt-in…' : 'Manually opt in to SMS'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                      {!lead.is_test && !isLuxorInquiryArchived(lead) ? (
                        <div className="mt-1 border-t border-[color:var(--portal-border)] pt-1.5">
                          <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); actionsMenuTriggerRef.current?.focus(); setLeadLifecycleAction('archive') }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/[0.07] px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 hover:bg-[#caa24c]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/35">
                            <Archive size={13} className="text-[#a8792f] dark:text-[#f1d27a]" />
                            <span>Archive Lead</span>
                          </button>
                        </div>
                      ) : null}
                    </motion.div>
                  </>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <section aria-label="Lead essentials" className="grid grid-cols-2 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 sm:grid-cols-3 xl:grid-cols-6">
          {(isNewsletter ? [
            { label: 'Current stage', value: (selectedStageOverride || activeStage).replaceAll('_', ' ') },
            { label: 'Contact', value: lead.full_name },
            { label: 'Email', value: lead.email || 'None' },
            { label: 'Phone', value: lead.phone ? formatPhoneDisplay(lead.phone) : 'None' },
            { label: 'Language', value: requestedTourLanguage ? `${requestedTourLanguage}` : 'English' },
            { label: 'Source', value: formatSourceLabel(lead) },
          ] : [
            { label: 'Current stage', value: (selectedStageOverride || activeStage).replaceAll('_', ' ') },
            { label: 'Event', value: displayEventType },
            { label: 'Event date', value: displayEventDate ? formatDisplayDate(displayEventDate) : 'Date TBD' },
            { label: 'Tour', value: lead.preferred_tour_date ? `${formatDisplayDate(lead.preferred_tour_date)}${lead.preferred_tour_time ? ` · ${formatTimeString(lead.preferred_tour_time)}` : ''}` : 'Not scheduled' },
            { label: 'Guests', value: displayGuestCount ? `${displayGuestCount} expected` : 'Not captured' },
            { label: 'Package Interest', value: currentEventPackageInterest || 'Not captured' },
          ]).map((item) => (
            <div key={item.label} className="min-w-0 border-b border-r border-[color:var(--portal-border)] px-3 py-2.5 sm:px-4 sm:py-3 last:border-r-0 sm:[&:nth-child(3n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(3n)]:border-r xl:last:border-r-0">
              <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">{item.label}</p>
              <p className="mt-1 break-words text-[11px] font-bold capitalize text-[color:var(--portal-text)]" title={item.value}>{item.value}</p>
            </div>
          ))}
        </section>

        {correctEmailResendOptions.length > 0 || bouncedAddressMatchesCurrentEmail(lead) ? (
          <div className="flex flex-col gap-2 border-t border-[color:var(--portal-border)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
            <p className="text-xs text-[color:var(--portal-muted)]">
              {correctEmailResendOptions.find((option) => option.id === correctEmailResendSuggestedId)?.bounced
                ? 'The latest eligible bounced email is ready to review.'
                : correctEmailResendOptions.length ? 'A saved lead email is available to resend.' : 'Confirm the corrected address before any further sends.'}
            </p>
            <button type="button" onClick={() => setCorrectEmailResendOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#b68d3b] sm:self-auto">
              <Mail size={13} /> Correct email &amp; resend
            </button>
          </div>
        ) : null}

        <div className="border-t border-[color:var(--portal-border)] px-5 py-4 lg:px-6">
          <LeadLifecycleRail
            lead={lifecycleLead || lead}
            bookings={eventBookings}
            latestBooking={agreementBooking}
            latestInvoice={proposalInvoice}
            hasAcceptedProposalEvidence={proposalWorkflowDisplay.proposalAccepted}
            agreementDeliveryConfirmed={agreementDeliveryConfirmed}
            agreementDeliveryPending={agreementDeliveryPending}
            isSaving={updatingStatus}
            activeStageId={selectedStageOverride || activeStage}
            onStepClick={(stageId) => {
              setSelectedStageOverride(stageId)
              setActiveLeadTab(stageId === 'proposal' ? 'proposals' : stageId === 'contract' ? 'contract' : ['deposit', 'final_payment'].includes(stageId) ? 'payments' : stageId === 'planning' ? 'planning' : 'overview')
            }}
          />
        </div>
      </section>

      <div
        className="sticky -top-4 z-30 -mt-px overflow-hidden rounded-b-2xl border border-[color:var(--portal-border)] shadow-lg shadow-black/10 sm:-top-6 lg:-top-8"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--portal-bg) 97%, transparent)',
          backdropFilter: 'blur(50px)',
          WebkitBackdropFilter: 'blur(50px)',
        }}
      >
        {/* Compact section navigation for phones and tablets. */}
        <div className="flex items-stretch gap-3 px-3 py-2.5 md:px-4 md:py-3 xl:hidden">
          {(() => {
            const activeItem = tabItems.find((item) => item.id === activeLeadTab) || tabItems[0]
            return (
              <button
                ref={sectionMenuTriggerRef}
                type="button"
                onClick={() => setMobileSectionDrawerOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={mobileSectionDrawerOpen}
                aria-controls={sectionMenuId}
                className="flex min-h-11 min-w-0 w-full flex-1 items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-2 text-left shadow-sm transition-colors hover:border-[#caa24c]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 md:min-h-16 md:px-4"
              >
                <span className="min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)] md:text-[10px]">Dossier section</span>
                  <span className="mt-0.5 flex items-center gap-2 truncate text-xs font-bold text-[color:var(--portal-text)] md:text-sm">
                    <span>{activeItem.label}</span>
                    {typeof activeItem.count === 'number' ? (
                      <span className="rounded-full bg-[#caa24c]/15 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-[#a8792f] dark:text-[#f1d27a] md:text-[11px] md:text-[#8c6529] dark:md:text-[#f1d27a]">
                        {activeItem.count}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#a8792f] dark:text-[#f1d27a] md:px-3 md:py-2 md:text-[13px] md:font-semibold md:normal-case md:tracking-normal md:text-[#8c6529] dark:md:text-[#f1d27a]">
                  <Menu size={13} />
                  Browse sections
                  <ChevronDown size={13} />
                </span>
              </button>
            )
          })()}
          {(activeLeadTab === 'overview' || activeLeadTab === 'planning') ? (
            <button
              type="button"
              onClick={() => setShowClientSidebar((current) => !current)}
              aria-pressed={!showClientSidebar}
              title={showClientSidebar ? 'Hide Client Summary' : 'Show Client Summary'}
              className={`hidden shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 md:inline-flex ${!showClientSidebar ? 'border-[#caa24c]/45 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'}`}
            >
              {showClientSidebar ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
              {showClientSidebar ? 'Focus view' : 'Show summary'}
            </button>
          ) : null}
        </div>

        {/* Full tab bar for wide desktop layouts. */}
        <div className="hidden bg-transparent px-4 xl:block">
          <div className="flex items-center justify-between gap-3">
            <div role="tablist" aria-label="Client sections" className="relative flex min-w-0 flex-1 gap-5 overflow-x-auto portal-scrollbar">
              <span
                className="absolute bottom-0 h-0.5 rounded-full bg-[#caa24c] transition-[left,width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{ left: tabIndicator.left, width: tabIndicator.width }}
              />
              {primaryLeadTabs.map((item) => {
                const isActive = activeLeadTab === item.id
                return (
                  <button
                    key={item.id}
                    ref={(node) => {
                      tabButtonRefs.current[item.id] = node
                    }}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => selectLeadTab(item)}
                    className={`relative inline-flex shrink-0 items-center gap-2 px-0 py-3 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${isActive ? 'text-[#a8792f] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
                  >
                    {item.label}
                    {typeof item.count === 'number' ? <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold tabular-nums ${isActive ? 'bg-[#caa24c]/12 text-[#a8792f] dark:text-[#f1d27a]' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>{item.count}</span> : null}
                  </button>
                )
              })}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setShowLeadTabOverflow((current) => !current)} aria-expanded={showLeadTabOverflow} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#a8792f] transition-colors hover:bg-[#caa24c]/10 dark:text-[#f1d27a]">
                {showLeadTabOverflow ? 'Hide sections' : 'More sections'} <ChevronDown size={12} className={showLeadTabOverflow ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {(activeLeadTab === 'overview' || activeLeadTab === 'planning') ? (
                <button
                  type="button"
                  onClick={() => setShowClientSidebar((current) => !current)}
                  title={showClientSidebar ? 'Hide Client Summary sidebar for full-width presentation view' : 'Show Client Summary sidebar'}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] transition-colors ${
                    !showClientSidebar
                      ? 'border-[#caa24c]/45 bg-[#caa24c]/15 text-[#a8792f] dark:text-[#f1d27a]'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  {showClientSidebar ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
                  <span className="hidden sm:inline">{showClientSidebar ? 'Focus View' : 'Show Summary'}</span>
                </button>
              ) : null}
            </div>
          </div>
          {showLeadTabOverflow ? (
            <div role="tablist" aria-label="Additional client sections" className="mt-1 flex flex-wrap gap-1 border-t border-[color:var(--portal-border)] py-1.5">
              {secondaryLeadTabs.map((item) => {
                const isActive = activeLeadTab === item.id
                return <button key={item.id} ref={(node) => { tabButtonRefs.current[item.id] = node }} type="button" role="tab" aria-selected={isActive} onClick={() => selectLeadTab(item)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] ${isActive ? 'bg-[#caa24c]/12 text-[#a8792f] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}>
                  {item.label}{typeof item.count === 'number' ? <span className="text-[8px] font-bold tabular-nums opacity-70">{item.count}</span> : null}
                </button>
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom sheet on phones; centered section chooser on tablets. */}
      {mobileSectionDrawerOpen && typeof document !== 'undefined' ? createPortal(
        <div
          id={sectionMenuId}
          className="fixed inset-0 z-[70] flex items-end bg-black/60 pb-[calc(4.5rem+env(safe-area-inset-bottom))] backdrop-blur-xs md:items-center md:justify-center md:bg-black/45! md:p-6 md:backdrop-blur-none xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Browse dossier sections"
          onClick={() => setMobileSectionDrawerOpen(false)}
        >
          <div
            ref={sectionMenuPanelRef}
            className="max-h-[75dvh] w-full overflow-y-auto rounded-t-2xl border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 pb-6 shadow-2xl md:max-h-[80dvh] md:max-w-2xl md:overscroll-contain md:rounded-2xl md:border md:bg-[color:var(--portal-frame)] md:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#f1d27a]">Client Dossier</p>
                <h2 className="mt-0.5 text-sm font-bold text-[color:var(--portal-text)] md:text-lg">Choose a section</h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileSectionDrawerOpen(false)}
                aria-label="Close sections menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 md:h-11 md:w-11"
              >
                <X size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
              {tabItems.map((item) => {
                const isActive = activeLeadTab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      selectLeadTab(item)
                      setMobileSectionDrawerOpen(false)
                    }}
                    className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 md:min-h-14 md:px-4 ${
                      isActive
                        ? 'border-[#caa24c]/50 bg-[#caa24c]/12 text-[#a8792f] dark:text-[#f1d27a] md:text-[#8c6529] dark:md:text-[#f1d27a]'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 text-[color:var(--portal-text)] hover:border-[#caa24c]/30'
                    }`}
                  >
                    <span className="truncate text-[11px] font-black uppercase tracking-[0.08em] md:text-sm md:font-semibold md:normal-case md:tracking-normal">{item.label}</span>
                    {typeof item.count === 'number' ? (
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums md:text-[11px] ${
                        isActive ? 'bg-[#caa24c]/20 text-[#a8792f] dark:text-[#f1d27a]' : 'bg-[color:var(--portal-card)] text-[color:var(--portal-muted)]'
                      }`}>
                        {item.count}
                      </span>
                    ) : isActive ? (
                      <Check size={13} className="shrink-0 text-[#caa24c]" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      <section id="lead-messages" aria-labelledby="original-inquiry-heading" className="mt-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id="original-inquiry-heading" className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">
            {isGrandOpeningLead ? 'Original RSVP note' : 'Original inquiry'}
          </h2>
          <div className="flex w-full min-w-0 flex-col items-stretch gap-x-3 gap-y-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            <p className="text-[10px] text-[color:var(--portal-muted)]">{formatSourceLabel(lead)} · {formatDisplayDate(lead.created_at)}</p>
            {lead.email ? (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: {
                  lead,
                  purpose: 'inquiry-response',
                  initialSubject: `Your ${lead.event_type?.trim() || 'event'} inquiry at Luxor`,
                } }))}
                className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-3 text-[11px] font-semibold text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 sm:w-auto"
              >
                <Mail size={14} aria-hidden="true" /> Respond to inquiry
              </button>
            ) : null}
          </div>
        </div>
        <div
          key={activeLeadTab}
          className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--portal-text)] ${isLongOriginalInquiry && !isOriginalInquiryExpanded ? 'line-clamp-4' : ''}`}
          style={{ color: 'var(--portal-text)', opacity: 1, visibility: 'visible' }}
        >
          {originalInquiryText}
        </div>
        {isLongOriginalInquiry ? (
          <button
            type="button"
            aria-expanded={isOriginalInquiryExpanded}
            onClick={() => setExpandedOriginalInquiryId(isOriginalInquiryExpanded ? null : lead.id)}
            className="mt-2 min-h-10 text-xs font-semibold text-[#8c6529] underline decoration-[#caa24c]/50 underline-offset-4 hover:text-[#a8792f] dark:text-[#f1d27a] dark:hover:text-[#ffe6a0]"
          >
            {isOriginalInquiryExpanded ? 'Show less' : 'Read full request'}
          </button>
        ) : null}
      </section>

      {activeLeadTab === 'overview' || activeLeadTab === 'planning' ? (
        <div ref={dualPaneContainerRef} className="mt-4 flex flex-col gap-6 pb-12 sm:pb-16 xl:flex-row xl:items-start xl:gap-0">
          {/* Left Column (Columns 1 & 2): Dossier main sections */}
          <div ref={dualPaneLeftRef} className="min-w-0 flex-1 space-y-6">
            {activeLeadTab === 'planning' && isLuxorTestInquiry(lead) && activeTestRunId ? <LuxorTestLeadWorkflow leadName={lead.full_name} runId={activeTestRunId} section="planning" onOpenProposal={() => openProposalBuilder()} /> : null}

            
            {/* Stage-specific Content Router */}
            {(() => {
              const currentStage = activeLeadTab === 'planning' ? 'planning' : selectedStageOverride || activeStage
              
              if (currentStage === 'newsletter') {
                return (
                  <>
                    {/* Next Move */}
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.08)"
                    >
                      <BorderBeam size={75} duration={12} colorFrom="#caa24c" colorTo="#f1d27a" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-xs">
                            <Mail size={18} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-400">Newsletter Subscriber</p>
                            <h2 className="mt-1 text-sm font-bold leading-snug text-[color:var(--portal-text)]">Active on Newsletter List</h2>
                            <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--portal-muted)]">
                              This contact signed up for Luxor updates and open house invitations. No event or tour inquiry has been submitted yet.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 border-y border-[color:var(--portal-border)] py-3 text-left sm:flex sm:border-y-0 sm:border-l sm:py-0 sm:pl-4 xl:shrink-0">
                          <div className="min-w-0 sm:min-w-[86px]">
                            <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Source</p>
                            <p className="mt-1 truncate text-[10px] font-bold capitalize text-[color:var(--portal-text)]">{formatSourceLabel(lead)}</p>
                          </div>
                          <div className="min-w-0 sm:min-w-[86px]">
                            <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Subscribed</p>
                            <p className="mt-1 text-[10px] font-bold text-[color:var(--portal-text)]">{formatDisplayDate(lead.created_at)}</p>
                          </div>
                          <div className="min-w-0 sm:min-w-[86px]">
                            <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Marketing</p>
                            <p className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Subscribed</p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 xl:justify-end">
                          <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead } }))}
                            disabled={!lead.email}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-md shadow-[#caa24c]/10 transition-all hover:bg-[#dfbd68] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Mail size={13} /> Send Email
                          </button>
                          <button
                            type="button"
                            onClick={() => openTourScheduleModal('new_visit')}
                            disabled={!lead.email}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/50 hover:text-[#a8792f] dark:hover:text-[#f1d27a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Calendar size={13} /> Schedule Tour
                          </button>
                        </div>
                      </div>
                    </MagicCard>

                    {/* Subscriber Details Card */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-3 luxor-soft-enter">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)] mb-2">Subscriber Information</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-3">
                          <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Full Name</p>
                          <p className="mt-1 font-bold text-[color:var(--portal-text)]">{lead.full_name}</p>
                        </div>
                        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-3">
                          <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Email Address</p>
                          <p className="mt-1 font-bold text-[color:var(--portal-text)]">{lead.email || 'None'}</p>
                        </div>
                        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-3">
                          <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Phone Number</p>
                          <p className="mt-1 font-bold tabular-nums text-[color:var(--portal-text)]">{lead.phone ? formatPhoneDisplay(lead.phone) : 'Not provided'}</p>
                        </div>
                        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-3">
                          <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Language Preference</p>
                          <p className="mt-1 font-bold text-[color:var(--portal-text)]">{requestedTourLanguage || 'English'}</p>
                        </div>
                        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-3">
                          <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Signup Date</p>
                          <p className="mt-1 font-bold text-[color:var(--portal-text)]">{formatDisplayDate(lead.created_at)}</p>
                        </div>
                        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-3">
                          <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Pipeline Stage</p>
                          <p className="mt-1 font-bold text-emerald-600 dark:text-emerald-400">Newsletter</p>
                        </div>
                      </div>
                    </section>
                  </>
                )
              }

              if (currentStage === 'inquiry') {
                return (
                  <>
                    {/* Next Move */}
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.08)"
                    >
                      <BorderBeam size={75} duration={12} colorFrom="#caa24c" colorTo="#f1d27a" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <ClipboardCheck size={18} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h2 className="mt-1 text-sm font-bold leading-snug text-[color:var(--portal-text)]">{nextBestMove.title}</h2>
                            <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--portal-muted)]">{nextBestMove.detail}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 border-y border-[color:var(--portal-border)] py-3 text-left sm:flex sm:border-y-0 sm:border-l sm:py-0 sm:pl-4 xl:shrink-0">
                          <div className="min-w-0 sm:min-w-[86px]">
                            <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Source</p>
                            <p className="mt-1 truncate text-[10px] font-bold capitalize text-[color:var(--portal-text)]">{formatSourceLabel(lead)}</p>
                          </div>
                          <div className="min-w-0 sm:min-w-[86px]">
                            <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Inquiry</p>
                            <p className="mt-1 text-[10px] font-bold text-[color:var(--portal-text)]">{formatDisplayDate(lead.created_at)}</p>
                          </div>
                          <div className="min-w-0 sm:min-w-[86px]">
                            <p className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Lead Score</p>
                            <p className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">High / Hot</p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 xl:justify-end">
                          <button
                            type="button"
                            onClick={() => openTourScheduleModal('new_visit')}
                            disabled={!lead.email}
                            title={lead.email ? 'Schedule the tour and send the calendar invite' : 'Add an email address before sending an invite'}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-md shadow-[#caa24c]/10 transition-all hover:bg-[#dfbd68] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Calendar size={13} /> Schedule Invite
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGuidedStatusChange('tour_confirmed')}
                            disabled={updatingStatus || !lead.preferred_tour_date || !lead.preferred_tour_time}
                            aria-label="Move to the next step without sending an invite"
                            title={lead.preferred_tour_date && lead.preferred_tour_time ? 'Tour already scheduled — move to the next step without sending an invite' : 'Add a tour date and time first'}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/5 text-[#a8792f] dark:text-[#d8b568] transition-colors hover:bg-[#caa24c]/10 hover:text-[#f1d27a] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <CheckCircle2 size={15} className={updatingStatus ? 'animate-pulse' : ''} />
                          </button>
                        </div>
                      </div>
                    </MagicCard>

                    {/* Event Details */}
                    <section id="event-details" className="scroll-mt-24 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Event Details</p>
                        <div className="flex shrink-0 items-center gap-2">
                          {isEventDetailsEditing ? (
                            <>
                              <button type="button" onClick={cancelEventDetailsEdit} disabled={Boolean(savingLeadField)} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50">Cancel</button>
                              <button type="button" onClick={() => void saveEventDetails()} disabled={Boolean(savingLeadField)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#caa24c] px-3 text-xs font-semibold text-white hover:bg-[#b98a3d] disabled:opacity-50"><Check size={13} /> Save</button>
                            </>
                          ) : (
                            <button type="button" onClick={beginEventDetailsEdit} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]"><Pencil size={13} /> Edit</button>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                        <div className="space-y-1">
                          {eventDetails.slice(0, 3).map((item) => (
                            <DetailItem
                              key={item.label}
                              icon={item.icon}
                              label={item.label}
                              value={item.value}
                              editValue={item.editValue}
                              copyValue={undefined}
                              inputType={item.inputType}
                              placeholder={item.placeholder}
                              isMono={item.isMono}
                              isSaving={savingLeadField === item.field}
                              onCommit={isEventDetailsEditing && !item.readOnly && item.field !== 'venue_access_time' && item.field !== 'event_time' ? (value) => handleLeadFieldUpdate(item.field as EditableLeadField, value) : undefined}
                              sectionEditing={isEventDetailsEditing && !item.readOnly}
                              sectionDraftValue={eventDetailsDraft[item.field] ?? item.editValue}
                              onSectionDraftChange={(value) => setEventDetailsDraft((current) => ({ ...current, [item.field]: value }))}
                              options={item.options}
                            />
                          ))}
                        </div>
                        <div className="space-y-1">
                          {eventDetails.slice(3).map((item) => (
                            <DetailItem
                              key={item.label}
                              icon={item.icon}
                              label={item.label}
                              value={item.value}
                              editValue={item.editValue}
                              copyValue={undefined}
                              inputType={item.inputType}
                              placeholder={item.placeholder}
                              isMono={item.isMono}
                              isSaving={savingLeadField === item.field}
                              onCommit={isEventDetailsEditing && !item.readOnly && item.field !== 'venue_access_time' && item.field !== 'event_time' ? (value) => handleLeadFieldUpdate(item.field as EditableLeadField, value) : undefined}
                              sectionEditing={isEventDetailsEditing && !item.readOnly}
                              sectionDraftValue={eventDetailsDraft[item.field] ?? item.editValue}
                              onSectionDraftChange={(value) => setEventDetailsDraft((current) => ({ ...current, [item.field]: value }))}
                              options={item.options}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Internal Metadata */}
                      <div className="mt-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500">Internal metadata</p>
                            <p className="mt-1 text-xs text-zinc-650">Source, campaign, and referrer fields.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowInternalSignals((current) => !current)}
                            className="inline-flex items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/20 hover:bg-[#caa24c]/10 hover:text-[#a8792f] cursor-pointer"
                          >
                            {showInternalSignals ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {showInternalSignals ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {internalDetails.map((item) => (
                              <DetailItem
                                key={item.label}
                                label={item.label}
                                value={item.value}
                                copyValue={item.value === 'None' || item.value === 'Not captured' ? '' : item.value}
                                isMono={item.isMono}
                                subtext={item.subtext}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {/* Tour & Proposal Prep Intake */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                      <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#caa24c]">Tour & Proposal Prep Intake</p>
                          <p className="text-[9px] text-zinc-555 mt-0.5">Collect during intake call to prepare for the tour & proposal</p>
                        </div>
                        {!isEditingTourAttendance && (
                          <button
                            type="button"
                            onClick={openTourDetailsEditor}
                            className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#caa24c] hover:bg-[#caa24c]/10 transition-colors cursor-pointer"
                          >
                            Edit Intake
                          </button>
                        )}
                      </div>

                      {isEditingTourAttendance ? (
                        <div className="space-y-4 text-left">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Target Budget</label>
                              <input
                                type="text"
                                value={tourBudget}
                                onChange={(e) => setTourBudget(e.target.value)}
                                placeholder="e.g. $5,000"
                                className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Guests Attending Tour</label>
                              <input
                                type="text"
                                value={tourGuests}
                                onChange={(e) => setTourGuests(e.target.value)}
                                placeholder="e.g. Miguel Martinez"
                                className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Catering & Bar Preferences</label>
                            <input
                              type="text"
                              value={cateringPreferences}
                              onChange={(e) => setCateringPreferences(e.target.value)}
                              placeholder="e.g. Outside catering, open bar setup"
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Intake Notes / Key Requirements</label>
                            <textarea
                              value={tourNotes}
                              onChange={(e) => setTourNotes(e.target.value)}
                              rows={3}
                              placeholder="e.g. Looking for black and gold decor theme, needs coordinator help..."
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none resize-none"
                            />
                          </div>

                          <div className="flex gap-2 justify-end pt-2 border-t border-[color:var(--portal-border)]">
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingTourAttendance(false)
                                setTourGuests(String(lead.metadata?.tourGuests || ''))
                                setTourNotes(String(lead.metadata?.tourNotes || ''))
                                setTourBudget(String(lead.metadata?.estimatedBudget || ''))
                                setCateringPreferences(String(lead.metadata?.cateringPreferences || ''))
                              }}
                              className="px-3 py-1.5 rounded border border-zinc-800 text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveTourAttendance}
                              disabled={savingTourAttendance}
                              className="px-4 py-1.5 rounded bg-[#caa24c] text-[10px] font-black uppercase text-white hover:bg-[#dfbd68] transition-all cursor-pointer"
                            >
                              {savingTourAttendance ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-left">
                          <div className="space-y-3.5">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Target Budget</p>
                                <p className="font-semibold text-[color:var(--portal-text)] mt-0.5">{tourBudget || 'Not captured'}</p>
                              </div>
                              <div>
                                <p className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Guests on Tour</p>
                                <p className="font-semibold text-[color:var(--portal-text)] mt-0.5">{tourGuests || 'None specified'}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Catering Preferences</p>
                              <p className="font-semibold text-[color:var(--portal-text)] mt-0.5">{cateringPreferences || 'Not captured'}</p>
                            </div>
                          </div>
                          <div className="border-t sm:border-t-0 sm:border-l border-[color:var(--portal-border)] pt-3.5 sm:pt-0 sm:pl-4 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Intake / Specific Requirements</p>
                            <p className="text-[color:var(--portal-muted)] italic leading-relaxed mt-0.5">&ldquo;{tourNotes || 'No tour notes captured yet.'}&rdquo;</p>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Recent Activity */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Recent Activity</p>
                        <button
                          type="button"
                          onClick={() => setActiveLeadTab('activity')}
                          className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer"
                        >
                          View all activity &rarr;
                        </button>
                      </div>

                      <div className="space-y-4">
                        {allActivityEntries.length === 0 ? (
                          <p className="text-xs text-[color:var(--portal-muted)] italic py-4">No recent activity logged yet.</p>
                        ) : (
                          allActivityEntries.slice(0, 5).map((entry) => {
                            const isEmail = entry.kind === 'email'
                            const isCall = entry.kind === 'call'
                            return (
                              <div key={entry.id} className={`group relative flex items-center justify-between rounded-lg border-b border-[color:var(--portal-border)]/50 px-2 py-2 last:border-0 transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${isEmail ? 'cursor-pointer hover:-translate-y-px hover:bg-[#caa24c]/10 hover:shadow-sm hover:shadow-[#caa24c]/10' : 'hover:bg-[color:var(--portal-soft)]'}`}>
                                {isEmail ? (
                                  <Link href={emailReaderUrl(entry.email)} aria-label={`Open email: ${decodeHtmlEntities(entry.email.subject)}`} className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40" />
                                ) : null}
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105 ${
                                    isEmail
                                      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' 
                                      : isCall || entry.note.note_type === 'call_log'
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : entry.note.note_type === 'email_log'
                                      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                      : 'bg-zinc-500/10 text-[color:var(--portal-muted)]'
                                  }`}>
                                    {isEmail ? (
                                      <Mail size={13} />
                                    ) : isCall || entry.note.note_type === 'call_log' ? (
                                      <Phone size={13} />
                                    ) : (
                                      <FileText size={13} />
                                    )}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold leading-tight text-[color:var(--portal-text)] truncate transition-colors duration-200 group-hover:text-[#a8792f] dark:group-hover:text-[#f1d27a]">
                                      {isEmail ? decodeHtmlEntities(entry.email.subject) : isCall ? describeActivityEntry(entry) : decodeHtmlEntities(entry.note.content).substring(0, 45)}
                                    </p>
                                  </div>
                                </div>
                                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                                  <span className="text-[10px] font-semibold tabular-nums text-[color:var(--portal-muted)] transition-transform duration-200 group-hover:-translate-x-0.5">
                                    {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                  </span>
                                  {isEmail ? <ChevronRight size={14} className="-translate-x-1 text-[#a8792f] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 dark:text-[#f1d27a]" /> : null}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </section>

                    {/* Concierge AI session replay */}
                    {chatMessages.length > 0 && (
                      <div className="nodal-void-card overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xl luxor-soft-enter">
                        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[color:var(--portal-muted)]">Concierge AI Chat Session Replay</h4>
                          <span className="rounded border border-[#caa24c]/20 bg-[#caa24c]/10 px-2 py-0.5 text-[9px] font-bold uppercase text-[#a8792f]">Elena AI</span>
                        </div>
                        <div className="space-y-4 bg-[color:var(--portal-card)] p-4 max-h-[260px] overflow-y-auto portal-scrollbar">
                          {chatMessages.map((msg, index) => {
                            const isUser = msg.role === 'user'
                            return (
                              <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs font-medium leading-relaxed shadow-sm ${
                                  isUser
                                    ? 'border border-[#caa24c]/25 bg-[#caa24c]/10 text-[color:var(--portal-text)]'
                                    : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'
                                }`}>
                                  <div className={`mb-1 text-[8px] font-bold uppercase tracking-widest ${isUser ? 'text-[#a8792f]' : 'text-[color:var(--portal-muted)]'}`}>
                                    {isUser ? 'Client' : 'Elena AI'}
                                  </div>
                                  {msg.content}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )
              }
              
              if (currentStage === 'tour') {
                return (
                  <>
                    {/* Confirmed booking state / tour scheduling action */}
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.08)"
                    >
                      <BorderBeam size={75} duration={12} colorFrom="#caa24c" colorTo="#f1d27a" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <Calendar size={18} />
                          </span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">
                              {tourDisplayStatus(lead) === 'Confirmed' ? 'Tour Confirmed' : tourDisplayStatus(lead) === 'Requested' ? 'Tour Time Needed' : 'Tour'}
                            </p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              {tourDisplayStatus(lead) === 'Confirmed'
                                ? `${lead.preferred_tour_date ? formatDisplayDate(lead.preferred_tour_date) : 'Date unavailable'}${lead.preferred_tour_time ? ` • ${lead.preferred_tour_time}` : ''}`
                                : tourDisplayStatus(lead) === 'Requested' ? 'Choose an available time' : 'Schedule a venue tour'}
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              {tourDisplayStatus(lead) === 'Confirmed'
                                ? 'This tour was booked by the client and automatically confirmed. Confirmation and reminders are scheduled.'
                                : tourDisplayStatus(lead) === 'Requested' ? 'Choose a time and send the client a confirmed calendar invitation.' : 'Choose an available time to confirm the tour and schedule reminders.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {tourDisplayStatus(lead) === 'Confirmed' ? (
                            <>
                              <button type="button" onClick={() => document.getElementById('lead-tour-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[color:var(--portal-border)] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40">View Tour Details</button>
                              <button type="button" onClick={() => openTourScheduleModal('reschedule')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a8792f] transition-all hover:bg-[#caa24c]/20 dark:text-[#f1d27a]"><Calendar size={13} /> Reschedule Tour</button>
                            </>
                          ) : (
                            <button type="button" onClick={() => openTourScheduleModal('new_visit')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a8792f] transition-all hover:bg-[#caa24c]/20 dark:text-[#f1d27a]"><Calendar size={13} /> {tourDisplayStatus(lead) === 'Requested' ? 'Set Tour Time' : 'Schedule Tour'}</button>
                          )}
                        </div>
                      </div>
                    </MagicCard>

                    {/* Row 1: Tour Details & Tour Attendance */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Tour Details */}
                      <section id="lead-tour-details" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Tour Details</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Tour Date</span>
                              <span className="font-bold text-[color:var(--portal-text)]">{lead.preferred_tour_date ? formatDisplayDate(lead.preferred_tour_date) : 'Not scheduled'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Tour Time</span>
                              <span className="font-bold text-[color:var(--portal-text)]">{lead.preferred_tour_time || '3:00 PM'}</span>
                            </div>
                            {emailResendCandidate ? (
                              <div className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/[0.07] p-3">
                                <p className="text-[10px] font-semibold text-[color:var(--portal-text)]">
                                  {emailResendCandidate.status === 'cancelled'
                                    ? 'Saved tour confirmation needs your review.'
                                    : emailResendCandidate.status === 'failed'
                                      ? 'Tour confirmation delivery failed.'
                                      : `Tour confirmation ${emailResendCandidate.status}.`}
                                </p>
                                <p className="mt-1 break-all text-[10px] leading-4 text-[color:var(--portal-muted)]">
                                  To {emailResendCandidate.recipient_email}
                                  {emailResendCandidate.last_error ? ` · ${emailResendCandidate.last_error}` : ''}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCorrectEmailResendOpen(true)
                                  }}
                                  className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#caa24c]/35 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a8792f] transition-colors hover:bg-[#caa24c]/10 dark:text-[#f1d27a] sm:w-auto"
                                >
                                  <Mail size={13} />
                                  {emailResendCandidate.status === 'failed'
                                    ? 'Review retry'
                                    : emailResendCandidate.status === 'cancelled'
                                      ? 'Review confirmation'
                                      : 'View delivery'}
                                </button>
                              </div>
                            ) : null}
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Assigned To</span>
                              <span className="font-bold text-[color:var(--portal-text)]">{Array.isArray(lead.metadata?.tour_assignees) && lead.metadata.tour_assignees.length ? lead.metadata.tour_assignees.join(', ') : String(lead.metadata?.tour_coordinator || 'Not assigned')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Location</span>
                              <span className="font-bold text-[color:var(--portal-text)]">Luxor at Las Palmas Events</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Status</span>
                              <span className="rounded bg-[#caa24c]/10 text-[#a8792f] border border-[#caa24c]/20 px-2 py-0.5 text-[9px] font-bold uppercase">{tourDisplayStatus(lead)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 border-t border-[color:var(--portal-border)] pt-4">
                          {tourDisplayStatus(lead) === 'Confirmed' ? (
                            <span className="mb-3 block rounded-lg border border-emerald-500/20 bg-emerald-500/10 py-1.5 text-center text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400">Tour Confirmed</span>
                          ) : null}
                          {!['Completed', 'Cancelled'].includes(tourDisplayStatus(lead)) ? (
                            <button type="button" onClick={() => handleTourAttendanceAction('attended')} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-md shadow-[#caa24c]/15 transition-colors hover:bg-[#dfbd68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">{lead.tour_attendance_status === 'no_show' ? 'Correct Outcome to Completed' : 'Mark Complete'}</button>
                          ) : null}
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <button type="button" onClick={() => openTourScheduleModal('reschedule')} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-3 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]">Reschedule</button>
                            {!['No show', 'Completed', 'Cancelled'].includes(tourDisplayStatus(lead)) ? <button type="button" onClick={() => handleTourAttendanceAction('no_show')} className="min-h-10 rounded-lg border border-red-500/25 px-3 text-[9px] font-black uppercase tracking-wider text-red-600 transition-colors hover:bg-red-500/8 dark:text-red-300">No Show</button> : null}
                            {hasCancellableTour(lead) ? <button type="button" onClick={() => setLeadLifecycleAction('cancel-tour')} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-3 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:border-red-500/30 hover:text-red-600 dark:hover:text-red-300">Cancel Tour</button> : null}
                            {lead.phone ? <button type="button" onClick={() => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id })} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-3 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]">Call</button> : null}
                          </div>
                        </div>
                      </section>
                      
                      {/* Tour Attendance & Notes */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        {isEditingTourAttendance ? (
                          <div className="space-y-4 text-left">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#caa24c] mb-3">Edit Tour & Prep Details</p>
                              
                              <div className="space-y-3.5">
                                <div>
                                  <label className="block text-[9px] uppercase font-bold text-[color:var(--portal-muted)] mb-1">Tour Team</label>
                                  <div className="flex flex-wrap gap-2">
                                    {['Arianna', 'Carlos', 'Alex'].map((name) => {
                                      const selected = tourAssignees.includes(name)
                                      return (
                                        <button key={name} type="button" onClick={() => setTourAssignees((current) => selected ? current.filter((item) => item !== name) : [...current, name])} className={`rounded border px-2.5 py-1.5 text-[9px] font-black uppercase ${selected ? 'border-[#caa24c]/50 bg-[#caa24c]/15 text-[#a8792f]' : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'}`}>
                                          {name}
                                        </button>
                                      )
                                    })}
                                    <input value={tourAssigneeCustom} onChange={(event) => setTourAssigneeCustom(event.target.value)} placeholder="Custom" className="min-w-24 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1.5 text-[10px] text-[color:var(--portal-text)] outline-none" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-[9px] uppercase font-bold text-[color:var(--portal-muted)] mb-1">Primary Attendee</label>
                                    <input
                                      type="text"
                                      disabled
                                      value={lead.full_name}
                                      className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-muted)] cursor-not-allowed outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase font-bold text-[color:var(--portal-muted)] mb-1">Guests / Additional Attendees</label>
                                    <input
                                      type="text"
                                      value={tourGuests}
                                      onChange={(e) => setTourGuests(e.target.value)}
                                      placeholder="e.g. Miguel Martinez"
                                      className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-[9px] uppercase font-bold text-[color:var(--portal-muted)] mb-1">Target Budget</label>
                                    <input
                                      type="text"
                                      value={tourBudget}
                                      onChange={(e) => setTourBudget(e.target.value)}
                                      placeholder="e.g. $5,000"
                                      className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase font-bold text-[color:var(--portal-muted)] mb-1">Catering & Bar Preferences</label>
                                    <input
                                      type="text"
                                      value={cateringPreferences}
                                      onChange={(e) => setCateringPreferences(e.target.value)}
                                      placeholder="Outside catering, open bar"
                                      className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[9px] uppercase font-bold text-[color:var(--portal-muted)] mb-1">Tour Notes / Feedback</label>
                                  <textarea
                                    value={tourNotes}
                                    onChange={(e) => setTourNotes(e.target.value)}
                                    rows={4}
                                    placeholder="Add any feedback or discussion notes from the tour..."
                                    className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none resize-none"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 justify-end pt-2 border-t border-[color:var(--portal-border)]">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingTourAttendance(false)
                                  setTourGuests(String(lead.metadata?.tourGuests || ''))
                                  setTourNotes(String(lead.metadata?.tourNotes || ''))
                                  setTourBudget(String(lead.metadata?.estimatedBudget || ''))
                                  setCateringPreferences(String(lead.metadata?.cateringPreferences || ''))
                                }}
                                className="px-3 py-1.5 rounded border border-[color:var(--portal-border)] text-[10px] font-black uppercase text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveTourAttendance}
                                disabled={savingTourAttendance}
                                className="px-4 py-1.5 rounded bg-[#caa24c] text-[10px] font-black uppercase text-white hover:bg-[#dfbd68] transition-all cursor-pointer"
                              >
                                {savingTourAttendance ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)] mb-2">Tour Attendance</p>
                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#caa24c]" />
                                      <span className="font-bold text-[color:var(--portal-text)]">{lead.full_name} <span className="text-[color:var(--portal-muted)] font-medium">(Primary)</span></span>
                                    </div>
                                    {tourGuests ? (
                                      <div className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--portal-border)]" />
                                        <span className="font-bold text-[color:var(--portal-text)]">{tourGuests} <span className="text-[color:var(--portal-muted)] font-medium">(Guest)</span></span>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Target Budget</p>
                                    <p className="text-xs font-semibold text-[color:var(--portal-text)] mt-0.5">{tourBudget || 'Not captured'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Catering / Bar</p>
                                    <p className="text-xs font-semibold text-[color:var(--portal-text)] mt-0.5 truncate">{cateringPreferences || 'Not captured'}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="border-t sm:border-t-0 sm:border-l border-[color:var(--portal-border)] pt-3 sm:pt-0 sm:pl-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)] mb-2">Tour Notes & Prep</p>
                                <p className="text-xs text-[color:var(--portal-muted)] italic leading-relaxed">
                                  &ldquo;{tourNotes || 'No tour notes captured yet.'}&rdquo;
                                </p>
                                <button
                                  type="button"
                                    onClick={openTourDetailsEditor}
                                  className="text-[10px] text-[#caa24c] mt-2.5 hover:underline cursor-pointer font-bold text-left block"
                                >
                                  Edit Prep Notes
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </section>
                    </div>
                    
                    {/* Files shared through email */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Shared files</p>
                          <p className="mt-1 text-[10px] text-[color:var(--portal-faint)]">Attachments shared with this client through email appear here.</p>
                        </div>
                        <Link href="/portal/emails" className="shrink-0 text-[9px] font-black uppercase tracking-[0.14em] text-[#a8792f] transition-colors hover:text-[#caa24c] dark:text-[#f1d27a]">View email history →</Link>
                      </div>
                      {sharedFiles.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {sharedFiles.map(({ email, attachment }) => {
                            const size = formatAttachmentSize(attachment.size)
                            return (
                            <a key={`${email.id}-${attachment.attachmentId || attachment.attachmentPath || attachment.filename}`} href={emailAttachmentUrl(email, attachment)} target="_blank" rel="noreferrer" aria-label={`Open ${attachment.filename}`} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 transition-colors hover:border-[#caa24c]/35 hover:bg-[#caa24c]/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--portal-card)] text-[#a8792f] dark:text-[#f1d27a]"><FileText size={16} /></span>
                              <span className="min-w-0"><span className="block truncate text-[10px] font-bold text-[color:var(--portal-text)]">{attachment.filename}</span><span className="mt-1 block truncate text-[9px] text-[color:var(--portal-muted)]">{size ? `${size} · ` : ''}{decodeHtmlEntities(email.subject) || 'Email attachment'}</span></span>
                            </a>
                            )
                          })}
                        </div>
                      ) : sharedAttachmentEmails.length ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {sharedAttachmentEmails.map((email) => (
                            <Link key={email.id} href={emailReaderUrl(email)} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 transition-colors hover:border-[#caa24c]/35 hover:bg-[#caa24c]/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--portal-card)] text-[#a8792f] dark:text-[#f1d27a]"><FileText size={16} /></span>
                              <span className="min-w-0"><span className="block truncate text-[10px] font-bold text-[color:var(--portal-text)]">{decodeHtmlEntities(email.subject) || 'Email attachment'}</span><span className="mt-1 block text-[9px] text-[color:var(--portal-muted)]">Open email to view files</span></span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 px-4 py-5 text-center"><FileText size={18} className="mx-auto text-[color:var(--portal-faint)]" /><p className="mt-2 text-xs font-semibold text-[color:var(--portal-text)]">No shared files yet</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Files from email and text conversations will be collected here as they are available.</p></div>
                      )}
                    </section>

                    {/* Row 2: Chat Replay & Emails */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                      {/* Concierge AI session replay */}
                      {chatMessages.length > 0 ? (
                        <div className="nodal-void-card overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xl luxor-soft-enter">
                          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-3">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[color:var(--portal-muted)]">Concierge AI Chat Session Replay</h4>
                            <span className="rounded border border-[#caa24c]/20 bg-[#caa24c]/10 px-2 py-0.5 text-[9px] font-bold uppercase text-[#a8792f]">Elena AI</span>
                          </div>
                          <div className="space-y-4 bg-[color:var(--portal-card)] p-4 max-h-[280px] overflow-y-auto portal-scrollbar">
                            {chatMessages.map((msg, index) => {
                              const isUser = msg.role === 'user'
                              return (
                                <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs font-medium leading-relaxed shadow-sm ${
                                    isUser
                                      ? 'border border-[#caa24c]/25 bg-[#caa24c]/10 text-[color:var(--portal-text)]'
                                      : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'
                                  }`}>
                                    <div className={`mb-1 text-[8px] font-bold uppercase tracking-widest ${isUser ? 'text-[#a8792f]' : 'text-[color:var(--portal-muted)]'}`}>
                                      {isUser ? 'Client' : 'Elena AI'}
                                    </div>
                                    {msg.content}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-xl text-center text-zinc-500 space-y-2 flex flex-col justify-center items-center min-h-[200px]">
                          <MessageSquare size={20} className="text-zinc-700" />
                          <p className="text-xs uppercase font-bold tracking-wider text-zinc-400">No Concierge Chat</p>
                          <p className="text-[10px] max-w-xs mx-auto leading-relaxed">This lead was not created via the conversational AI concierge widget.</p>
                        </div>
                      )}

                      {/* Zoho Emails */}
                      <div className="nodal-void-card overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xl luxor-soft-enter">
                        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[color:var(--portal-muted)]">Email History</h4>
                          <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-blue-700 dark:text-blue-300">Inbound / Outbound</span>
                        </div>
                        <div className="space-y-4 bg-[color:var(--portal-card)] p-4 max-h-[280px] overflow-y-auto portal-scrollbar text-left">
                          {emailMessages.length === 0 ? (
                            <p className="py-8 text-center text-xs italic text-[color:var(--portal-muted)]">No emails logged for this address.</p>
                          ) : (
                            emailMessages.map((email) => {
                              const isOutgoing = email.direction === 'outgoing'
                              const preview = cleanEmailPreview(email.summary)
                              return (
                                <Link href={emailReaderUrl(email)} key={email.id} className="block space-y-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 transition-all hover:border-[#caa24c]/35 hover:bg-[#caa24c]/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
                                  <div className="flex justify-between items-start gap-2">
                                    <span className={`rounded border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-widest ${
                                      isOutgoing
                                        ? 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                    }`}>
                                      {isOutgoing ? 'Outbound' : 'Inbound'}
                                    </span>
                                    <span className="text-[9px] font-mono text-[color:var(--portal-muted)]">
                                      {formatTimelineDate(email.receivedAt || '')}
                                    </span>
                                  </div>
                                  <p className="text-xs font-bold text-[color:var(--portal-text)]">{decodeHtmlEntities(email.subject) || '(No Subject)'}</p>
                                  <p className="truncate text-[9px] text-[color:var(--portal-muted)]">
                                    {isOutgoing ? `To: ${lead.full_name}` : `From: ${lead.full_name}`}
                                  </p>
                                  {preview && (
                                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[color:var(--portal-muted)]">{preview}</p>
                                  )}
                                  <span className="inline-flex text-[9px] font-black uppercase tracking-wider text-[#caa24c]">Open full email →</span>
                                </Link>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )
              }
              
              if (currentStage === 'planning') {
                return (
                  <>
                    {/* Next Move */}
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.14)"
                      gradientFrom="#caa24c"
                      gradientTo="#8c6529"
                      gradientOpacity={0.22}
                    >
                      <BorderBeam size={75} duration={11} colorFrom="#caa24c" colorTo="#dfbd68" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <Sliders size={18} />
                          </span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              {planningSubTab === 'fb' || planningSubTab === 'decor' ? 'Customize food & beverage package & decor layout' : 'Review event logistics & planning checklist'}
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              {planningSubTab === 'fb' || planningSubTab === 'decor' ? 'Select menu preferences, bar packages, floor plans, and decor options.' : 'Confirm vendor arrivals, layout specs, and guest counts.'}
                            </p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setActiveLeadTab('tasks')} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all cursor-pointer">
                          Planning Checklist
                        </button>
                      </div>
                    </MagicCard>

                    {/* Sub-tabs for Planning */}
                    <div className="flex gap-4 border-b border-[color:var(--portal-border)] text-xs overflow-x-auto pb-1 portal-scrollbar">
                      {(['details', 'vendors', 'fb', 'decor', 'timeline', 'files'] as const).map((tab) => {
                        const labels = {
                          details: 'Event Details',
                          vendors: 'Vendors',
                          fb: 'Food & Beverage',
                          decor: 'Décor & Design',
                          timeline: 'Timeline',
                          files: 'Notes & Files',
                        }
                        const isCurrent = planningSubTab === tab
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setPlanningSubTab(tab)}
                            className={`py-2 px-1 font-bold uppercase tracking-wider border-b-2 transition-colors shrink-0 cursor-pointer ${
                              isCurrent ? 'border-[#caa24c] text-[#a8792f] dark:text-[#f1d27a]' : 'border-transparent text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                            }`}
                          >
                            {labels[tab]}
                          </button>
                        )
                      })}
                    </div>

                    {/* Planning sub-tab contents */}
                    {planningSubTab === 'details' && (
                      <div className="space-y-6 luxor-soft-enter">
                        {planningEditSection && (
                          <section className="rounded-2xl border border-[#caa24c]/30 bg-[#caa24c]/[0.04] p-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] pb-4">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#caa24c]">Editing planning details</p>
                                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Changes save to this lead when you choose Save changes.</p>
                              </div>
                              <button type="button" onClick={() => setPlanningEditSection(null)} className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">Cancel</button>
                            </div>

                            {planningEditSection === 'event' && (
                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <label className="sm:col-span-2"><span className="planning-editor-label">Theme / style</span><input value={planningDraft.event_style || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, event_style: event.target.value }))} placeholder="e.g. modern desert, black tie, garden romance" className="planning-editor-input" /></label>
                                <div className="sm:col-span-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs text-[color:var(--portal-muted)]">Event date, time, type, and guest count stay connected to the lead and booking records. Edit those from the Client Summary above so there is one source of truth.</div>
                              </div>
                            )}

                            {planningEditSection === 'preferences' && (
                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <div className="sm:col-span-2"><span className="planning-editor-label">Color palette</span><div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{PLANNING_COLOR_OPTIONS.map((palette) => { const selected = planningColors.join(',') === palette.colors.join(','); return <button key={palette.id} type="button" onClick={() => setPlanningColors([...palette.colors])} className={`rounded-xl border p-3 text-left transition-colors ${selected ? 'border-[#caa24c] bg-[#caa24c]/10' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/45'}`} aria-pressed={selected}><span className="flex gap-1.5">{palette.colors.map((color) => <span key={color} className="h-7 flex-1 rounded-md border border-black/10" style={{ backgroundColor: color }} />)}</span><span className={`mt-2 block text-[10px] font-bold ${selected ? 'text-[#caa24c]' : 'text-[color:var(--portal-text)]'}`}>{palette.label}</span></button> })}</div></div>
                                <label><span className="planning-editor-label">Music style</span><input value={planningDraft.music_style || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, music_style: event.target.value }))} placeholder="DJ, live band, playlist…" className="planning-editor-input" /></label>
                                <label><span className="planning-editor-label">Lighting</span><input value={planningDraft.lighting_preference || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, lighting_preference: event.target.value }))} placeholder="Warm uplighting, candlelight…" className="planning-editor-input" /></label>
                                <label className="sm:col-span-2"><span className="planning-editor-label">Special requests</span><textarea value={planningDraft.special_requests || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, special_requests: event.target.value }))} rows={3} placeholder="Anything the planning team needs to remember" className="planning-editor-input resize-y" /></label>
                              </div>
                            )}

                            {planningEditSection === 'layout' && (
                              <div className="mt-4 space-y-4">
                                <div><span className="planning-editor-label">Choose a starting layout</span><div className="mt-2 grid gap-3 sm:grid-cols-2">{PLANNING_LAYOUT_OPTIONS.map((layout) => { const selected = planningDraft.floor_plan_layout === layout.id; return <button key={layout.id} type="button" onClick={() => setPlanningDraft((current) => ({ ...current, floor_plan_layout: layout.id }))} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? 'border-[#caa24c] bg-[#caa24c]/10' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/45'}`} aria-pressed={selected}><span className={`layout-builder-preview ${layout.kind}`}><i /><i /><i /></span><span><span className="block text-[11px] font-bold text-[color:var(--portal-text)]">{layout.label}</span><span className="mt-1 block text-[10px] leading-4 text-[color:var(--portal-muted)]">{layout.detail}</span></span></button> })}</div></div>
                                <div className="grid gap-4 sm:grid-cols-2"><label><span className="planning-editor-label">Head table</span><input value={planningDraft.head_table || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, head_table: event.target.value }))} placeholder="Centered, sweetheart, none…" className="planning-editor-input" /></label><label><span className="planning-editor-label">Dance floor</span><input value={planningDraft.dance_floor || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, dance_floor: event.target.value }))} placeholder="Center, west wall, size…" className="planning-editor-input" /></label><label><span className="planning-editor-label">Stage / DJ area</span><input value={planningDraft.stage_needed || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, stage_needed: event.target.value }))} placeholder="Stage, DJ booth, none…" className="planning-editor-input" /></label><label><span className="planning-editor-label">Other areas</span><input value={planningDraft.other_areas || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, other_areas: event.target.value }))} placeholder="Photo booth, bar, gift table…" className="planning-editor-input" /></label></div>
                              </div>
                            )}

                            {planningEditSection === 'decor' && (
                              <div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="planning-editor-label">Décor style</span><input value={planningDraft.decor_style || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, decor_style: event.target.value }))} placeholder="Romantic, modern, minimal…" className="planning-editor-input" /></label><label><span className="planning-editor-label">Centerpieces</span><input value={planningDraft.centerpieces || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, centerpieces: event.target.value }))} placeholder="Florals, candles, greenery…" className="planning-editor-input" /></label><label className="sm:col-span-2"><span className="planning-editor-label">Linens</span><input value={planningDraft.linens || ''} onChange={(event) => setPlanningDraft((current) => ({ ...current, linens: event.target.value }))} placeholder="Ivory napkins, black runners…" className="planning-editor-input" /></label></div>
                            )}

                            <div className="mt-5 flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4"><button type="button" onClick={() => setPlanningEditSection(null)} className="rounded-lg border border-[color:var(--portal-border)] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">Cancel</button><button type="button" onClick={() => void savePlanningSection()} disabled={savingPlanningSection} className="rounded-lg bg-[#caa24c] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#dfbd68] disabled:opacity-50">{savingPlanningSection ? 'Saving…' : 'Save changes'}</button></div>
                          </section>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Event Information */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Event Information</p>
                              <button type="button" onClick={() => beginPlanningEdit('event')} className="text-[10px] font-bold uppercase text-[#a8792f] dark:text-[#caa24c] hover:text-[#dfbd68]">Edit</button>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Event Date</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{latestBooking?.event_date ? formatDisplayDate(latestBooking.event_date) : activeEventForDisplay?.target_date ? formatDisplayDate(activeEventForDisplay.target_date) : 'Date not set'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Event Time</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{summaryStartTime && summaryEndTime ? `${formatTimeString(summaryStartTime)} – ${formatTimeString(summaryEndTime)}` : 'Time not set'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Duration</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{formatEventDuration(summaryStartTime, summaryEndTime)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Event Type</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{activeEventForDisplay?.event_type || lead.event_type || 'Event type not captured'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Location</span>
                                <span className="font-bold text-[color:var(--portal-text)]">Luxor at Las Palmas Events</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Guest Count</span>
                                <span className="font-bold tabular-nums text-[color:var(--portal-text)]">{(activeEventForDisplay?.guest_count ?? lead.guest_count) ? `${activeEventForDisplay?.guest_count ?? lead.guest_count} Expected Guests` : 'Guest count not captured'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Theme / Style</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.event_style || 'Not captured')}</span>
                              </div>
                            </div>
                          </section>

                          {/* Client Preferences */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Client Preferences</p>
                              <button type="button" onClick={() => beginPlanningEdit('preferences')} className="text-[10px] font-bold uppercase text-[#a8792f] dark:text-[#caa24c] hover:text-[#dfbd68]">Edit</button>
                            </div>
                            <div className="space-y-3 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Color Palette</span>
                                <div className="flex gap-1.5">
                                  {(Array.isArray(activeEventMetadata.color_palette) && activeEventMetadata.color_palette.length > 0 ? activeEventMetadata.color_palette.map(String) : PLANNING_COLOR_OPTIONS[0].colors).map((color) => (
                                    <span key={color} title={color} className="h-4.5 w-4.5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                                  ))}
                                </div>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Music Style</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.music_style || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Lighting</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.lighting_preference || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Special Requests</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.special_requests || activeEventForDisplay?.notes || lead.message || 'None captured')}</span>
                              </div>
                            </div>
                          </section>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Space & Layout */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Space & Layout</p>
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={() => beginPlanningEdit('layout')} className="text-[10px] font-bold uppercase text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">Edit details</button>
                                <button type="button" onClick={() => setLayoutDesignerOpen(true)} className="rounded-lg bg-[#caa24c] px-3 py-2 text-[9px] font-black uppercase tracking-wider !text-white hover:bg-[#dfbd68]">Open layout builder</button>
                              </div>
                            </div>
                            <div className="grid grid-cols-5 gap-4">
                              <div className="col-span-2 border border-[color:var(--portal-border)] rounded-xl bg-[color:var(--portal-soft)] p-2 flex items-center justify-center flex-col text-[color:var(--portal-muted)]">
                                <span className="text-[8px] font-bold uppercase text-center">{PLANNING_LAYOUT_OPTIONS.find((option) => option.id === activeEventMetadata.floor_plan_layout)?.label || 'Layout not selected'}</span>
                              </div>
                              <div className="col-span-3 space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Head Table</span>
                                  <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.head_table || 'Not captured')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Dance Floor</span>
                                  <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.dance_floor || 'Not captured')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Stage</span>
                                  <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.stage_needed || 'Not captured')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Other Areas</span>
                                  <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.other_areas || 'Not captured')}</span>
                                </div>
                              </div>
                            </div>
                          </section>

                          {/* Decor Overview */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Decor Overview</p>
                              <button type="button" onClick={() => beginPlanningEdit('decor')} className="text-[10px] font-bold uppercase text-[#a8792f] dark:text-[#caa24c] hover:text-[#dfbd68]">Edit</button>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Selected Package</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{activeEventForDisplay?.package_interest || latestBooking?.package_name || lead.package_interest || 'Not selected'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Décor Style</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.decor_style || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Centerpieces</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.centerpieces || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Linens</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.linens || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] mt-0.5">Additional Notes</span>
                                <span className="font-bold text-[color:var(--portal-text)] text-right max-w-[60%]">{tourNotes || 'No planning notes captured yet.'}</span>
                              </div>
                            </div>
                          </section>
                        </div>

                        <LayoutReviewPanel
                          inquiryId={lead.id}
                          leadEventId={selectedLeadEvent?.id || null}
                          layout={(activeEventMetadata.event_layout as EventLayoutDocument | undefined) || null}
                          clientEmail={lead.email}
                          onOpenLayoutBuilder={() => setLayoutDesignerOpen(true)}
                          refreshKey={layoutReviewRefreshKey}
                        />

                        {/* Planning Checklist Summary */}
                        <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                          <div className="mb-4 flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-3">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Planning Checklist Progress</p>
                              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">1 of 5 core planning categories confirmed</p>
                            </div>
                            <AnimatedCircularProgressBar
                              value={20}
                              max={100}
                              min={0}
                              size={52}
                              strokeWidth={5}
                              gaugePrimaryColor="#caa24c"
                              gaugeSecondaryColor="rgba(202, 162, 76, 0.14)"
                              className="shrink-0"
                            />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {[
                              { label: 'Event Details', val: 'Completed', color: 'text-emerald-700 dark:text-emerald-400' },
                              { label: 'Vendors', val: '0/5 Completed', color: 'text-[color:var(--portal-muted)]' },
                              { label: 'Food & Beverage', val: '0/4 Completed', color: 'text-[color:var(--portal-muted)]' },
                              { label: 'Décor & Design', val: '0/4 Completed', color: 'text-[color:var(--portal-muted)]' },
                              { label: 'Timeline', val: '0/3 Completed', color: 'text-[color:var(--portal-muted)]' },
                            ].map((item, idx) => (
                              <div key={idx} className="space-y-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-center">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">{item.label}</p>
                                <p className={`text-xs font-black uppercase tabular-nums ${item.color}`}>{item.val}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    )}

                    {planningSubTab !== 'details' && (
                      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 text-center text-zinc-500 space-y-4 luxor-soft-enter">
                        <Sparkles size={24} className="mx-auto text-[#caa24c]" />
                        <p className="text-xs uppercase font-bold tracking-widest text-[color:var(--portal-text)]">
                          {planningSubTab === 'fb' ? 'Food & Beverage Planning' : planningSubTab === 'decor' ? 'Décor & Design Planning' : planningSubTab === 'vendors' ? 'Vendor Planning' : planningSubTab === 'timeline' ? 'Event Timeline' : 'Event Files'}
                        </p>
                        <p className="mx-auto max-w-md text-xs leading-relaxed">
                          {planningSubTab === 'fb' || planningSubTab === 'decor'
                            ? 'Track each decision as a task so it has an owner, due date, priority, and completion history.'
                            : 'Open the dedicated workspace for this part of the event plan.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (planningSubTab === 'vendors') setActiveLeadTab('vendors')
                            else if (planningSubTab === 'timeline') setActiveLeadTab('timeline')
                            else if (planningSubTab === 'files') setActiveLeadTab('documents')
                            else {
                              setTaskTitle(planningSubTab === 'fb' ? 'Food & beverage decision' : 'Décor & design decision')
                              setTaskPriority('medium')
                              setShowTaskTools(true)
                              setActiveLeadTab('tasks')
                            }
                          }}
                          className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#a8792f] dark:text-[#f1d27a] hover:bg-[#caa24c]/15"
                        >
                          {planningSubTab === 'fb' || planningSubTab === 'decor' ? 'Create planning task' : 'Open workspace'}
                        </button>
                      </div>
                    )}
                  </>
                )
              }
              
              if (currentStage === 'proposal') {
                return (
                  <>
                    {/* Next Move */}
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.14)"
                      gradientFrom="#caa24c"
                      gradientTo="#8c6529"
                      gradientOpacity={0.22}
                    >
                      <BorderBeam size={75} duration={11} colorFrom="#caa24c" colorTo="#dfbd68" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs"><Send size={18} /></span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              {!proposalInvoice ? 'Build final proposal' : !proposalSentAt && proposalPublicationBlocker ? 'Set payment plan' : proposalDeliveryPrepared ? 'Retry final proposal delivery' : !proposalSentAt ? 'Send final proposal' : !proposalAcceptedAt ? proposalReviewTogetherReady ? 'Ready to review together' : 'Await final proposal acceptance' : !agreementBooking ? 'Agreement delivery pending' : agreementBooking.contract_status !== 'signed' ? agreementDeliveryConfirmed ? 'Await agreement signature' : 'Agreement delivery pending' : depositPaidTotal <= 0 ? 'Stripe link sent after signature' : 'Date officially reserved'}
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              {!proposalInvoice ? 'Choose the event facts and package to calculate the exact price.' : !proposalSentAt && proposalPublicationBlocker ? 'The package price is already calculated. Set the owner-approved payment plan before publishing.' : proposalDeliveryPrepared ? 'The private proposal is safely prepared, but email delivery was not confirmed. Review it, correct the lead details if needed, then retry the same locked version.' : !proposalSentAt ? 'Publish the final proposal with its locked itemized price.' : !proposalAcceptedAt ? proposalReviewTogetherReady ? 'Open the client handoff to review the selected package, accept it, sign, and choose payment on the spot.' : 'The client accepts through the private proposal page.' : !agreementBooking ? 'The proposal is accepted, but the matching agreement record has not been confirmed yet. Prepare the agreement before asking the client to sign.' : agreementBooking.contract_status !== 'signed' ? agreementDeliveryConfirmed ? 'The Event Agreement was delivered after proposal acceptance. Stripe is not available until it is signed.' : 'The agreement is not confirmed as delivered yet. Do not treat it as sent until delivery is confirmed.' : depositPaidTotal <= 0 ? 'The signed agreement triggered the Stripe email for the initial booking payment and refundable security deposit.' : 'The signed agreement and initial booking payment are both recorded.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-nowrap items-center justify-end gap-2">
                          {proposalInvoice && proposalSentAt && !proposalAcceptedAt ? (
                            <>
                              <button type="button" onClick={() => openClientProposalHandoff(proposalInvoice)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition-colors hover:bg-[#dfbd68]">
                                <Users size={14} /> Review together
                              </button>
                              <button type="button" onClick={() => openProposalBuilder(proposalInvoice)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[#caa24c]/40 bg-[#caa24c]/10 px-4 text-[10px] font-black uppercase tracking-wider text-[#8c6529] transition-all hover:bg-[#caa24c]/15 dark:text-[#f1d27a]">
                                <Pencil size={13} /> Edit proposal
                              </button>
                            </>
                          ) : <>
                            {proposalInvoice ? (
                              <button type="button" onClick={() => openProposalDeliveryPreview(proposalInvoice)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-all hover:border-[#caa24c]/40 hover:text-[#8c6529] dark:hover:text-[#f1d27a] cursor-pointer"><Eye size={14} /> Preview delivery</button>
                            ) : null}
                            {proposalInvoice ? (
                              <button type="button" onClick={() => openProposalBuilder(proposalInvoice)} className="min-h-11 rounded-xl border border-[#caa24c]/40 bg-[#caa24c]/10 px-5 text-[10px] font-black uppercase tracking-wider text-[#8c6529] dark:text-[#f1d27a] transition-all hover:bg-[#caa24c]/15 cursor-pointer">Edit Proposal</button>
                            ) : null}
                            {!proposalInvoice ? (
                              <button type="button" onClick={() => openProposalBuilder()} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all cursor-pointer">Build Proposal</button>
                            ) : !proposalSentAt && proposalPublicationBlocker ? (
                              <button type="button" onClick={() => openProposalBuilder(proposalInvoice)} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all cursor-pointer">Set payment plan</button>
                            ) : !proposalSentAt ? (
                              <button type="button" onClick={() => handleSendFinalProposal(proposalInvoice)} disabled={!lead.email || sendingInvoiceId === proposalInvoice.id} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all disabled:opacity-40 cursor-pointer">{sendingInvoiceId === proposalInvoice.id ? 'Sending…' : proposalDeliveryPrepared ? 'Retry delivery' : 'Send final proposal'}</button>
                            ) : !agreementBooking ? (
                              <button type="button" onClick={() => handlePrepareAgreement(proposalInvoice)} disabled={preparingAgreementInvoiceId === proposalInvoice.id} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition-colors hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:opacity-45">
                                {preparingAgreementInvoiceId === proposalInvoice.id ? <Loader2 size={13} className="animate-spin" /> : <FileSignature size={13} />}
                                {preparingAgreementInvoiceId === proposalInvoice.id ? 'Preparing…' : 'Prepare Agreement'}
                              </button>
                            ) : agreementBooking.contract_status !== 'signed' ? (
                              <span className="min-h-11 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">{agreementDeliveryConfirmed ? 'Agreement awaiting signature' : agreementDeliveryPending ? 'Agreement delivery pending' : 'Agreement not confirmed'}</span>
                            ) : (
                              <button type="button" onClick={() => depositInvoice && openPaymentRequest(depositInvoice)} disabled={!depositInvoice || depositBalance <= 0} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all disabled:opacity-40 cursor-pointer">Resend Payment Link</button>
                            )}
                          </>}
                        </div>
                      </div>
                      {agreementBooking ? <div className="mt-4 grid gap-3 border-t border-[color:var(--portal-border)] pt-4 md:grid-cols-2"><div><p className="mb-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Suggested payment method</p><PortalSelect value={String((agreementBooking.metadata?.client_payment_preference as { method?: string } | undefined)?.method || 'card')} onChange={(value) => void saveBookingPaymentPreference(agreementBooking, { method: value as 'card' | 'zelle' | 'cash' | 'check' })} options={[{ value: 'card', label: 'Card via Stripe' }, { value: 'zelle', label: 'Zelle' }, { value: 'cash', label: 'Cash' }, { value: 'check', label: 'Check' }]} className="w-full" /><p className="mt-1.5 text-[10px] leading-4 text-[color:var(--portal-muted)]">The client starts with this after signing and can change it.</p></div><div><p className="mb-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Suggested payment amount</p><PortalSelect value={String((agreementBooking.metadata?.client_payment_preference as { amount?: string } | undefined)?.amount || 'deposit')} onChange={(value) => void saveBookingPaymentPreference(agreementBooking, { amount: value as 'deposit' | 'full' })} options={[{ value: 'deposit', label: 'Reservation deposit to hold date' }, { value: 'full', label: 'Full event balance' }]} className="w-full" /><p className="mt-1.5 text-[10px] leading-4 text-[color:var(--portal-muted)]">Use this to guide the handoff, not to mark payment received.</p></div></div> : null}
                    </MagicCard>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {/* Card 1: Sent & Delivery */}
                      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Delivery Status</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            proposalSentAt ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : proposalDeliveryPrepared ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            <Send size={10} />
                            {proposalSentAt ? proposalReviewTogetherReady ? 'In person' : 'Sent' : proposalDeliveryPrepared ? 'Delivery pending' : 'Draft'}
                          </span>
                        </div>
                        <div className="mt-3">
                          <p className="text-sm font-bold text-[color:var(--portal-text)]">{proposalSentAt ? formatDisplayDate(proposalSentAt) : proposalDeliveryPrepared ? 'Retry required' : 'Not Sent Yet'}</p>
                          <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">{proposalSentAt ? proposalReviewTogetherReady ? 'Ready for review on this device' : 'Client delivery completed' : proposalDeliveryPrepared ? 'Private link is saved; email delivery was not confirmed' : 'Send proposal to advance lead'}</p>
                        </div>
                      </div>

                      {/* Card 2: Client Engagement / Opened */}
                      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Client Views</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            proposalViewedAt ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] border border-[color:var(--portal-border)]'
                          }`}>
                            <Eye size={10} />
                            {proposalViewedAt ? 'Opened' : 'Unread'}
                          </span>
                        </div>
                        <div className="mt-3">
                          <p className="text-sm font-bold text-[color:var(--portal-text)]">{proposalViewedAt ? formatDisplayDate(proposalViewedAt) : 'Not Opened Yet'}</p>
                          <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">{proposalViewedAt ? 'Secure view recorded' : proposalSentAt ? 'Awaiting client view' : 'Available after send'}</p>
                        </div>
                      </div>

                      {/* Card 3: Financial Summary / Total & Balance */}
                      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 shadow-sm flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Final Event Price</span>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              proposalBalance <= 0 && proposalAmount > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : proposalPaidTotal > 0 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a] border border-[#caa24c]/20'
                            }`}>
                              <DollarSign size={10} />
                              {proposalBalance <= 0 && proposalAmount > 0 ? 'Paid' : proposalPaidTotal > 0 ? 'Partial' : 'Unpaid'}
                            </span>
                          </div>
                          <div className="mt-2.5">
                            <p className="text-lg font-serif font-bold tabular-nums text-[color:var(--portal-text)]">{proposalAmount > 0 ? formatMoney(proposalAmount) : '$0.00'}</p>
                            <p className="mt-0.5 text-[10px] tabular-nums text-[color:var(--portal-muted)]">
                              {proposalInvoice ? (proposalPaidTotal > 0 ? `${formatMoney(proposalPaidTotal)} paid · ${formatMoney(proposalBalance)} left` : `${formatMoney(proposalBalance)} balance remaining`) : 'No saved proposal'}
                            </p>
                          </div>
                        </div>
                        <AnimatedCircularProgressBar
                          value={proposalAmount > 0 ? Math.min(100, Math.round((proposalPaidTotal / proposalAmount) * 100)) : 0}
                          max={100}
                          min={0}
                          size={48}
                          strokeWidth={4.5}
                          gaugePrimaryColor={proposalBalance <= 0 && proposalAmount > 0 ? '#10b981' : '#caa24c'}
                          gaugeSecondaryColor="rgba(202, 162, 76, 0.14)"
                          className="shrink-0"
                        />
                      </div>

                      {/* Card 4: Automations / Reminders */}
                      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Reminders</span>
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] border border-[color:var(--portal-border)]">
                            <Clock size={10} />
                            {queuedProposalReminders.length ? `${queuedProposalReminders.length} Active` : 'Idle'}
                          </span>
                        </div>
                        <div className="mt-3">
                          <p className="text-sm font-bold text-[color:var(--portal-text)]">
                            {queuedProposalReminders.length ? `${queuedProposalReminders.length} Pending` : 'No Reminder Pending'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">
                            {queuedProposalReminders[0] ? `Next ${formatRelativeTime(queuedProposalReminders[0].scheduled_for)}` : 'Reminders pause on payment'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm luxor-soft-enter">
                      <div className="flex flex-col gap-3 border-b border-[color:var(--portal-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Final proposal line items</p>
                          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">The exact services and numbers stored on the latest sent proposal.</p>
                        </div>
                        {proposalInvoice ? (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => openProposalBuilder(proposalInvoice)} className="rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#8c6529] dark:text-[#f1d27a] hover:bg-[#caa24c]/15 transition-all cursor-pointer">Edit Proposal</button>
                            <button type="button" onClick={() => openProposalDeliveryPreview(proposalInvoice)} className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-all hover:border-[#caa24c]/30 hover:text-[#8c6529] dark:hover:text-[#f1d27a] cursor-pointer"><Eye size={12} /> Preview delivery</button>
                          </div>
                        ) : null}
                      </div>
                      {proposalInvoice?.line_items?.length ? (
                        <>
                          <div className="divide-y divide-[color:var(--portal-border)]">
                            {proposalInvoice.line_items.map((item, index) => (
                              <div key={`${item.description}-${index}`} className="grid gap-2 px-5 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_70px_110px_110px] sm:items-center">
                                <div className="min-w-0"><p className="font-bold text-[color:var(--portal-text)]">{item.description}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-[color:var(--portal-muted)]">{item.category || 'Custom service'}</p></div>
                                <div><span className="text-[9px] uppercase text-[color:var(--portal-muted)] sm:hidden">Qty </span><span className="tabular-nums font-semibold text-[color:var(--portal-muted)]">{item.quantity}</span></div>
                                <div className="tabular-nums font-medium text-[color:var(--portal-muted)] sm:text-right">{item.included ? <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Included</span> : formatMoney(item.unitPrice)}</div>
                                <div className="tabular-nums font-bold text-[color:var(--portal-text)] sm:text-right">{item.included ? '—' : formatMoney(item.total)}</div>
                              </div>
                            ))}
                          </div>
                          <div className="grid gap-2 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 text-xs sm:ml-auto sm:w-80">
                            <div className="flex justify-between text-[color:var(--portal-muted)]"><span>Subtotal</span><span className="tabular-nums font-semibold text-[color:var(--portal-text)]">{formatMoney(proposalInvoice.subtotal)}</span></div>
                            <div className="flex justify-between text-[color:var(--portal-muted)]"><span>Tax ({(Number(proposalInvoice.tax_rate) * 100).toFixed(2)}%)</span><span className="tabular-nums font-semibold text-[color:var(--portal-text)]">{formatMoney(Number(proposalInvoice.total) - Number(proposalInvoice.subtotal))}</span></div>
                            <div className="flex justify-between border-t border-[color:var(--portal-border)] pt-2 text-sm font-black text-[color:var(--portal-text)]"><span>Total</span><span className="font-serif tabular-nums text-base text-[#a8792f] dark:text-[#f1d27a]">{formatMoney(proposalInvoice.total)}</span></div>
                            <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold"><span>Paid</span><span className="tabular-nums">{formatMoney(proposalPaidTotal)}</span></div>
                            <div className="flex justify-between font-bold text-[color:var(--portal-text)]"><span>Balance</span><span className="tabular-nums">{formatMoney(proposalBalance)}</span></div>
                          </div>
                        </>
                      ) : (
                        <div className="p-8 text-center"><p className="text-xs font-bold text-[color:var(--portal-muted)]">No proposal line items yet.</p><button type="button" onClick={() => proposalInvoice ? openProposalBuilder(proposalInvoice) : openProposalBuilder()} className="mt-4 rounded-lg bg-[#caa24c] px-4 py-2 text-[9px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all cursor-pointer">{proposalInvoice ? 'Edit Proposal' : 'Build Proposal'}</button></div>
                      )}
                    </section>
                  </>
                )
              }

              if (currentStage === 'contract') {
                const contractBooking = agreementBooking
                const isSendingCurrentBooking = Boolean(contractBooking && sendingContractBookingId === contractBooking.id)
                const agreementSentAt = agreementDeliveryConfirmed
                  ? agreementDeliveryJob?.sent_at || contractBooking?.contract_sent_at || null
                  : null
                return (
                  <>
                    {/* Next Move */}
                    <motion.section 
                      layout
                      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                      className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <FileText size={18} />
                          </span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <AnimatePresence mode="wait">
                              <motion.div
                                key={`${proposalInvoice?.id || 'no_proposal'}-${contractBooking?.contract_status || agreementDeliveryJob?.status || 'no_booking'}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.25 }}
                              >
                                <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                                  {!proposalInvoice
                                    ? 'Build the final proposal first'
                                    : !proposalAcceptedAt
                                      ? 'Await final proposal acceptance'
                                      : !contractBooking
                                        ? 'Agreement delivery pending'
                                        : contractBooking.contract_status === 'signed'
                                          ? 'Contract signed & executed'
                                          : contractBooking.contract_status === 'viewed'
                                            ? 'Contract viewed by client'
                                            : agreementDeliveryConfirmed
                                              ? 'Awaiting client signature'
                                              : agreementDeliveryPending
                                                ? 'Agreement is being delivered'
                                                : agreementDeliveryFailed
                                                  ? 'Agreement delivery needs attention'
                                                  : 'Agreement delivery pending'}
                                </h4>
                                <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                                  {!proposalInvoice
                                    ? 'Create the exact package first. The client must accept that locked proposal before an agreement can be delivered.'
                                    : !proposalAcceptedAt
                                      ? 'The client must accept the locked proposal before Luxor creates the matching agreement.'
                                      : !contractBooking
                                        ? 'The proposal is accepted, but the matching agreement record is still being recovered. No agreement email has been confirmed yet.'
                                        : contractBooking.contract_status === 'signed'
                                          ? 'Legal agreement is complete. Proceed to the signed-agreement payment step or planning.'
                                          : agreementDeliveryConfirmed
                                            ? 'The Event Agreement was delivered. Track the client signature here.'
                                            : agreementDeliveryPending
                                              ? 'Delivery is still processing. Do not send a duplicate agreement.'
                                              : agreementDeliveryFailed
                                                ? 'The agreement email was not confirmed. Use the resend control after reviewing the delivery issue.'
                                                : 'No agreement email has been confirmed yet.'}
                                </p>
                              </motion.div>
                            </AnimatePresence>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {contractBooking ? (
                            <motion.button
                              layout
                              type="button"
                              disabled={updatingStatus || contractBooking.contract_status === 'signed' || !agreementDeliveryConfirmed}
                              onClick={() => agreementDeliveryConfirmed ? void openContractReview(contractBooking) : undefined}
                              whileTap={{ scale: 0.96 }}
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                              className={`relative overflow-hidden min-h-11 rounded-xl px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition-colors cursor-pointer disabled:opacity-50 ${isSendingCurrentBooking ? 'bg-gradient-to-r from-[#b58b38] via-[#dfbd68] to-[#b58b38] animate-pulse' : 'bg-[#caa24c] hover:bg-[#dfbd68]'}`}
                            >
                              <AnimatePresence mode="wait">
                                {isSendingCurrentBooking ? (
                                  <motion.span
                                    key="sending"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.2 }}
                                    className="inline-flex items-center gap-2"
                                  >
                                    <Loader2 size={13} className="animate-spin text-white" />
                                    Sending Package...
                                  </motion.span>
                                ) : contractBooking.contract_status === 'signed' ? (
                                  <motion.span
                                    key="signed"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.2 }}
                                    className="inline-flex items-center gap-2"
                                  >
                                    <CheckCircle2 size={13} className="text-emerald-300" />
                                    Agreement Complete
                                  </motion.span>
                                ) : agreementDeliveryConfirmed ? (
                                  <motion.span
                                    key="sent"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.2 }}
                                    className="inline-flex items-center gap-2"
                                  >
                                    <Eye size={13} className="text-white" />
                                    Review Contract
                                  </motion.span>
                                ) : (
                                  <motion.span
                                    key="delivery_pending"
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.2 }}
                                    className="inline-flex items-center gap-2"
                                  >
                                    <Clock size={12} className="text-white" />
                                    Agreement Pending
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </motion.button>
                          ) : (
                            proposalInvoice ? (
                              <span className="inline-flex min-h-11 items-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">
                                {proposalAcceptedAt ? 'Agreement Pending' : 'Awaiting Acceptance'}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openProposalBuilder()}
                                className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all cursor-pointer"
                              >
                                Build Proposal
                              </button>
                            )
                          )}
                          {contractBooking && agreementCanBeResent ? (
                            <button
                              type="button"
                              onClick={() => handleContractRequestAction(contractBooking, 'resend')}
                              disabled={updatingStatus}
                              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40 hover:text-[#8c6529] disabled:opacity-45 dark:hover:text-[#f1d27a]"
                            >
                              <RefreshCw size={13} className={contractActionKey === `resend-${contractBooking.id}` ? 'animate-spin' : ''} />
                              Resend Agreement
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </motion.section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Contract Status Card */}
                      <motion.section 
                        layout
                        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                        className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter"
                      >
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Agreement Status</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Document Type</span>
                              <span className="font-bold text-[color:var(--portal-text)]">{contractBooking ? 'Venue rental agreement' : proposalAcceptedAt ? 'Agreement delivery pending' : 'Proposal acceptance needed'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Status</span>
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={agreementStatusLabel}
                                  initial={{ opacity: 0, scale: 0.85 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.85 }}
                                  transition={{ duration: 0.2 }}
                                  className="rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase"
                                >
                                  {agreementStatusLabel}
                                </motion.span>
                              </AnimatePresence>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Sent Date</span>
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={agreementSentAt || 'unsent'}
                                  initial={{ opacity: 0, x: 6 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -6 }}
                                  transition={{ duration: 0.2 }}
                                  className="font-bold text-[color:var(--portal-text)]"
                                >
                                  {agreementSentAt ? formatDisplayDate(agreementSentAt) : agreementDeliveryPending ? 'Delivery pending' : agreementDeliveryFailed ? 'Delivery failed' : 'Not confirmed'}
                                </motion.span>
                              </AnimatePresence>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Signed Date</span>
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={contractBooking?.contract_signed_at || 'unsigned'}
                                  initial={{ opacity: 0, x: 6 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -6 }}
                                  transition={{ duration: 0.2 }}
                                  className="font-bold text-zinc-500"
                                >
                                  {contractBooking?.contract_signed_at ? formatDisplayDate(contractBooking.contract_signed_at) : 'Pending'}
                                </motion.span>
                              </AnimatePresence>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Signers</span>
                              <span className="font-bold text-[color:var(--portal-text)]">{lead.full_name}{lead.email ? `, ${lead.email}` : ''}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          {contractBooking ? (
                            <>
                              <motion.button 
                                layout
                                type="button" 
                                disabled={updatingStatus || contractBooking.contract_status === 'signed' || !agreementDeliveryConfirmed}
                                onClick={() => agreementDeliveryConfirmed ? void openContractReview(contractBooking) : undefined}
                                whileTap={{ scale: 0.97 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                className={`flex-1 min-w-[120px] py-2 rounded text-[9px] font-black uppercase text-white shadow-sm transition-colors cursor-pointer disabled:opacity-45 ${isSendingCurrentBooking ? 'bg-gradient-to-r from-[#b58b38] via-[#dfbd68] to-[#b58b38] animate-pulse' : 'bg-[#caa24c] hover:bg-[#a8792f]'}`}
                              >
                                <AnimatePresence mode="wait">
                                  {isSendingCurrentBooking ? (
                                    <motion.span key="sending" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="inline-flex items-center justify-center gap-1.5">
                                      <Loader2 size={11} className="animate-spin" />
                                      Sending...
                                    </motion.span>
                                  ) : contractBooking.contract_status === 'signed' ? (
                                    <motion.span key="signed" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                                      Agreement Complete
                                    </motion.span>
                                  ) : agreementDeliveryConfirmed ? (
                                    <motion.span key="sent" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                                      Review Agreement
                                    </motion.span>
                                  ) : (
                                    <motion.span key="not_sent" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                                      Agreement Pending
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                              </motion.button>
                              {agreementCanBeResent ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={updatingStatus}
                                    onClick={() => handleContractRequestAction(contractBooking, 'resend')}
                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/40 hover:text-[#a8792f] disabled:opacity-45 dark:hover:text-[#f1d27a]"
                                  >
                                    <RefreshCw size={11} className={contractActionKey === `resend-${contractBooking.id}` ? 'animate-spin' : ''} /> Resend agreement
                                  </button>
                                  <button
                                    type="button"
                                    disabled={updatingStatus}
                                    onClick={() => setContractToCancel(contractBooking)}
                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-rose-500/20 bg-rose-500/5 px-3 text-[9px] font-black uppercase tracking-wider text-rose-500 transition-colors hover:bg-rose-500/10 disabled:opacity-45 dark:text-rose-300"
                                  >
                                    <Trash2 size={11} /> Cancel
                                  </button>
                                </>
                              ) : null}
                            </>
                          ) : proposalInvoice ? (
                            <div className="flex-1 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">
                              {proposalAcceptedAt ? 'Agreement delivery pending' : 'Awaiting client acceptance'}
                            </div>
                          ) : (
                            <button type="button" onClick={() => openProposalBuilder()} className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c] text-[9px] font-black uppercase text-white hover:bg-[#a8792f] transition-colors cursor-pointer">Build Proposal</button>
                          )}
                        </div>
                      </motion.section>

                      {/* Signature History Card */}
                      <motion.section 
                        layout
                        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                        className="space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 dark:shadow-black/20 luxor-soft-enter"
                      >
                        <div>
                          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Signature Timeline</p>
                          <div className="space-y-3 text-xs">
                            <div className="flex items-start gap-3">
                              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${contractBooking ? 'border-emerald-700/25 bg-emerald-700/10 text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-400/15 dark:text-emerald-200' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}>
                                {contractBooking ? <Check size={11} strokeWidth={2.5} /> : <Circle size={7} className="fill-current" />}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-[color:var(--portal-text)]">Booking record created</p>
                                <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">{contractBooking ? formatTimelineDate(contractBooking.created_at) : proposalAcceptedAt ? 'Proposal accepted — record pending' : 'Not created yet'}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={agreementDeliveryConfirmed ? 'sent' : agreementDeliveryPending ? 'sending' : agreementDeliveryFailed ? 'failed' : 'unsent'}
                                  initial={{ scale: 0.6, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ scale: 0.6, opacity: 0 }}
                                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${agreementDeliveryConfirmed ? 'border-emerald-700/25 bg-emerald-700/10 text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-400/15 dark:text-emerald-200' : agreementDeliveryFailed ? 'border-rose-700/25 bg-rose-700/10 text-rose-800 dark:border-rose-300/30 dark:bg-rose-400/15 dark:text-rose-200' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}
                                >
                                  {agreementDeliveryConfirmed ? <Check size={11} strokeWidth={2.5} /> : agreementDeliveryFailed ? <AlertCircle size={11} strokeWidth={2.4} /> : <Circle size={7} className="fill-current" />}
                                </motion.span>
                              </AnimatePresence>
                              <div className="min-w-0">
                                <p className="font-bold text-[color:var(--portal-text)] transition-colors">{agreementDeliveryConfirmed ? 'Agreement email delivered' : agreementDeliveryPending ? 'Agreement email sending' : agreementDeliveryFailed ? 'Agreement email delivery failed' : 'Agreement email pending'}</p>
                                <AnimatePresence mode="wait">
                                  <motion.p
                                    key={agreementSentAt || agreementDeliveryJob?.status || 'no_sent'}
                                    initial={{ opacity: 0, y: 3 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -3 }}
                                    transition={{ duration: 0.2 }}
                                    className="text-[10px] leading-4 text-[color:var(--portal-muted)]"
                                  >
                                    {agreementSentAt ? formatTimelineDate(agreementSentAt) : agreementDeliveryPending ? 'Waiting for delivery confirmation' : agreementDeliveryFailed ? 'Review delivery before sending again' : 'No email confirmation yet'}
                                  </motion.p>
                                </AnimatePresence>
                              </div>
                            </div>
                            <div className="flex items-start gap-3">
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={contractBooking?.contract_status || (proposalAcceptedAt ? 'agreement_pending' : 'proposal_pending')}
                                  initial={{ scale: 0.6, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ scale: 0.6, opacity: 0 }}
                                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${contractBooking?.contract_status === 'signed' ? 'border-emerald-700/25 bg-emerald-700/10 text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-400/15 dark:text-emerald-200' : agreementDeliveryConfirmed ? 'border-[#a8792f]/35 bg-[#caa24c]/15 text-[#765017] dark:border-[#e3bf67]/35 dark:bg-[#caa24c]/20 dark:text-[#f4d98f] animate-pulse' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'}`}
                                >
                                  {contractBooking?.contract_status === 'signed' ? <Check size={11} strokeWidth={2.5} /> : <Circle size={7} className="fill-current" />}
                                </motion.span>
                              </AnimatePresence>
                              <div className="min-w-0">
                                <AnimatePresence mode="wait">
                                  <motion.p
                                    key={contractBooking?.contract_status === 'signed' ? 'signed_title' : contractBooking?.contract_status === 'viewed' ? 'viewed_title' : agreementDeliveryConfirmed ? 'awaiting_title' : 'not_ready_title'}
                                    initial={{ opacity: 0, y: 3 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -3 }}
                                    transition={{ duration: 0.2 }}
                                    className="font-bold text-[color:var(--portal-text)]"
                                  >
                                    {contractBooking?.contract_status === 'signed' ? 'Contract signed' : contractBooking?.contract_status === 'viewed' ? 'Contract viewed by client' : agreementDeliveryConfirmed ? 'Awaiting client signature' : 'Signing link not ready'}
                                  </motion.p>
                                </AnimatePresence>
                                <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">{contractBooking?.contract_signed_at ? formatTimelineDate(contractBooking.contract_signed_at) : agreementDeliveryConfirmed ? 'Waiting for the client to sign' : proposalAcceptedAt ? 'Agreement delivery must complete first' : 'The client must accept the proposal first'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'deposit') {
                const depositPctPaid = initialPaymentInvoiceTotal > 0
                  ? Math.min(100, Math.round(((initialPaymentInvoiceTotal - depositBalance) / initialPaymentInvoiceTotal) * 100))
                  : 0
                return (
                  <>
                    {/* Next Move */}
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.14)"
                      gradientFrom="#caa24c"
                      gradientTo="#8c6529"
                      gradientOpacity={0.22}
                    >
                      <BorderBeam size={75} duration={11} colorFrom="#caa24c" colorTo="#dfbd68" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <DollarSign size={18} />
                          </span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              {depositBalance <= 0 ? 'Initial booking payment received' : 'Collect initial booking payment'}
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              {depositBalance <= 0 ? 'The initial booking payment is received. The separate $750 refundable security deposit remains due or held independently. The remaining event balance is due on the agreed date.' : 'The Stripe link was emailed after signature for the initial booking payment only. The separate $750 refundable security deposit has its own payment.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {depositInvoice && depositBalance > 0 ? <button type="button" onClick={() => openPaymentRequest(depositInvoice)} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all cursor-pointer">Resend Payment Link</button> : null}
                          {latestBooking ? (
                            <button type="button" onClick={() => handleRecordManualPayment(latestBooking, 'deposit')} className="min-h-11 rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/10 px-5 text-[10px] font-black uppercase tracking-wider text-[#a8792f] dark:text-[#f1d27a] hover:bg-[#caa24c]/20 transition-all cursor-pointer">
                              Mark Initial Payment Paid
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </MagicCard>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Deposit Summary */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-3">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Deposit Invoice</p>
                              <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{depositBalance <= 0 && initialPaymentInvoiceTotal > 0 ? 'Initial booking payment settled' : 'Due with agreement signature'}</p>
                            </div>
                            <AnimatedCircularProgressBar
                              value={depositPctPaid}
                              max={100}
                              min={0}
                              size={48}
                              strokeWidth={4.5}
                              gaugePrimaryColor={depositBalance <= 0 && initialPaymentInvoiceTotal > 0 ? '#10b981' : '#caa24c'}
                              gaugeSecondaryColor="rgba(202, 162, 76, 0.14)"
                              className="shrink-0"
                            />
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Invoice Number</span>
                              <span className="font-bold tabular-nums text-[color:var(--portal-text)]">{depositInvoice ? depositInvoice.id.slice(0, 8).toUpperCase() : 'No invoice'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Deposit Due Date</span>
                              <span className="font-bold text-[color:var(--portal-text)]">Due with agreement signature</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Initial Payment + Security</span>
                              <span className="font-serif font-bold tabular-nums text-sm text-[#a8792f] dark:text-[#caa24c]">{formatMoney(initialPaymentInvoiceTotal)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Paid Status</span>
                              <span className="rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">{depositBalance <= 0 && initialPaymentInvoiceTotal > 0 ? 'paid / held' : 'pending'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Remaining Balance</span>
                              <span className="font-bold tabular-nums text-[color:var(--portal-text)]">{formatMoney(depositBalance)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          {depositInvoice && depositBalance > 0 ? <button type="button" onClick={() => openPaymentRequest(depositInvoice)} className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c] text-[9px] font-black uppercase text-white hover:bg-[#a8792f] transition-colors cursor-pointer">Resend Payment Link</button> : null}
                          {latestBooking ? (
                            <button type="button" onClick={() => handleRecordManualPayment(latestBooking, 'deposit')} className="flex-1 min-w-[80px] py-1.5 rounded border border-[#caa24c]/25 bg-[#caa24c]/10 text-[9px] font-black uppercase text-[#a8792f] dark:text-[#caa24c] hover:bg-[#caa24c]/15 transition-colors cursor-pointer">Mark Initial Payment Paid</button>
                          ) : null}
                        </div>
                      </section>

                      {/* Payment Schedule */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)] mb-3">Payment Schedule</p>
                          <div className="space-y-3 text-xs">
                            <div className="flex justify-between py-2 border-b border-[color:var(--portal-border)]">
                              <div>
                                <p className="font-bold text-[color:var(--portal-text)]">1. Initial Booking Payment + Security Deposit</p>
                                <p className="text-[9px] text-[color:var(--portal-muted)]">Due with agreement signature</p>
                              </div>
                              <span className="font-serif font-bold tabular-nums text-sm text-[#a8792f] dark:text-[#caa24c]">{formatMoney(initialPaymentInvoiceTotal)}</span>
                            </div>
                            <div className="flex justify-between py-2">
                              <div>
                                <p className="font-bold text-[color:var(--portal-text)]">2. Remaining Final Event Price Balance</p>
                                <p className="text-[9px] text-[color:var(--portal-muted)]">{latestBooking?.final_payment_due_date ? `Due ${formatDisplayDate(latestBooking.final_payment_due_date)}` : 'Due date not set'}</p>
                              </div>
                              <span className="font-bold tabular-nums text-[color:var(--portal-muted)]">{formatMoney(finalPaymentTotal)}</span>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'final_payment') {
                const paymentContext = (proposalInvoice?.proposal_context || {}) as Record<string, unknown>
                const paymentPlan = paymentContext.payment_plan as Record<string, unknown> | null | undefined
                const eventDate = typeof paymentContext.event_date === 'string' ? paymentContext.event_date : agreementBooking?.event_date
                const venueServices = typeof paymentContext.venue_services_total === 'number' ? paymentContext.venue_services_total : null
                const eventServices = typeof paymentContext.event_services_total === 'number' ? paymentContext.event_services_total : null
                const paymentCount = paymentPlan && typeof paymentPlan === 'object' && Number.isInteger(Number(paymentPlan.payment_count)) ? Number(paymentPlan.payment_count) : 4
                return (
                  <>
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.14)"
                      gradientFrom="#caa24c"
                      gradientTo="#8c6529"
                      gradientOpacity={0.22}
                    >
                      <BorderBeam size={75} duration={11} colorFrom="#caa24c" colorTo="#dfbd68" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Final payment</p>
                          <h4 className="mt-1 text-xl font-black text-[color:var(--portal-text)]">Track the event payment schedule</h4>
                          <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Payments are applied to Venue Services first, then Event Services. The refundable security deposit is tracked separately.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {finalBalanceInvoice && finalPaymentBalance > 0 ? <button type="button" onClick={() => openPaymentRequest(finalBalanceInvoice)} className="min-h-11 rounded-xl bg-[#b98a3e] px-5 text-[10px] font-black uppercase tracking-wider !text-white shadow-md hover:bg-[#a8792f] transition-all">Send secure payment link</button> : null}
                          {agreementBooking && finalPaymentBalance > 0 ? <button type="button" onClick={() => handleRecordManualPayment(agreementBooking, 'final')} className="min-h-11 rounded-xl border border-[#caa24c]/30 bg-[color:var(--portal-soft)] px-5 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] hover:border-[#caa24c]/60 transition-all">Record manual payment</button> : null}
                        </div>
                      </div>
                    </MagicCard>
                    <ProposalPaymentSchedule
                      finalEventPrice={Number(proposalInvoice?.total || agreementBooking?.contract_total || 0)}
                      venueServicesTotal={venueServices}
                      eventServicesTotal={eventServices}
                      refundableSecurityDeposit={refundableSecurityDepositAmount}
                      paymentPlan={paymentPlan && typeof paymentPlan === 'object' ? paymentPlan : null}
                      eventDate={eventDate}
                      bookingDate={typeof paymentPlan?.booking_date === 'string' ? paymentPlan.booking_date : agreementBooking?.created_at?.slice(0, 10)}
                      depositPaid={Boolean(agreementBooking?.metadata?.deposit_paid_at)}
                      paymentCount={paymentCount}
                      installments={paymentInstallments}
                    />
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Payment history</p><span className="text-[10px] font-bold text-[color:var(--portal-muted)]">Event payments only</span></div>
                      <div className="space-y-3">{sortedPayments.filter((payment) => !/security deposit/i.test(String(payment.metadata?.payment_kind || payment.metadata?.description || ''))).length ? sortedPayments.filter((payment) => !/security deposit/i.test(String(payment.metadata?.payment_kind || payment.metadata?.description || ''))).map((payment) => { const needsReview = payment.metadata?.deposit_receipt_review === true || Boolean(payment.metadata?.receipt_received && payment.status !== 'paid'); return <div key={payment.id} className="flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-3 text-xs"><div><p className="font-bold text-[color:var(--portal-text)]">{String(payment.metadata?.payment_kind || 'Event payment').replaceAll('_', ' ')}</p><p className="text-[10px] text-[color:var(--portal-muted)]">{needsReview ? 'Received — review required' : payment.paid_at ? `Paid ${formatDisplayDate(payment.paid_at)}` : formatTimelineDate(payment.created_at)}</p></div><span className={`tabular-nums font-bold ${needsReview ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-300'}`}>{formatMoney(payment.amount)}</span></div> }) : <p className="text-xs text-[color:var(--portal-muted)]">No event payments have been recorded yet.</p>}</div>
                    </section>
                  </>
                )
              }

              if (currentStage === 'event') {
                const eventMilestones = [
                  { label: 'Coordinator assigned', done: Boolean(activeEventMetadata.event_coordinator) },
                  { label: 'Access details captured', done: Boolean(activeEventMetadata.gate_access_code || activeEventMetadata.backdoor_code) },
                  { label: 'Run of show confirmed', done: Boolean(activeEventMetadata.run_of_show_confirmed_at) },
                  { label: 'Vendor arrival windows confirmed', done: Boolean(activeEventMetadata.vendor_windows_confirmed_at) },
                  { label: 'Final walkthrough complete', done: Boolean(activeEventMetadata.final_walkthrough_completed_at) },
                ]
                const eventMilestonesDone = eventMilestones.filter((item) => item.done).length
                const eventMilestonesPct = Math.round((eventMilestonesDone / eventMilestones.length) * 100)
                return (
                  <>
                    {/* Next Move */}
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.14)"
                      gradientFrom="#caa24c"
                      gradientTo="#8c6529"
                      gradientOpacity={0.22}
                    >
                      <BorderBeam size={75} duration={11} colorFrom="#caa24c" colorTo="#dfbd68" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <Flame size={18} />
                          </span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              Execute event day operations
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              Verify gate access codes, coordinate vendor arrival windows, and review run of show schedule.
                            </p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setActiveLeadTab('timeline')} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all cursor-pointer">
                          Run of Show
                        </button>
                      </div>
                    </MagicCard>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Coordinator & Contacts */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">On-Site operations</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Head Contact</span>
                              <span className="font-bold text-[color:var(--portal-text)]">{lead.full_name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Assigned Coordinator</span>
                              <span className="font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.event_coordinator || 'Not assigned')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Gate Access Code</span>
                              <span className="tabular-nums font-bold text-[#a8792f] dark:text-[#caa24c]">{String(activeEventMetadata.gate_access_code || 'Not set')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Backdoor Code</span>
                              <span className="tabular-nums font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.backdoor_code || 'Not set')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)]">Emergency Line</span>
                              <span className="tabular-nums font-bold text-[color:var(--portal-text)]">{String(activeEventMetadata.emergency_contact || 'Not set')}</span>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Event Day Checklist */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-3 luxor-soft-enter">
                        <div className="mb-3 flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Operation Milestones</p>
                            <p className="mt-1 text-[10px] tabular-nums text-[color:var(--portal-muted)]">{eventMilestonesDone} of {eventMilestones.length} milestones complete</p>
                          </div>
                          <AnimatedCircularProgressBar
                            value={eventMilestonesPct}
                            max={100}
                            min={0}
                            size={48}
                            strokeWidth={4.5}
                            gaugePrimaryColor={eventMilestonesPct >= 100 ? '#10b981' : '#caa24c'}
                            gaugeSecondaryColor="rgba(202, 162, 76, 0.14)"
                            className="shrink-0"
                          />
                        </div>
                        <div className="space-y-2 text-xs">
                          {eventMilestones.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 py-0.5">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                item.done ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'
                              }`}>
                                {item.done && <Check size={8} className="stroke-[3]" />}
                              </span>
                              <span className={item.done ? 'text-[color:var(--portal-muted)] line-through' : 'font-medium text-[color:var(--portal-text)]'}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'complete') {
                return (
                  <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 luxor-soft-enter">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 text-emerald-600 dark:text-emerald-400" size={20} />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">Booking complete</p>
                        <h4 className="mt-1 text-base font-black text-[color:var(--portal-text)]">{latestBooking?.status === 'completed' ? 'The event and closeout are both recorded.' : 'Closeout is finished and ready for final completion.'}</h4>
                        <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">The refundable security-deposit decision remains in the closeout history for your records.</p>
                      </div>
                      </div>
                      {latestBooking?.status !== 'completed' ? <button type="button" onClick={() => latestBooking && handleBookingMilestone(latestBooking, 'complete')} disabled={!latestBooking || updatingStatus} className="min-h-11 rounded-xl bg-emerald-600 px-5 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40">Mark Booking Complete</button> : null}
                    </div>
                  </section>
                )
              }

              if (currentStage === 'closing') {
                const closingChecklist = [
                  { label: 'Thank-you follow-up logged', done: Boolean(activeEventMetadata.thank_you_follow_up_logged_at) },
                  { label: 'Review request ready', done: Boolean(activeEventMetadata.review_request_ready_at) },
                  { label: 'Photo/video assets requested', done: Boolean(activeEventMetadata.assets_requested_at) },
                  { label: 'Security deposit return authorized', done: Boolean(activeEventMetadata.deposit_return_authorized_at) },
                  { label: 'Damage report & final inspection cleared', done: Boolean(activeEventMetadata.final_inspection_cleared_at) },
                  { label: 'Anniversary reminder noted', done: Boolean(activeEventMetadata.anniversary_reminder_date) },
                ]
                const closingDoneCount = closingChecklist.filter((item) => item.done).length
                const closingDonePct = Math.round((closingDoneCount / closingChecklist.length) * 100)
                return (
                  <>
                    {/* Next Move */}
                    <MagicCard
                      className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter"
                      gradientColor="rgba(202, 162, 76, 0.14)"
                      gradientFrom="#caa24c"
                      gradientTo="#8c6529"
                      gradientOpacity={0.22}
                    >
                      <BorderBeam size={75} duration={11} colorFrom="#caa24c" colorTo="#dfbd68" borderWidth={1.5} />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <CheckCircle size={18} />
                          </span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              {latestBooking?.status === 'completed' ? 'Booking completed' : 'Finish the post-event closeout'}
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              Review the event, refund the security deposit when appropriate, then finish closeout. Completion is the separate final step.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {latestBooking?.security_deposit_status === 'held' ? (
                            <button
                              type="button"
                              onClick={() => setConfirmRefundModalOpen(true)}
                              className="min-h-11 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-2"
                            >
                              <RotateCcw size={14} /> Refund {formatMoney(refundableSecurityDepositAmount)} Security Deposit (Stripe)
                            </button>
                          ) : latestBooking?.security_deposit_status === 'refunded' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                              <CheckCircle size={14} /> Deposit Refunded ({formatMoney(refundableSecurityDepositAmount)})
                            </span>
                          ) : null}
                          <button type="button" onClick={() => latestBooking && handleBookingMilestone(latestBooking, 'closing')} disabled={!latestBooking || updatingStatus} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                            Finish Closeout
                          </button>
                        </div>
                      </div>
                    </MagicCard>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Post-Event Checklist */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-3 luxor-soft-enter">
                        <div className="mb-3 flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Wrap-Up Checklist</p>
                            <p className="mt-1 text-[10px] tabular-nums text-[color:var(--portal-muted)]">{closingDoneCount} of {closingChecklist.length} items completed</p>
                          </div>
                          <AnimatedCircularProgressBar
                            value={closingDonePct}
                            max={100}
                            min={0}
                            size={48}
                            strokeWidth={4.5}
                            gaugePrimaryColor={closingDonePct >= 100 ? '#10b981' : '#caa24c'}
                            gaugeSecondaryColor="rgba(202, 162, 76, 0.14)"
                            className="shrink-0"
                          />
                        </div>
                        <div className="space-y-2 text-xs">
                          {closingChecklist.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 py-0.5">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                item.done ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'
                              }`}>
                                {item.done && <Check size={8} className="stroke-[3]" />}
                              </span>
                              <span className={item.done ? 'text-[color:var(--portal-muted)] line-through' : 'font-medium text-[color:var(--portal-text)]'}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Feedback & Referrals */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)] mb-2">Anniversary Reminder</p>
                          <p className="text-xs text-[color:var(--portal-muted)] leading-relaxed">
                            {activeEventMetadata.anniversary_reminder_date
                              ? <>Anniversary reminder noted for <strong className="text-[color:var(--portal-text)]">{formatDisplayDate(String(activeEventMetadata.anniversary_reminder_date))}</strong>. No post-event email automation is created from this page.</>
                              : 'No anniversary reminder date has been captured yet.'}
                          </p>
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              // Default cards for other stages
              return (
                <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 text-center text-[color:var(--portal-muted)] space-y-3 luxor-soft-enter">
                  <Sparkles size={24} className="mx-auto text-[#caa24c]" />
                  <p className="text-xs uppercase font-black tracking-widest text-[#caa24c] capitalize">{currentStage} Stage Dashboard</p>
                  <p className="text-xs leading-relaxed max-w-md mx-auto">
                    Welcome to the <strong>{currentStage.toUpperCase()}</strong> stage. This dossier dashboard automatically adapts to show details, invoices, and documents matching this phase.
                  </p>
                  <div className="pt-4 flex justify-center gap-3">
                    <button type="button" onClick={() => setSelectedStageOverride(null)} className="px-4 py-2 rounded-lg border border-[color:var(--portal-border)] text-[10px] font-black uppercase text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer">
                      Reset Preview to Active Stage
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Right Column: Sticky actions & summary — animates push in from right to left */}
          <AnimatePresence initial={false}>
            {showClientSidebar ? (
              <motion.div
                key="dossier-client-sidebar"
                initial={{ width: 0, opacity: 0, x: 56 }}
                animate={{ width: 'auto', opacity: 1, x: 0 }}
                exit={{ width: 0, opacity: 0, x: 56 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="w-full shrink-0 overflow-hidden xl:w-auto"
              >
                <div ref={dualPaneRightRef} className="min-w-0 space-y-6 py-0.5 pr-0.5 xl:w-[370px] 2xl:w-[420px] xl:pl-6">
            {(() => {
              const currentStage = selectedStageOverride || activeStage
              
              if (currentStage === 'newsletter' || currentStage === 'inquiry') {
                return (
                  <>
                    <ClientSummaryCard
                      lead={clientSummaryLead}
                      isSaving={Boolean(savingLeadField)}
                      onUpdate={handleLeadFieldUpdate}
                      onViewDetails={() => scrollToSection('lead-messages')}
                      onAvatarUpdate={(newUrl) => {
                        setLead((current) => current ? {
                          ...current,
                          metadata: {
                            ...(current.metadata || {}),
                            avatar_url: newUrl
                          }
                        } : null)
                      }}
                    />
                    {!isNewsletter ? renderEventSummaryCard() : null}

                    {/* Recommended Actions */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Recommended Actions</p>
                          <p className="mt-1 text-[10px] text-[color:var(--portal-muted)] font-medium">Top priority first</p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {recommendedActions.length === 0 ? (
                          <p className="text-xs text-[color:var(--portal-muted)] italic py-4">No recommended actions at this stage.</p>
                        ) : (
                          recommendedActions.map((action, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={action.onClick}
                              disabled={action.disabled}
                              className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[#caa24c]/8 hover:border-[#caa24c]/30 transition-all duration-200 group cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#caa24c] shadow-xs group-hover:border-[#caa24c]/50">
                                  {action.icon}
                                </span>
                                <div>
                                  <p className="text-xs font-bold text-[color:var(--portal-text)] group-hover:text-[#caa24c] transition-colors">{action.label}</p>
                                  <p className="text-[10px] text-[color:var(--portal-muted)] mt-0.5">{action.detail}</p>
                                </div>
                              </div>
                              <span className="text-[color:var(--portal-muted)] group-hover:text-[#caa24c] transition-colors">
                                <ChevronRight size={14} />
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                      
                      <div className="mt-4 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveLeadTab('tasks')}
                          className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c] hover:text-[#dfbd68] transition-colors cursor-pointer"
                        >
                          View all tasks &rarr;
                        </button>
                      </div>
                    </section>

                    {renderMarketingEngagementCard()}

                  </>
                )
              }
              
              // For all stages other than inquiry, render the stage action layout.
              let nextStepTitle = 'Prepare proposal'
              let nextStepDetail = 'Draft pricing and confirm the next decision step'
              let nextStepButton = 'Open Documents'
              let nextStepAction = () => setActiveLeadTab('documents')
              
              if (currentStage === 'proposal') {
                nextStepTitle = 'Publish the final proposal'
                nextStepDetail = 'The client selects the locked package; Luxor then creates the matching booking automatically.'
                nextStepButton = 'Build Final Proposal'
                nextStepAction = () => openProposalBuilder()
              } else if (currentStage === 'contract') {
                nextStepTitle = 'Track contract'
                nextStepDetail = 'Mark sent or signed manually once handled outside the portal'
                nextStepButton = 'Open Booking'
                nextStepAction = () => scrollToSection('lead-booking')
              } else if (currentStage === 'deposit') {
                nextStepTitle = 'Record deposit'
                nextStepDetail = 'Manually mark deposit paid after payment is confirmed'
                nextStepButton = latestBooking ? 'Mark Initial Payment Paid' : 'Build Final Proposal'
                nextStepAction = latestBooking ? () => handleRecordManualPayment(latestBooking, 'deposit') : () => openProposalBuilder()
              } else if (currentStage === 'planning') {
                nextStepTitle = 'Confirm planning details'
                nextStepDetail = 'Fill any missing event details before final balance'
                nextStepButton = latestBooking ? 'Confirm Planning' : 'Build Final Proposal'
                nextStepAction = latestBooking ? () => handleBookingMilestone(latestBooking, 'planning') : () => openProposalBuilder()
              } else if (currentStage === 'final_payment') {
                nextStepTitle = 'Collect final payment'
                nextStepDetail = finalBalanceInvoice ? 'Send the secure balance link; Stripe advances the stage after payment' : 'Create an invoice before collecting the balance'
                nextStepButton = finalBalanceInvoice ? 'Send Secure Payment Link' : 'Create Invoice'
                nextStepAction = finalBalanceInvoice ? () => openPaymentRequest(finalBalanceInvoice) : () => setIsInvoiceModalOpen(true)
              } else if (currentStage === 'event') {
                nextStepTitle = 'Close out event'
                nextStepDetail = 'Finish inspection, deposit return, and review readiness'
                nextStepButton = 'Close Out Event'
                nextStepAction = latestBooking ? () => handleBookingMilestone(latestBooking, 'event') : () => openProposalBuilder()
              } else if (currentStage === 'closing') {
                nextStepTitle = 'Finish closeout'
                nextStepDetail = 'Confirm the event inspection and security-deposit decision, then move the booking to its separate completion step'
                nextStepButton = 'Finish Closeout'
                nextStepAction = latestBooking ? () => handleBookingMilestone(latestBooking, 'closing') : () => openProposalBuilder()
              }

              return (
                <>
                  <ClientSummaryCard
                    lead={clientSummaryLead}
                    isSaving={Boolean(savingLeadField)}
                    onUpdate={handleLeadFieldUpdate}
                    onViewDetails={() => scrollToSection('lead-messages')}
                    onAvatarUpdate={(newUrl) => {
                      setLead((current) => current ? {
                        ...current,
                        metadata: {
                          ...(current.metadata || {}),
                          avatar_url: newUrl
                        }
                      } : null)
                    }}
                  />
                  {!isNewsletter ? renderEventSummaryCard() : null}

                  {/* NEXT STEP */}
                  <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Next Step</p>
                    </div>
                    <div className="flex items-start gap-4 text-left">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] border border-[#caa24c]/20">
                        <Calendar size={18} />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-[color:var(--portal-text)] leading-tight">{nextStepTitle}</h4>
                        <p className="mt-1 text-[10px] text-[color:var(--portal-muted)] leading-relaxed">{nextStepDetail}</p>
                      </div>
                    </div>
                    <div className="mt-5">
                      <button
                        type="button"
                        onClick={nextStepAction}
                        className="w-full py-2.5 rounded-lg bg-[#caa24c] hover:bg-[#dfbd68] text-xs font-black uppercase tracking-[0.14em] text-white shadow-md shadow-[#caa24c]/10 transition-all cursor-pointer active:scale-95"
                      >
                        {nextStepButton}
                      </button>
                    </div>
                  </section>

                  {renderMarketingEngagementCard()}

                  {/* RECENT ACTIVITY */}
                  <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Recent Activity</p>
                    </div>
                    <div className="space-y-4 text-left">
                      {allActivityEntries.length ? allActivityEntries.slice(0, 3).map((entry) => {
                        const isEmail = entry.kind === 'email'
                        return <div key={entry.id} className="group relative flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[color:var(--portal-soft)]">
                          {isEmail ? <Link href={emailReaderUrl(entry.email)} aria-label={`Open email: ${decodeHtmlEntities(entry.email.subject)}`} className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40" /> : <button type="button" onClick={() => setActiveLeadTab('activity')} aria-label="Open activity" className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40" />}
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                            {entry.kind === 'email' ? <Mail size={11} /> : entry.kind === 'call' ? <Phone size={11} /> : <Check size={11} className="stroke-[3]" />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold leading-tight text-[color:var(--portal-text)] group-hover:text-[#a8792f] dark:group-hover:text-[#f1d27a]">{entry.kind === 'email' ? decodeHtmlEntities(entry.email.subject) : describeActivityEntry(entry)}</p>
                            <p className="mt-0.5 text-[9px] text-[color:var(--portal-muted)]">{formatTimelineDate(entry.createdAt)}</p>
                          </div>
                        </div>
                      }) : (
                        <p className="text-xs text-[color:var(--portal-muted)]">No recent activity logged yet.</p>
                      )}
                    </div>
                    <div className="mt-4 pt-3 border-t border-[color:var(--portal-border)] text-center">
                      <button
                        type="button"
                        onClick={() => setActiveLeadTab('activity')}
                        className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#caa24c] hover:text-[#dfbd68] transition-colors cursor-pointer"
                      >
                        View All Activity &rarr;
                      </button>
                    </div>
                  </section>
                </>
              )
            })()}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : (
        <div className={`mt-3 grid gap-6 pb-12 sm:pb-16 ${
          activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes'
            ? 'lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)]'
            : 'lg:grid-cols-1'
        }`}>
          {activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes' ? (
            <div className="space-y-6">
              {activeLeadTab === 'notes' ? (
                <form
                  onSubmit={handlePostNote}
                  className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                    <div>
                      <h3 className="flex items-center gap-2.5 font-semibold text-white/90">
                        <NotebookPen size={16} className="text-zinc-500" />
                        Manual Note
                      </h3>
                      <p className="mt-1 text-xs text-zinc-600">Save a private note to this client record.</p>
                    </div>
                    <PortalSelect
                      value={noteType}
                      onChange={(value) => setNoteType(value as typeof noteType)}
                      options={[
                        { value: 'note', label: 'Note' },
                        { value: 'call_log', label: 'Call' },
                        { value: 'email_log', label: 'Email' },
                      ]}
                    />
                  </div>

                  <textarea
                    value={noteContent}
                    onChange={(event) => setNoteContent(event.target.value)}
                    placeholder="Type the note here..."
                    className="min-h-32 w-full rounded-xl border border-zinc-900 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-200 outline-none transition-colors placeholder:text-zinc-700 focus:border-[#caa24c]/40"
                  />

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {quickNoteTemplates.map((template) => (
                        <button
                          key={template.label}
                          type="button"
                          onClick={() => {
                            setNoteType(template.type)
                            setNoteContent(template.value)
                          }}
                          className="rounded-full border border-zinc-850 bg-zinc-950/60 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-zinc-500 transition-colors hover:border-[#caa24c]/25 hover:bg-[#caa24c]/10 hover:text-[#f1d27a]"
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={submittingNote || !noteContent.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#caa24c] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-[#caa24c]/10 transition-colors hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Send size={12} />
                      {submittingNote ? 'Saving...' : 'Save Note'}
                    </button>
                  </div>
                </form>
              ) : null}

              {activeLeadTab === 'messages' ? (
                <LuxorTextThread inquiryId={lead.id} phone={lead.phone} contactName={lead.full_name} />
              ) : null}

              {activeLeadTab === 'messages' ? (
                <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Tour Email Delivery</p>
                      <p className="mt-1 text-[10px] text-zinc-600">Saved confirmations, reminders, delivery status, and scheduled send times</p>
                    </div>
                    <button type="button" onClick={() => openTourScheduleModal('new_visit')} disabled={!lead.email} className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#caa24c] disabled:opacity-40">
                      Schedule Tour
                    </button>
                  </div>
                  {tourEmailJobs.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-zinc-850 px-4 py-6 text-center text-xs text-zinc-600">No tour emails have been saved for this client yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {tourEmailJobs.map((job) => (
                        <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black/20 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-zinc-200">{decodeHtmlEntities(job.subject)}</p>
                            <p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-600">
                              {job.job_type.replaceAll('_', ' ')} · {job.sent_at ? `Sent ${formatTimelineDate(job.sent_at)}` : `Scheduled ${formatTimelineDate(job.scheduled_for)}`}
                            </p>
                            {job.last_error ? <p className="mt-1 text-[10px] text-red-400">{job.last_error}</p> : null}
                          </div>
                          <span className={`rounded border px-2 py-1 text-[8px] font-black uppercase tracking-widest ${
                            job.status === 'sent' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' :
                            job.status === 'failed' ? 'border-red-500/20 bg-red-500/10 text-red-400' :
                            job.status === 'cancelled' ? 'border-zinc-700 bg-zinc-800/40 text-zinc-500' :
                            'border-amber-500/20 bg-amber-500/10 text-amber-400'
                          }`}>{job.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-xl shadow-black/10">
                <PortalFilterBar
                  searchValue={activitySearch}
                  onSearchChange={setActivitySearch}
                  searchPlaceholder="Search this contact’s history"
                  resultLabel={`${activityEntries.length.toLocaleString()} ${activityEntries.length === 1 ? 'entry' : 'entries'}`}
                  activeFilters={activityFilterChips}
                  onClearFilters={() => {
                    setActiveFeedTab('all')
                    setActivityWindow('all')
                  }}
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PortalSelect
                      value={activeFeedTab}
                      onChange={(value) => setActiveFeedTab(value as typeof activeFeedTab)}
                      className="w-full"
                      options={[
                        { value: 'all', label: 'All activity types' },
                        { value: 'comms', label: 'Calls & email' },
                        { value: 'notes', label: 'Notes' },
                        { value: 'system', label: 'Status changes' },
                      ]}
                    />
                    <PortalSelect
                      value={activityWindow}
                      onChange={(value) => setActivityWindow(value as typeof activityWindow)}
                      className="w-full"
                      options={[
                        { value: 'all', label: 'Any time' },
                        { value: '30d', label: 'Past 30 days' },
                        { value: '90d', label: 'Past 90 days' },
                        { value: 'year', label: 'Past year' },
                      ]}
                    />
                  </div>
                </PortalFilterBar>
              </section>

              {activityEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-4 py-6 text-sm text-[color:var(--portal-muted)]">
                  <p className="font-semibold text-[color:var(--portal-text)]">{activityEmptyTitle}</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{activityEmptyCopy}</p>
                </div>
              ) : (
                <div className="relative ml-3 space-y-6 border-l border-[color:var(--portal-border)] pl-6">
                  {visibleActivityEntries.map((entry) => {
                    if (entry.kind === 'call') {
                      const call = entry.call
                      const otherNumber = call.direction === 'inbound' ? call.caller_number : call.callee_number
                      return (
                        <div key={entry.id} className="relative group">
                          <div className="absolute -left-[29px] top-[7px] z-10 h-2.5 w-2.5 rotate-45 border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] transition-all group-hover:border-[#caa24c] group-hover:bg-[color:color-mix(in_srgb,var(--portal-bg)_80%,#caa24c_20%)]" />
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Luxor call</span>
                            <div className="flex items-center gap-3">
                              <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${call.direction === 'inbound' ? 'border-blue-500/20 bg-blue-500/10 text-blue-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>{call.direction}</span>
                              <span className="text-[9px] font-mono text-zinc-600">{formatTimelineDate(entry.createdAt)}</span>
                            </div>
                          </div>
                          <p className="text-xs font-bold text-zinc-200">{describeActivityEntry(entry)}</p>
                          <p className="mt-1 font-mono text-[10px] text-zinc-600">{otherNumber} · {call.duration_seconds === null ? call.status : formatCallDuration(call.duration_seconds)}</p>
                          {call.recording_sid ? (
                            <div className="mt-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
                              <p className="mb-2 text-[10px] font-semibold text-[color:var(--portal-muted)]">{call.is_voicemail ? 'Voicemail recording' : 'Call recording'}</p>
                              <audio id={`luxor-call-audio-${call.id}`} controls preload="none" className="w-full" src={`/api/twilio/recordings/${call.recording_sid}?inquiryId=${encodeURIComponent(id)}`}>Your browser does not support audio playback.</audio>
                            </div>
                          ) : call.status === 'completed' ? (
                            <p className="mt-2 text-[11px] text-[color:var(--portal-muted)]">No recording is available for this call.</p>
                          ) : null}
                          {call.is_voicemail ? <p className="mt-2 text-[11px] text-[color:var(--portal-muted)]">Voicemail is available for playback and is not transcribed.</p> : null}
                          {call.recording_consent_status === 'consented' && !call.is_voicemail ? (
                          <div className="mt-3 overflow-hidden rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--portal-border)] p-3">
                              <div className="inline-flex rounded-lg bg-[color:var(--portal-soft)] p-1" role="tablist" aria-label="Call details">
                                <button type="button" role="tab" aria-selected={(callViewModes[call.id] || 'transcript') === 'transcript'} onClick={() => setCallViewModes((current) => ({ ...current, [call.id]: 'transcript' }))} className={`min-h-9 rounded-md px-3 text-xs font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] ${(callViewModes[call.id] || 'transcript') === 'transcript' ? 'bg-[color:var(--portal-card)] shadow-sm' : ''}`}>Transcript</button>
                                <button type="button" role="tab" aria-selected={(callViewModes[call.id] || 'transcript') === 'summary'} onClick={() => void showCallSummary(call)} disabled={call.transcription_status !== 'completed'} className={`min-h-9 rounded-md px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] ${(callViewModes[call.id] || 'transcript') === 'summary' ? 'bg-[color:var(--portal-card)] shadow-sm' : ''}`}>Summary</button>
                              </div>
                              <span className="text-[10px] text-[color:var(--portal-muted)]">{call.transcription_status === 'completed' ? 'Transcript ready' : call.transcription_status === 'failed' ? 'Transcript unavailable' : 'Transcript processing'}</span>
                            </div>
                            {(callViewModes[call.id] || 'transcript') === 'transcript' ? (
                              <div role="tabpanel" className="max-h-80 space-y-3 overflow-y-auto p-3 sm:p-4">
                                {(call.transcript_segments || []).length ? call.transcript_segments?.map((segment) => {
                                  const seekSeconds = typeof segment.startSeconds === 'number' ? segment.startSeconds : null
                                  return (
                                    <button type="button" key={segment.id} onClick={() => seekCallRecording(call.id, seekSeconds)} disabled={typeof seekSeconds !== 'number' || !call.recording_sid} className="grid w-full grid-cols-[4.25rem_minmax(0,1fr)] gap-2 rounded-md text-left text-sm leading-6 hover:bg-[color:var(--portal-soft)] disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] sm:grid-cols-[5rem_minmax(0,1fr)]">
                                      <span className="pt-0.5 text-[10px] font-semibold text-[color:var(--portal-muted)]">{segment.track === 'caller' || segment.track === 'customer' || (call.direction === 'inbound' ? segment.track === 'outbound_track' : segment.track === 'inbound_track') ? 'Caller' : 'Luxor'}</span>
                                      <span className="break-words text-[color:var(--portal-text)]">{segment.text}</span>
                                    </button>
                                  )
                                }) : <p className="text-sm text-[color:var(--portal-muted)]">{call.transcription_status === 'failed' ? 'The call transcript could not be processed.' : 'Transcript will appear here when Twilio finishes processing.'}</p>}
                              </div>
                            ) : (
                              <div role="tabpanel" className="min-h-24 p-4">
                                {generatingCallSummaryId === call.id || call.summary_status === 'generating' ? <p className="text-sm text-[color:var(--portal-muted)]">Preparing call summary…</p>
                                  : call.summary_text ? <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--portal-text)]">{call.summary_text}</p>
                                    : call.summary_status === 'failed' ? <p className="text-sm text-[color:var(--portal-muted)]">Summary could not be generated. Select Summary to retry.</p>
                                      : <p className="text-sm text-[color:var(--portal-muted)]">Select Summary to create a concise summary from this transcript.</p>}
                              </div>
                            )}
                          </div>
                          ) : null}
                          <div className="mt-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--portal-muted)]">Call notes</p>
                              {editingCallSummaryId !== call.id ? (
                                <button
                                  type="button"
                                  onClick={() => { setCallSummaryDraft(call.notes || ''); setEditingCallSummaryId(call.id) }}
                                  className="rounded-md px-2 py-1 text-[10px] font-semibold text-[#8c6529] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] dark:text-[#f1d27a]"
                                >
                                  {call.notes ? 'Edit summary' : 'Add summary'}
                                </button>
                              ) : null}
                            </div>
                            {editingCallSummaryId === call.id ? (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  aria-label="Call summary"
                                  value={callSummaryDraft}
                                  onChange={(event) => setCallSummaryDraft(event.target.value)}
                                  maxLength={2000}
                                  rows={3}
                                  placeholder="Note what the caller needs and the next follow-up step."
                                  className="w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"
                                />
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={() => { setEditingCallSummaryId(null); setCallSummaryDraft('') }} className="rounded-md px-3 py-1.5 text-xs font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">Cancel</button>
                                  <button type="button" disabled={savingCallSummaryId === call.id} onClick={() => void saveCallSummary(call.id)} className="rounded-md bg-[#caa24c] px-3 py-1.5 text-xs font-semibold text-[#211a13] disabled:cursor-not-allowed disabled:opacity-60">
                                    {savingCallSummaryId === call.id ? 'Saving…' : 'Save summary'}
                                  </button>
                                </div>
                              </div>
                            ) : call.notes ? (
                              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[color:var(--portal-text)]">{call.notes}</p>
                            ) : (
                              <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">Add the key details and next step after the call.</p>
                            )}
                          </div>
                          <Link href="/portal/calls" className="mt-2 inline-block text-[9px] font-black uppercase tracking-wider text-[#caa24c] hover:text-[#f1d27a]">Open call record →</Link>
                        </div>
                      )
                    }

                    if (entry.kind === 'email') {
                      const email = entry.email
                      const isOutgoing = email.direction === 'outgoing'
                      const emailSummary = compactActivityText(email.summary)

                      return (
                        <Link href={emailReaderUrl(email)} key={entry.id} className="relative block rounded-lg group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
                          <div className="absolute -left-[29px] top-[7px] z-10 h-2.5 w-2.5 rotate-45 border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] transition-all group-hover:border-[#caa24c] group-hover:bg-[color:color-mix(in_srgb,var(--portal-bg)_80%,#caa24c_20%)]" />
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                              {isOutgoing ? 'Luxor Event Space' : email.from || 'Unknown sender'}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
                                isOutgoing
                                  ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
                                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                              }`}>
                                {isOutgoing ? 'Outbound' : 'Inbound'}
                              </span>
                              <span className="text-[9px] font-mono text-zinc-600">{formatTimelineDate(entry.createdAt)}</span>
                            </div>
                          </div>
                          <p className="text-xs font-bold text-zinc-200">{decodeHtmlEntities(email.subject) || '(No subject)'}</p>
                          <p className="mt-1 text-[10px] text-zinc-600">
                            From {email.from || 'Unknown'} {email.to ? `to ${email.to}` : ''}
                          </p>
                          {emailSummary ? (
                            <p className="mt-2 whitespace-pre-wrap text-xs font-medium leading-relaxed text-zinc-300">{emailSummary}</p>
                          ) : null}
                          <span className="mt-2 inline-flex text-[9px] font-black uppercase tracking-wider text-[#caa24c]">Open full email →</span>
                        </Link>
                      )
                    }

                    const note = entry.note
                    const noteContent = compactActivityText(note.content)
                    let badgeColor = 'border-zinc-800/50 bg-zinc-800 text-zinc-400'
                    let typeLabel = 'System Log'
                    if (note.note_type === 'note') {
                      badgeColor = 'border-blue-500/20 bg-blue-500/10 text-blue-400'
                      typeLabel = 'Note'
                    } else if (note.note_type === 'call_log') {
                      badgeColor = 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      typeLabel = 'Call Log'
                    } else if (note.note_type === 'email_log') {
                      badgeColor = 'border-purple-500/20 bg-purple-500/10 text-purple-400'
                      typeLabel = 'Email'
                    } else if (note.note_type === 'status_change') {
                      badgeColor = 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                      typeLabel = 'Status'
                    }

                    return (
                      <div key={note.id} className="relative group">
                        <div className="absolute -left-[29px] top-[7px] z-10 h-2.5 w-2.5 rotate-45 border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] transition-all group-hover:border-[#caa24c] group-hover:bg-[color:color-mix(in_srgb,var(--portal-bg)_80%,#caa24c_20%)]" />
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{note.author}</span>
                          <div className="flex items-center gap-3">
                            <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${badgeColor}`}>
                              {typeLabel}
                            </span>
                            <span className="text-[9px] font-mono text-zinc-650">{new Date(note.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                        <p className="whitespace-pre-wrap text-xs font-medium leading-relaxed text-zinc-300">{noteContent}</p>
                      </div>
                    )
                  })}
                  {hiddenActivityCount > 0 ? (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setVisibleActivityCount((count) => count + ACTIVITY_BATCH_SIZE)}
                        className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#caa24c] transition-colors hover:border-[#caa24c]/25 hover:bg-[#caa24c]/10"
                      >
                        Show {Math.min(ACTIVITY_BATCH_SIZE, hiddenActivityCount)} more activity items
                      </button>
                      <p className="mt-2 text-center text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-600">
                        {hiddenActivityCount} more hidden to keep this tab smooth
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {/* Sidebar Panel Column */}
          <div className={`space-y-6 ${activeLeadTab === 'proposals' ? 'min-w-0' : ''} ${
            activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes'
              ? 'lg:sticky lg:top-20 lg:self-start'
              : ''
          }`}>
            {activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes' ? (
              <div className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter">
                <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                  <h3 className="flex items-center gap-2.5 font-semibold text-white/90">
                    <ClipboardCheck size={16} className="text-zinc-500" />
                    Recommended Actions
                  </h3>
                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">Top priority first</span>
                </div>
                <div className="grid gap-2.5">
                  {recommendedActions.map((action, index) => (
                    <ClientActionButton
                      key={`${action.label}-${index}`}
                      icon={action.icon}
                      label={action.label}
                      detail={action.detail}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      loading={action.loading}
                    />
                  ))}
                </div>
              </div>
            ) : null}

          {activeLeadTab === 'tasks' ? (
          <div id="lead-tasks" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <h3 className="flex items-center gap-2.5 font-semibold text-white/90">
                <Briefcase size={16} className="text-zinc-500" />
                Tasks & Checklist
              </h3>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-500">{pendingTaskCount} remaining</span>
                <button
                  type="button"
                  onClick={() => setShowTaskTools((current) => !current)}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:border-[#caa24c]/20 hover:bg-[#caa24c]/10 hover:text-[#f1d27a]"
                >
                  {showTaskTools ? 'Hide' : 'Open'}
                </button>
              </div>
            </div>

            {!showTaskTools ? (
              <div className="rounded-xl border border-dashed border-zinc-900/80 bg-zinc-950/35 px-4 py-4 text-xs leading-5 text-zinc-500">
                <p className="font-semibold text-zinc-300">
                  {pendingTaskCount === 0 ? 'No follow-up tasks right now.' : `${pendingTaskCount} pending task${pendingTaskCount === 1 ? '' : 's'} ready to review.`}
                </p>
                <p className="mt-1 text-zinc-600">Open the checklist when you need to add a follow-up, due date, or priority.</p>
              </div>
            ) : (
              <>
                <form onSubmit={handleAddTask} className="mb-6 space-y-3 rounded-lg border border-zinc-900 bg-zinc-950/50 p-3">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="New follow-up task..."
                    className="w-full rounded border border-zinc-900 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <PortalDatePicker
                      value={taskDueDate}
                      onChange={setTaskDueDate}
                      className="flex-1"
                      placeholder="Due Date"
                    />
                    <PortalSelect
                      value={taskPriority}
                      onChange={(val) => setTaskPriority(val as LuxorTask['priority'])}
                      options={[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                        { value: 'urgent', label: 'Urgent' },
                      ]}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingTask || !taskTitle.trim()}
                    className="w-full rounded bg-blue-600 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
                  >
                    Add Task
                  </button>
                </form>

                {sortedTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-900 px-4 py-5 text-xs leading-5 text-zinc-500">
                    <p className="font-semibold text-zinc-300">No follow-up tasks yet.</p>
                    <p className="mt-1 text-zinc-600">Add a task now so the next step does not get lost in the notes.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedTasks.map((task) => {
                      const isCompleted = task.status === 'completed'
                      const isHighlightedTask = searchParams?.get('highlightTask') === task.id
                      let prioColor = 'border-zinc-800 bg-zinc-500/5 text-zinc-500'
                      if (task.priority === 'high') prioColor = 'border-amber-500/10 bg-amber-500/5 text-amber-500'
                      else if (task.priority === 'urgent') prioColor = 'border-red-500/10 bg-red-500/5 text-red-500'

                      return (
                        <div
                          key={task.id}
                          className={`flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-zinc-800 ${
                            isHighlightedTask ? 'border-[#caa24c] bg-[#caa24c]/8 shadow-[0_0_0_1px_rgba(202,162,76,0.2)]' : 'border-zinc-900'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggleTask(task)}
                            className="mt-0.5 rounded p-0.5 text-zinc-500 transition-colors hover:text-blue-500"
                          >
                            {isCompleted ? (
                              <CheckCircle2 size={16} className="text-emerald-500" />
                            ) : (
                              <Circle size={16} className="text-zinc-700" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs font-bold leading-tight text-white/95 ${isCompleted ? 'font-medium text-zinc-600 line-through' : ''}`}>
                              {task.title}
                            </p>
                            {task.due_date ? (
                              <p className="mt-1 flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                                <Clock size={10} /> {new Date(task.due_date).toLocaleDateString()}
                              </p>
                            ) : (
                              <p className="mt-1 text-[10px] text-zinc-600">No due date</p>
                            )}
                          </div>
                          <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${prioColor}`}>
                            {task.priority}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          ) : null}

          {activeLeadTab === 'vendors' ? (
          <div id="lead-vendors" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <h3 className="flex items-center gap-2.5 font-semibold text-white/90">
                  <Briefcase size={16} className="text-zinc-500" />
                  Vendors
                </h3>
                <p className="mt-1 text-xs text-zinc-600">Track vendor options and notes for this event.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsVendorModalOpen(true)
                  void fetchVendors()
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/8 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] transition-colors hover:bg-[#caa24c]/12"
              >
                <Plus size={12} /> Add Vendor
              </button>
            </div>

            {linkedVendors.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setIsVendorModalOpen(true)
                  void fetchVendors()
                }}
                className="w-full rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/25 px-5 py-10 text-center transition-colors hover:border-[#caa24c]/35 hover:bg-[#caa24c]/5"
              >
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#caa24c]/20 bg-[#caa24c]/10 text-[#caa24c]">
                  <Plus size={18} />
                </span>
                <span className="mt-4 block text-xs font-black uppercase tracking-[0.2em] text-zinc-300">Add event vendors</span>
                <span className="mt-2 block text-xs leading-5 text-zinc-600">No vendors are linked yet. Add DJs, catering, decorators, photographers, or other vendor notes for this lead.</span>
              </button>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {linkedVendors.map(({ ref, vendor }) => (
                  <div key={ref.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[color:var(--portal-text)]">{vendor?.name || 'Vendor record unavailable'}</p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">{vendor?.vendor_type || 'Linked vendor'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleVendorSelection(ref.id)}
                        className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2 text-[10px] text-[color:var(--portal-muted)] sm:grid-cols-2">
                      <span>{vendor?.phone || 'No phone'}</span>
                      <span>{vendor?.email || 'No email'}</span>
                    </div>
                    <textarea
                      value={ref.notes || ''}
                      onChange={(event) => updateVendorNotes(ref.id, event.target.value)}
                      placeholder="Vendor notes for this event..."
                      className="mt-3 h-20 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs leading-5 text-[color:var(--portal-text)] outline-none transition-colors focus:border-[#caa24c]/40 placeholder-[color:var(--portal-muted)]"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          ) : null}

          {activeLeadTab === 'timeline' ? (
          <div id="lead-timeline" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <h3 className="flex items-center gap-2.5 font-semibold text-[color:var(--portal-text)]">
                  <Clock size={16} className="text-[#a8792f] dark:text-[#caa24c]" />
                  Event Timeline
                </h3>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Build the run of show without needing to advance the lead stage.</p>
              </div>
              <button
                type="button"
                onClick={() => openTimelineModal(null)}
                className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/40 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#a8792f] dark:text-[#f1d27a] transition-all hover:bg-[#caa24c]/20 cursor-pointer"
              >
                <Plus size={12} /> Add Step
              </button>
            </div>

            {timelineItems.length === 0 ? (
              <button
                type="button"
                onClick={() => openTimelineModal(null)}
                className="w-full rounded-2xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-5 py-10 text-center transition-colors hover:border-[#caa24c]/35 hover:bg-[#caa24c]/5 cursor-pointer"
              >
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c]">
                  <Plus size={18} />
                </span>
                <span className="mt-4 block text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Add timeline step</span>
                <span className="mt-2 block text-xs leading-5 text-[color:var(--portal-muted)]">No timeline steps are planned yet. Add setup, vendor arrivals, ceremony, dinner, breakdown, or custom event milestones.</span>
              </button>
            ) : (
              <div className="relative ml-3 space-y-4 border-l border-[color:var(--portal-border)] pl-6">
                {timelineItems.map(({ item, originalIndex }) => (
                  <div key={`${item.time}-${item.title}-${originalIndex}`} className="relative rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm">
                    <span className="absolute -left-[31px] top-5 flex h-3 w-3 rounded-full border border-[#caa24c] bg-[color:var(--portal-card)]" />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-black text-[#a8792f] dark:text-[#caa24c]">{item.time}</p>
                        <p className="mt-1 text-sm font-bold text-[color:var(--portal-text)]">{item.title}</p>
                        {item.description ? <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{item.description}</p> : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openTimelineModal(originalIndex)}
                          className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40 hover:text-[#a8792f] cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTimelineItem(originalIndex)}
                          className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          ) : null}

          {activeLeadTab === 'proposals' ? (
          <section id="lead-proposals" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            {isLuxorTestInquiry(lead) && activeTestRunId ? <LuxorTestLeadWorkflow leadName={lead.full_name} runId={activeTestRunId} section="proposals" onOpenProposal={() => openProposalBuilder()} /> : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2.5 font-semibold text-[color:var(--portal-text)]"><FileText size={16} className="text-[#a8792f] dark:text-[#caa24c]" /> Proposals</h3>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[color:var(--portal-muted)]">Each saved event proposal stays available here with its own quoted total and delivery status.</p>
              </div>
              <button type="button" onClick={() => openProposalBuilder()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-widest text-white shadow-md transition hover:bg-[#dfbd68]"><Plus size={14} /> Create New Proposal</button>
            </div>
            {clientProposals.length === 0 ? (
              isLuxorTestInquiry(lead) ? null : (
              <div className="mt-5 rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-5 text-xs leading-5 text-[color:var(--portal-muted)]">
                <p className="font-semibold text-[color:var(--portal-text)]">No proposals saved for this lead yet.</p>
                <p className="mt-1">Start a draft. It will appear here after it is saved.</p>
                <button type="button" onClick={() => openProposalBuilder()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#caa24c]/40 bg-[#caa24c]/10 px-4 text-[10px] font-black uppercase tracking-widest text-[#8c6529] dark:text-[#f1d27a]"><Plus size={13} /> Build proposal</button>
              </div>
              )
            ) : (
              <div className="mt-5 space-y-3">
                {clientProposals.map((proposal, proposalIndex) => {
                  const context = asProposalRecord(proposal.proposal_context) || {}
                  const selection = asProposalRecord(context.pricing_selection) || {}
                  const proposalEvent = findProposalLeadEvent(proposal, leadEvents, bookings)
                  const eventType = String(context.event_type || proposal.event_type || proposalEvent?.event_type || 'Event')
                  const date = String(context.event_date || context.eventDate || proposalEvent?.target_date || '')
                  const guestCount = asProposalNumber(context.expected_guest_count, context.expectedGuestCount, proposalEvent?.guest_count)
                  const period = String(context.rental_period || selection.rentalPeriod || 'Rental')
                  const custom = period === 'custom'
                  const rentalStart = String(context.rental_start_time || context.start_time || selection.rentalStartTime || selection.rental_start_time || '')
                  const rentalEnd = String(context.rental_end_time || context.end_time || selection.rentalEndTime || selection.rental_end_time || '')
                  const fixedWindow = String(context.event_access || '')
                  const nextDayEnd = custom && rentalEnd && Number(rentalEnd.slice(0, 2)) < 6
                  const shownPeriod = custom
                    ? `Custom time${rentalStart && rentalEnd ? ` · ${formatProposalClock(rentalStart)}-${formatProposalClock(rentalEnd)}${nextDayEnd ? ' (next day)' : ''}` : ''}`
                    : `${period.replaceAll('_', ' ')} rental${fixedWindow ? ` · ${fixedWindow}` : ''}`
                  const proposalContextRecord = asProposalRecord(proposal.proposal_context) || {}
                  const proposalDeliverySnapshot = asProposalRecord(proposalContextRecord.delivery_snapshot) || {}
                  const breakdownDelivery = asProposalRecord(proposalDeliverySnapshot.proposal_breakdown_email)
                  const individualProposalDelivery = asProposalRecord(proposalDeliverySnapshot.proposal_email)
                  const individualProposalSent = individualProposalDelivery?.delivery_state === 'delivered'
                  const breakdownAttemptId = typeof breakdownDelivery?.proposal_send_attempt_id === 'string' ? breakdownDelivery.proposal_send_attempt_id : null
                  const breakdownAttempt = breakdownAttemptId
                    ? (proposalHistory[proposal.id]?.sendAttempts || []).find((attempt) => attempt.id === breakdownAttemptId) || null
                    : null
                  const publicationAttempt = asProposalRecord(proposalContextRecord.publication_attempt)
                  const breakdownDeliveryStatus = breakdownDelivery?.delivery_state === 'delivered'
                    ? 'sent'
                    : breakdownAttempt?.state
                      || (publicationAttempt?.id === breakdownAttemptId ? String(publicationAttempt.state || 'preparing') : null)
                      || (breakdownDelivery ? 'status unavailable' : null)
                  const isProposalBreakdown = proposalContextRecord.proposal_record_type === 'proposal_breakdown' && !individualProposalSent
                  const hasProposalBreakdownEmail = Boolean(breakdownDelivery)
                  const proposalActivities = (proposalHistory[proposal.id]?.activities || []).filter((activity) => activity.invoice_id === proposal.id)
                  const proposalActivityTypes = new Set(proposalActivities.map((activity) => activity.event_type))
                  const proposalBooking = bookings.find((booking) => booking.invoice_id === proposal.id || booking.id === proposal.booking_id) || null
                  const acceptedActivity = proposalActivities.find((activity) => activity.event_type === 'accepted') || null
                  const hasSignedAgreement = Boolean(proposalBooking && (
                    proposalBooking.contract_status === 'signed'
                    || Boolean(proposalBooking.contract_signed_at)
                    || signatureRequests.some((signature) => signature.booking_id === proposalBooking.id && (signature.status === 'signed' || Boolean(signature.signed_at)))
                  ))
                  const latestView = proposal.proposal_latest_viewed_at || proposal.proposal_viewed_at || null
                  const latestSentAt = proposal.proposal_latest_sent_at || proposal.proposal_sent_at || (proposal.status === 'sent' ? proposal.updated_at : null)
                  const proposalHasBeenPublished = Boolean(proposal.proposal_sent_at || proposal.status === 'sent' || proposal.price_locked_at)
                  const hasActiveSend = (proposalHistory[proposal.id]?.sendAttempts || []).some((attempt) => ['preparing', 'sending', 'delivery_unconfirmed'].includes(attempt.state))
                  const proposalCardState = getProposalCardState({
                    invoice: proposal,
                    activities: proposalActivities,
                    hasSignedAgreement,
                    hasSupersedingProposal: clientProposals.some((candidate) => candidate.supersedes_invoice_id === proposal.id),
                    hasActiveSend,
                    proposalHistoryEnabled: proposalHistory[proposal.id]?.enabled === true,
                  })
                  const hasAcceptanceEvidence = proposalCardState.isAccepted
                  const lifecycleStatus = proposalCardState.label
                  const statusClass = lifecycleStatus === 'Accepted'
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : lifecycleStatus === 'Declined' || lifecycleStatus === 'Cancelled'
                      ? 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    : lifecycleStatus === 'Viewed'
                      ? 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                      : lifecycleStatus === 'Sent' || lifecycleStatus === 'Delivered'
                        ? 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                        : lifecycleStatus === 'Sending'
                          ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)]'
                  const proposalLabel = isProposalBreakdown
                    ? 'Proposal Breakdown'
                    : Number.isInteger(proposal.proposal_number) && Number(proposal.proposal_number) > 0
                      ? `Proposal${proposal.proposal_number === 1 ? '' : ` #${proposal.proposal_number}`}${proposal.supersedes_invoice_id ? ' · Revision' : ''}`
                      : proposalHasBeenPublished ? 'Existing proposal' : 'Draft proposal'
                  const proposalIdentifier = Number.isInteger(proposal.proposal_number) && Number(proposal.proposal_number) > 0
                    ? `#${proposal.proposal_number}`
                    : proposal.id
                  const savedPricing = getSavedProposalPricingSummary(proposal)
                  const shownTaxRate = savedPricing.taxRate * 100
                  const lineItems = savedPricing.lineItems
                  const invoiceSubtotal = savedPricing.subtotal
                  const proposalDiscount = savedPricing.discountAmount
                  const savedTaxAmount = savedPricing.taxAmount
                  const savedPackageName = savedPricing.packageName
                  const paymentPlan = savedPricing.paymentPlan
                  const paymentPlanLabel = paymentPlan?.mode === 'pay_in_full'
                    ? 'Pay in full'
                    : paymentPlan?.mode === 'deposit_and_balance'
                      ? `Deposit and balance${paymentPlan.final_payment_due_days_before_event !== undefined ? ` · final payment ${paymentPlan.final_payment_due_days_before_event} days before event` : ''}`
                      : 'Payment terms not recorded'
                  const paymentInvoices = proposalBooking
                    ? invoices.filter((invoice) => (invoice.booking_id === proposalBooking.id || invoice.parent_invoice_id === proposal.id) && invoice.invoice_kind !== 'event')
                    : invoices.filter((invoice) => invoice.parent_invoice_id === proposal.id && invoice.invoice_kind !== 'event')
                  const paidProposalPayments = proposalBooking
                    ? payments.filter((payment) => payment.status === 'paid' && (payment.booking_id === proposalBooking.id || paymentInvoices.some((invoice) => invoice.id === payment.invoice_id) || payment.invoice_id === proposal.id))
                    : []
                  const latestProposalPayment = [...paidProposalPayments].sort((a, b) => Date.parse(b.paid_at || b.updated_at) - Date.parse(a.paid_at || a.updated_at))[0]
                  const paidPaymentInvoice = paymentInvoices.find((invoice) => invoice.status === 'paid')
                  const proposalMilestones: Array<[string, string, string | null, string]> = [
                    ['sent', isProposalBreakdown ? 'Proposal Breakdown email sent' : 'Proposal sent', isProposalBreakdown ? (typeof breakdownDelivery?.delivery_sent_at === 'string' ? breakdownDelivery.delivery_sent_at : null) : latestSentAt, 'Not sent yet'],
                    ['viewed', 'Proposal viewed', latestView, 'Not yet viewed'],
                    ['accepted', 'Proposal accepted', proposal.proposal_accepted_at || acceptedActivity?.occurred_at || null, hasAcceptanceEvidence && !proposal.proposal_accepted_at && !acceptedActivity ? 'Signed agreement recorded; acceptance timestamp unavailable' : hasAcceptanceEvidence && !proposal.proposal_accepted_at ? 'Acceptance recorded in proposal history' : 'Not yet accepted'],
                    ['agreement', 'Agreement signed', proposalBooking?.contract_status === 'signed' ? proposalBooking.contract_signed_at || proposalBooking.updated_at : null, proposalBooking?.contract_status === 'viewed' ? 'Opened; awaiting signature' : 'Not yet signed'],
                    ['invoice', 'Payment invoice created', paymentInvoices[0]?.created_at || null, 'Not yet created'],
                    ['payment', 'Payment received', latestProposalPayment?.paid_at || paidPaymentInvoice?.paid_at || null, 'Not yet received'],
                  ]
                  const showProposalHistory = () => {
                    const history = document.getElementById(`proposal-history-${proposal.id}`) as HTMLDetailsElement | null
                    if (history) history.open = true
                    window.requestAnimationFrame(() => {
                      (history || document.getElementById(`proposal-activity-${proposal.id}`))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    })
                  }
                  return <article key={proposal.id} className="min-w-0 overflow-visible rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
                    <details open={proposalIndex === 0} className="group">
                      <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/50 sm:px-5 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8c6529] dark:text-[#f1d27a]">{proposalLabel}</span>
                            <span className="rounded border border-[color:var(--portal-border)] px-2 py-0.5 font-mono text-[9px] text-[color:var(--portal-muted)]" title={`Proposal ID ${proposal.id}`}>ID {proposalIdentifier}</span>
                            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusClass}`}>{lifecycleStatus}</span>
                          </span>
                          <span className="mt-1 block truncate text-sm font-bold text-[color:var(--portal-text)]">{proposal.description || `${proposal.event_type || 'Event'} proposal`}</span>
                          <span className="mt-1 block truncate text-[10px] text-[color:var(--portal-muted)]">{eventType}{date ? ` · ${formatDisplayDate(date)}` : ' · Event date not set'}{guestCount ? ` · ${guestCount} guests` : ''}</span>
                          <span className="mt-1 block text-[9px] text-[color:var(--portal-muted)]">Created {formatVenueDateTime(proposal.created_at)} · Expires {proposal.offer_expires_at ? formatVenueDateTime(proposal.offer_expires_at) : 'No expiry set'}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="text-right"><span className="block font-mono text-sm font-bold text-[color:var(--portal-text)]">{formatMoney(proposal.total)}</span><span className="mt-1 block text-[9px] text-[color:var(--portal-muted)]">{latestSentAt ? `Sent ${formatVenueDateTime(latestSentAt)}` : 'Created draft'}</span></span>
                          <ChevronDown size={14} aria-hidden="true" className="text-[color:var(--portal-muted)] transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="border-t border-[color:var(--portal-border)] p-4 sm:p-5">
                    <p className="text-[11px] capitalize text-[color:var(--portal-muted)]">{shownPeriod}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[10px] sm:grid-cols-3 xl:grid-cols-5">
                      <div><dt className="text-[color:var(--portal-muted)]">Created</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{formatVenueDateTime(proposal.created_at)}</dd></div>
                      <div><dt className="text-[color:var(--portal-muted)]">Last sent</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{latestSentAt ? formatVenueDateTime(latestSentAt) : 'Not sent yet'}</dd></div>
                      <div><dt className="text-[color:var(--portal-muted)]">Last viewed</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{latestView ? formatVenueDateTime(latestView) : 'Not viewed'}</dd></div>
                      <div><dt className="text-[color:var(--portal-muted)]">Expires</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{proposal.offer_expires_at ? formatVenueDateTime(proposal.offer_expires_at) : 'No expiry set'}</dd></div>
                      <div><dt className="text-[color:var(--portal-muted)]">Last modified</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{formatVenueDateTime(proposal.updated_at || proposal.created_at)}</dd></div>
                    </dl>
                    <dl className="mt-3 grid gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[10px] sm:grid-cols-2">
                      <div><dt className="text-[color:var(--portal-muted)]">Saved package</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{savedPackageName}</dd></div>
                      <div><dt className="text-[color:var(--portal-muted)]">Saved payment plan</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{paymentPlanLabel}</dd></div>
                      {savedPricing.amountDueToBook !== null ? <div><dt className="text-[color:var(--portal-muted)]">Due to book</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{formatMoney(savedPricing.amountDueToBook)}</dd></div> : null}
                    </dl>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <section className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3" aria-label="Proposal details">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Proposal details</h4>
                        {lineItems.length ? <ul className="mt-2 divide-y divide-[color:var(--portal-border)] text-[10px]">
                          {lineItems.map((item, index) => <li key={`${proposal.id}-line-${index}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"><span className="min-w-0 text-[color:var(--portal-muted)]"><span className="block">{item.description || 'Service'}{Number(item.quantity) > 1 ? ` × ${item.quantity}` : ''}</span>{item.quoteBreakdown ? <span className="mt-0.5 block text-[9px]">{formatProposalLineBasis(item)}</span> : null}{item.detail ? <span className="mt-0.5 block text-[9px] leading-4">{item.detail}</span> : null}</span><span className="shrink-0 font-medium text-[color:var(--portal-text)]">{formatMoney(item.total)}</span></li>)}
                        </ul> : <p className="mt-2 text-[10px] text-[color:var(--portal-muted)]">No itemized services are saved on this proposal.</p>}
                        <dl className="mt-3 space-y-1.5 border-t border-[color:var(--portal-border)] pt-3 text-[10px]">
                          <div className="flex justify-between gap-3"><dt className="text-[color:var(--portal-muted)]">Subtotal</dt><dd className="text-[color:var(--portal-text)]">{formatMoney(invoiceSubtotal)}</dd></div>
                          {proposalDiscount > 0 ? <div className="flex justify-between gap-3"><dt className="text-[color:var(--portal-muted)]">Discount</dt><dd className="text-[color:var(--portal-text)]">−{formatMoney(proposalDiscount)}</dd></div> : null}
                          {shownTaxRate > 0 || savedTaxAmount !== null ? <div className="flex justify-between gap-3"><dt className="text-[color:var(--portal-muted)]">Sales tax{shownTaxRate > 0 ? ` (${shownTaxRate.toFixed(2)}%)` : ''}</dt><dd className="text-[color:var(--portal-text)]">{savedTaxAmount === null ? 'Saved amount unavailable' : formatMoney(savedTaxAmount)}</dd></div> : null}
                          <div className="flex justify-between gap-3 border-t border-[color:var(--portal-border)] pt-2 font-bold"><dt className="text-[color:var(--portal-text)]">Total proposal amount</dt><dd className="text-[color:var(--portal-text)]">{formatMoney(proposal.total)}</dd></div>
                        </dl>
                      </section>
                      <section id={`proposal-activity-${proposal.id}`} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 scroll-mt-24" aria-label="Proposal activity">
                        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Delivery & activity</h4><div className="flex items-center gap-2"><span className="text-[9px] text-[color:var(--portal-muted)]">{proposalActivityTypes.size} events</span><button type="button" onClick={showProposalHistory} className="min-h-9 rounded-md border border-[color:var(--portal-border)] px-2.5 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-text)] hover:border-[#caa24c]/50">View activity</button></div></div>
                        {hasProposalBreakdownEmail ? <div className="mt-3 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-[10px]">
                          <p className="font-semibold capitalize text-[color:var(--portal-text)]">Proposal Breakdown email · {(breakdownDeliveryStatus || 'not sent').replaceAll('_', ' ')}</p>
                          <p className="mt-1 text-[color:var(--portal-muted)]">
                            {typeof breakdownDelivery?.recipient_email === 'string' ? `${breakdownDelivery.recipient_email} · ` : ''}
                            {typeof breakdownDelivery?.delivery_sent_at === 'string'
                              ? `Sent ${formatVenueDateTime(breakdownDelivery.delivery_sent_at)}`
                              : breakdownAttempt?.started_at ? `Started ${formatVenueDateTime(breakdownAttempt.started_at)}` : 'No email has been sent.'}
                          </p>
                          {breakdownAttempt?.failure_reason ? <p className="mt-1 text-red-700 dark:text-red-300">{breakdownAttempt.failure_reason}</p> : null}
                        </div> : null}
                        <ol className="mt-2 space-y-2 border-l border-[color:var(--portal-border)] pl-3 text-[10px]">
                          {proposalMilestones.map(([key, label, occurredAt, emptyText]) => <li key={key} className="relative"><span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"/><p className="font-semibold text-[color:var(--portal-text)]">{label}</p><p className="mt-0.5 text-[color:var(--portal-muted)]">{occurredAt ? formatVenueDateTime(occurredAt) : emptyText}</p></li>)}
                        </ol>
                      </section>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => openProposalDeliveryPreview(proposal)} disabled={isProposalBreakdown && typeof breakdownDelivery?.html !== 'string'} title={isProposalBreakdown && typeof breakdownDelivery?.html !== 'string' ? 'Send the breakdown email before it can be reviewed here.' : undefined} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] disabled:cursor-not-allowed disabled:opacity-45"><Eye size={12} /> {isProposalBreakdown ? 'View breakdown email' : 'View proposal'}</button>
                      {proposalCardState.canResend ? <button type="button" onClick={() => {
                        if (isProposalBreakdown && !individualProposalSent) void handleSendFinalProposal(proposal, false, false)
                        else void handleSendFinalProposal(proposal, false, true)
                      }} disabled={!lead.email || sendingInvoiceId === proposal.id} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] disabled:opacity-40"><Send size={12} /> {sendingInvoiceId === proposal.id ? 'Sending…' : isProposalBreakdown ? individualProposalSent ? 'Resend individual proposal' : 'Send individual proposal' : 'Resend proposal'}</button> : null}
                      {proposalCardState.canDuplicate ? <button type="button" onClick={() => duplicateProposalDraft(proposal)} aria-label={`Duplicate ${proposalLabel} to a new draft`} title="Starts a new draft from these saved event selections. Review the current price and discount before saving." className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]"><Copy size={12} /> Duplicate</button> : null}
                      {proposalCardState.canEditDraft || proposalCardState.canRevise ? <button type="button" onClick={() => openProposalBuilder(proposal)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#8c6529] dark:text-[#f1d27a]"><FileText size={12} /> {proposalCardState.canRevise ? 'Revise proposal' : 'Edit draft'}</button> : null}
                      <div className="relative">
                        <button type="button" aria-haspopup="menu" aria-controls={`proposal-menu-${proposal.id}`} aria-expanded={proposalCardMenuId === proposal.id} onClick={(event) => { proposalCardMenuTriggerRef.current = event.currentTarget; setProposalCardMenuId((openId) => openId === proposal.id ? null : proposal.id) }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]"><MoreVertical size={12} /> More</button>
                        {proposalCardMenuId === proposal.id ? <div id={`proposal-menu-${proposal.id}`} ref={proposalCardMenuRef} role="menu" aria-label={`${proposalLabel} actions`} onKeyDown={(event) => {
                          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
                            const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
                            const currentIndex = items.indexOf(document.activeElement as HTMLElement)
                            const nextIndex = event.key === 'Home' ? 0
                              : event.key === 'End' ? items.length - 1
                                : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                            event.preventDefault()
                            items[nextIndex]?.focus()
                          } else if (event.key === 'Tab') {
                            window.setTimeout(() => setProposalCardMenuId(null), 0)
                          }
                        }} className="absolute right-0 z-20 mt-1 min-w-48 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1 shadow-xl">
                          <button type="button" tabIndex={-1} role="menuitem" onClick={() => { setProposalCardMenuId(null); showProposalHistory() }} className="block min-h-10 w-full rounded-md px-3 text-left text-[10px] font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">View activity</button>
                          {proposalCardState.canDuplicate ? <button type="button" tabIndex={-1} role="menuitem" onClick={() => { setProposalCardMenuId(null); duplicateProposalDraft(proposal) }} className="block min-h-10 w-full rounded-md px-3 text-left text-[10px] font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">Duplicate proposal</button> : null}
                          {proposalCardState.canEditDraft || proposalCardState.canRevise ? <button type="button" tabIndex={-1} role="menuitem" onClick={() => { setProposalCardMenuId(null); openProposalBuilder(proposal) }} className="block min-h-10 w-full rounded-md px-3 text-left text-[10px] font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">{proposalCardState.canRevise ? 'Revise proposal' : 'Edit draft'}</button> : null}
                        </div> : null}
                      </div>
                    </div>
                    {proposalHistory[proposal.id]?.enabled ? <details id={`proposal-history-${proposal.id}`} className="mt-4 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
                      <summary className="min-h-11 cursor-pointer px-3 py-3 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Proposal activity and send history</summary>
                      <div className="space-y-3 border-t border-[color:var(--portal-border)] px-3 py-3">
                        {proposalHistory[proposal.id].sendAttempts.map((attempt) => <div key={attempt.id} className="rounded-md bg-[color:var(--portal-soft)] px-3 py-2 text-[10px]">
                          <p className="font-semibold capitalize text-[color:var(--portal-text)]">{attempt.id === breakdownAttemptId ? 'Proposal Breakdown email' : attempt.channel === 'email' ? 'Email' : 'In-person handoff'} {attempt.state.replaceAll('_', ' ')}{attempt.recipient_email ? ` · ${attempt.recipient_email}` : ''}</p>
                          <p className="mt-1 text-[color:var(--portal-muted)]">Started {formatVenueDateTime(attempt.started_at)}{attempt.sent_at ? ` · Sent ${formatVenueDateTime(attempt.sent_at)}` : ''}{attempt.delivery_confirmed_at ? ` · Delivered ${formatVenueDateTime(attempt.delivery_confirmed_at)}` : ''}</p>
                          {attempt.failure_reason ? <p className="mt-1 text-red-700 dark:text-red-300">{attempt.failure_reason}</p> : null}
                        </div>)}
                        {proposalHistory[proposal.id].activities.map((activity) => <div key={activity.id} className="flex flex-col gap-0.5 text-[10px] sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <p className="capitalize text-[color:var(--portal-text)]">{activity.event_type.replaceAll('_', ' ')}{activity.recipient_email ? ` · ${activity.recipient_email}` : ''}</p>
                          <time className="shrink-0 text-[color:var(--portal-muted)]">{formatVenueDateTime(activity.occurred_at)}</time>
                        </div>)}
                        {proposalHistory[proposal.id].hasMoreActivities || proposalHistory[proposal.id].hasMoreSendAttempts ? <button type="button" onClick={() => void loadOlderProposalHistory(proposal.id)} disabled={proposalHistoryLoadingId !== null} className="min-h-10 rounded-md border border-[color:var(--portal-border)] px-3 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-text)] disabled:opacity-50">{proposalHistoryLoadingId === proposal.id ? 'Loading history…' : 'Load older history'}</button> : null}
                        {!proposalHistory[proposal.id].activities.length && !proposalHistory[proposal.id].sendAttempts.length ? <p className="text-[10px] text-[color:var(--portal-muted)]">No proposal activity recorded yet.</p> : null}
                      </div>
                    </details> : null}
                      </div>
                    </details>
                  </article>
                })}
              </div>
            )}
            {process.env.NEXT_PUBLIC_LUXOR_PROPOSAL_HISTORY_READY !== 'true' ? <p className="mt-4 text-[10px] leading-4 text-[color:var(--portal-muted)]">Proposal sequence numbers and complete send history remain disabled until the reviewed database migration is applied.</p> : null}
            {process.env.NEXT_PUBLIC_LUXOR_PROPOSAL_HISTORY_READY === 'true' && clientProposals.some((proposal) => proposalHistory[proposal.id]?.enabled === false) ? <p role="status" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">Proposal history is unavailable until its database migration is applied. Existing proposals remain available.</p> : null}
          </section>
          ) : null}

          {activeLeadTab === 'documents' || activeLeadTab === 'contract' ? (
          <div id="lead-documents" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2.5 font-semibold text-[color:var(--portal-text)]"><FileText size={16} className="text-[#a8792f] dark:text-[#caa24c]" /> PDF library</h3>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[color:var(--portal-muted)]">Preview the final proposal, agreement, and signed contract saved for this lead. These files are private to the owner portal.</p>
              </div>
              <span className="font-mono text-xs text-[color:var(--portal-muted)]">{isLuxorTestInquiry(lead) ? 'Run-scoped test files' : `${documents.length + signatureRequests.length} files`}</span>
            </div>
            {isLuxorTestInquiry(lead) ? activeTestRunId ? <LuxorTestLeadWorkflow leadName={lead.full_name} runId={activeTestRunId} section="documents" onOpenProposal={() => openProposalBuilder()} /> : <p className="mt-5 text-xs text-[color:var(--portal-muted)]">Loading the isolated Test Lead run…</p> : documents.length === 0 && signatureRequests.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-5 text-xs leading-5 text-[color:var(--portal-muted)]">PDFs will appear here after a final proposal or agreement is generated.</div>
            ) : (
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {documents.map((document) => {
                  const label = document.document_type === 'proposal' ? 'Final Proposal PDF' : document.document_type.replaceAll('_', ' ')
                  const url = `/api/documents/${encodeURIComponent(document.id)}/pdf`
                  return <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                    <div className="min-w-0"><p className="truncate text-xs font-bold capitalize text-[color:var(--portal-text)]">{label}</p><p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{document.file_name}</p></div>
                    <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => setDocumentPreview({ title: label, url })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#8c6529] dark:text-[#f1d27a]"><Eye size={12} /> Preview</button><a href={url} download={document.file_name} className="inline-flex items-center rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Download</a></div>
                  </div>
                })}
                {signatureRequests.map((signature) => {
                  const signed = signature.status === 'signed' || Boolean(signature.signed_at)
                  const title = signed ? 'Executed agreement' : 'Agreement PDF'
                  const url = `/api/signatures/${encodeURIComponent(signature.id)}/document?kind=${signed ? 'executed' : 'contract'}`
                  return <div key={signature.id} className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                    <div className="min-w-0"><p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{title}</p><p className="mt-1 truncate text-[10px] capitalize text-[color:var(--portal-muted)]">{signature.status.replaceAll('_', ' ')}{signature.signed_at ? ` • ${formatDisplayDate(signature.signed_at)}` : ''}</p></div>
                    <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => setDocumentPreview({ title, url })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#8c6529] dark:text-[#f1d27a]"><Eye size={12} /> Preview</button><a href={url} download className="inline-flex items-center rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Download</a></div>
                  </div>
                })}
              </div>
            )}
          </div>
          ) : null}

          {activeLeadTab === 'documents' || activeLeadTab === 'contract' ? (
          <div id="lead-booking" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <h3 className="mb-6 flex items-center justify-between font-semibold text-[color:var(--portal-text)]">
              <span className="flex items-center gap-2.5">
                <FileSignature size={16} className="text-[#a8792f] dark:text-[#caa24c]" />
                Booking & Contract
              </span>
              <span className="font-mono text-xs text-[color:var(--portal-muted)]">{isLuxorTestInquiry(lead) ? 'Isolated test run' : `${sortedBookings.length} records`}</span>
            </h3>

            {isLuxorTestInquiry(lead) ? activeTestRunId ? <LuxorTestLeadWorkflow leadName={lead.full_name} runId={activeTestRunId} section="contract" onOpenProposal={() => openProposalBuilder()} /> : <p className="text-xs text-[color:var(--portal-muted)]">Loading the isolated Test Lead run…</p> : (
            <>
            {proposalInvoice && !agreementBooking ? (
              <div className="mb-4 rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/5 p-4 text-xs leading-5 text-[color:var(--portal-muted)]">
                <p className="font-semibold text-[color:var(--portal-text)]">Current proposal agreement</p>
                <p className="mt-1">{proposalAcceptedAt ? 'The client accepted this proposal, but its matching agreement record is not confirmed yet.' : 'This proposal is still waiting for the client to accept it before an agreement can be prepared.'}</p>
                {proposalAcceptedAt ? (
                  <button type="button" onClick={() => handlePrepareAgreement(proposalInvoice)} disabled={preparingAgreementInvoiceId === proposalInvoice.id} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#caa24c] px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#dfbd68] disabled:opacity-45">
                    {preparingAgreementInvoiceId === proposalInvoice.id ? <Loader2 size={12} className="animate-spin" /> : <FileSignature size={12} />}
                    {preparingAgreementInvoiceId === proposalInvoice.id ? 'Preparing…' : 'Prepare agreement'}
                  </button>
                ) : (
                  <button type="button" onClick={() => openProposalBuilder(proposalInvoice)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#caa24c]/40 bg-[#caa24c]/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-[#8c6529] transition-colors hover:bg-[#caa24c]/20 dark:text-[#f1d27a]">
                    <Pencil size={12} /> Edit proposal
                  </button>
                )}
              </div>
            ) : null}

            {sortedBookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-5 text-xs leading-5 text-[color:var(--portal-muted)]">
                <p className="font-semibold text-[color:var(--portal-text)]">{proposalInvoice ? 'No current agreement record is linked yet.' : 'No booking record is linked yet.'}</p>
                <p className="mt-1 text-[color:var(--portal-muted)]">{proposalInvoice ? proposalAcceptedAt ? 'Prepare the matching agreement for this accepted proposal. It will appear here after delivery begins.' : 'The client must accept this locked proposal before Luxor prepares the matching agreement.' : 'The booking is created automatically once the client accepts the locked final proposal. That keeps the agreement and payment schedule aligned with the selected package.'}</p>
                <button
                  type="button"
                  onClick={() => proposalInvoice ? proposalAcceptedAt ? handlePrepareAgreement(proposalInvoice) : openProposalBuilder(proposalInvoice) : openProposalBuilder()}
                  disabled={Boolean(proposalInvoice && proposalAcceptedAt && preparingAgreementInvoiceId === proposalInvoice.id)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#caa24c]/40 bg-[#caa24c]/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-[#a8792f] dark:text-[#f1d27a] transition-all hover:bg-[#caa24c]/20 cursor-pointer"
                >
                  {proposalInvoice ? proposalAcceptedAt ? 'Prepare agreement' : 'Edit proposal' : 'Build proposal'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedBookings.map((booking, index) => (
                  <div key={booking.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">
                          {booking.id === agreementBooking?.id ? 'Current proposal booking' : 'Earlier booking'}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[color:var(--portal-text)]">{booking.event_date || 'Event date TBD'}</p>
                        <p className="mt-1 text-[10px] text-[color:var(--portal-muted)] font-medium">
                          {(booking.package_name || 'No package').replaceAll('_', ' ')} • {(booking.contract_status || 'not_sent').replaceAll('_', ' ')}
                        </p>
                      </div>
                      <PortalStatusBadge status={booking.status} />
                    </div>
                    <WeekdayRentalSummary booking={booking} />
                    <div className="mt-3 grid gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-[10px] sm:grid-cols-3">
                      <div>
                        <span className="block text-[color:var(--portal-muted)]">Contract total</span>
                        <span className="font-mono font-bold text-[color:var(--portal-text)]">${Number(booking.contract_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="block text-[color:var(--portal-muted)]">Deposit required</span>
                        <span className="font-mono font-bold text-[color:var(--portal-text)]">${Number(booking.deposit_required || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="block text-[color:var(--portal-muted)]">Contract status</span>
                        <span className="font-mono font-bold text-[color:var(--portal-text)]">{(booking.contract_status || 'not_sent').replaceAll('_', ' ')}</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => previewContractPdf(booking)}
                        disabled={contractActionKey === `preview-${booking.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/35 bg-[#caa24c]/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-[#a8792f] dark:text-[#f1d27a] transition-all hover:bg-[#caa24c]/20 disabled:opacity-45 cursor-pointer"
                      >
                        <Eye size={12} /> {contractActionKey === `preview-${booking.id}` ? 'Preparing preview…' : 'Preview agreement'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const bookingProposal = sortedInvoices.find((invoice) => invoice.id === booking.invoice_id) || null
                          const isCurrentProposalBooking = booking.id === agreementBooking?.id
                          const canReviewAgreement = booking.contract_status === 'signed' || ((!isCurrentProposalBooking || agreementDeliveryConfirmed) && (booking.contract_status === 'sent' || booking.contract_status === 'viewed'))
                          if (canReviewAgreement) {
                            void openContractReview(booking)
                          } else if (bookingProposal?.proposal_accepted_at) {
                            void handlePrepareAgreement(bookingProposal)
                          } else if (bookingProposal) {
                            openProposalBuilder(bookingProposal)
                          } else {
                            openProposalBuilder()
                          }
                        }}
                        disabled={booking.contract_status === 'signed' || updatingStatus || (booking.id === agreementBooking?.id && agreementDeliveryPending)}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/40 bg-[#caa24c]/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-[#a8792f] dark:text-[#f1d27a] transition-all hover:bg-[#caa24c]/20 disabled:opacity-45 cursor-pointer"
                      >
                        {booking.contract_status === 'signed' ? 'Contract Signed' : ((booking.id !== agreementBooking?.id || agreementDeliveryConfirmed) && (booking.contract_status === 'sent' || booking.contract_status === 'viewed')) ? 'Review Signing Status' : (() => {
                          const bookingProposal = sortedInvoices.find((invoice) => invoice.id === booking.invoice_id) || null
                          return bookingProposal?.proposal_accepted_at ? (booking.id === agreementBooking?.id && agreementDeliveryPending ? 'Agreement Pending' : 'Prepare Agreement') : bookingProposal ? 'Edit Proposal' : 'Build Proposal'
                        })()}
                      </button>
                      {booking.contract_status === 'sent' || booking.contract_status === 'viewed' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleContractRequestAction(booking, 'resend')}
                            disabled={updatingStatus}
                            className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40 hover:text-[#a8792f] disabled:opacity-45 dark:hover:text-[#f1d27a]"
                          >
                            <RefreshCw size={12} className={contractActionKey === `resend-${booking.id}` ? 'animate-spin' : ''} /> Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => setContractToCancel(booking)}
                            disabled={updatingStatus}
                            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 transition-colors hover:bg-rose-500/10 disabled:opacity-45 dark:text-rose-300"
                          >
                            <Trash2 size={12} /> Cancel
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => proposalInvoice ? openProposalDeliveryPreview(proposalInvoice, 'pdf') : openProposalBuilder()}
                        className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40 hover:text-[#a8792f] dark:hover:text-[#f1d27a] cursor-pointer"
                      >
                        {proposalInvoice ? 'Preview Locked Proposal' : 'Build Final Proposal'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>
            )}
          </div>
          ) : null}

          {activeLeadTab === 'documents' || activeLeadTab === 'payments' ? (
          <div id="lead-billing" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            {activeLeadTab === 'payments' && isLuxorTestInquiry(lead) && activeTestRunId ? <LuxorTestLeadWorkflow leadName={lead.full_name} runId={activeTestRunId} section="payments" onOpenProposal={() => openProposalBuilder()} /> : null}
            <h3 className="mb-6 flex items-center justify-between font-semibold text-white/90">
              <span className="flex items-center gap-2.5">
                <FileText size={16} className="text-zinc-500" />
                Invoices & Revenue
              </span>
              <button
                onClick={() => openProposalBuilder()}
                className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-500 transition-colors hover:text-blue-400"
              >
                <Plus size={12} /> New Invoice
              </button>
            </h3>

            {sortedInvoices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-xs leading-5 text-zinc-500">
                <p className="font-semibold text-zinc-300">No invoice records generated yet.</p>
                <p className="mt-1 text-zinc-600">Draft the deposit or event invoice when the numbers are ready.</p>
                <button
                  type="button"
                  onClick={() => openProposalBuilder()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-300 transition-colors hover:bg-blue-500/15"
                >
                  Draft Invoice
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedInvoices.map((inv, index) => {
                  const reminderBooking = bookings.find((booking) => booking.id === inv.booking_id || booking.invoice_id === inv.parent_invoice_id || booking.invoice_id === inv.id) || null
                  const reminderDueDate = getLuxorPaymentReminderDueDate({ invoice_kind: inv.invoice_kind, due_date: inv.due_date, final_payment_due_date: reminderBooking?.final_payment_due_date })
                  return <div key={inv.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold text-[color:var(--portal-text)]">{inv.description || `${inv.event_type || 'Event'} proposal`}</p>
                        <p className="mt-1 text-[9px] font-mono uppercase tracking-widest text-[color:var(--portal-muted)]">Invoice {inv.id.slice(0, 8).toUpperCase()}</p>
                        <p className="mt-2 text-sm font-mono font-bold text-[color:var(--portal-text)]">${inv.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">
                          {index === 0 ? 'Latest invoice' : 'Invoice record'}
                          {inv.due_date ? ` • Due ${new Date(inv.due_date).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <PortalStatusBadge status={inv.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-[10px]">
                      <div><span className="block text-[color:var(--portal-muted)]">Paid</span><span className="font-mono text-emerald-700 dark:text-emerald-400">{formatMoney(getInvoicePaidTotal(inv.id))}</span></div>
                      <div><span className="block text-[color:var(--portal-muted)]">Balance due</span><span className="font-mono text-[color:var(--portal-text)]">{formatMoney(getInvoiceBalance(inv))}</span></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setPdfPreviewInvoice(inv)} className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40">
                        <Eye size={12} /> View PDF
                      </button>
                      {inv.invoice_kind === 'event' ? (
                        <button type="button" onClick={() => openProposalDeliveryPreview(inv)} className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40 hover:text-[#8c6529] dark:hover:text-[#f1d27a]">
                          <Eye size={12} /> Preview delivery
                        </button>
                      ) : (
                        <button type="button" onClick={() => void previewInvoiceEmail(inv)} className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40">
                          <Mail size={12} /> Preview email
                        </button>
                      )}
                      <a href={`/api/invoices/${inv.id}/pdf`} className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/40">
                        <FileText size={12} /> Download PDF
                      </a>
                      <button type="button" onClick={() => openPaymentRequest(inv)} disabled={sendingInvoiceId === inv.id || !lead.email || getInvoiceBalance(inv) <= 0 || (inv.invoice_kind !== 'deposit' && inv.invoice_kind !== 'final_balance') || reminderBooking?.contract_status !== 'signed'} className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] disabled:opacity-40">
                        <Send size={12} /> {sendingInvoiceId === inv.id ? 'Sending...' : getInvoiceBalance(inv) <= 0 ? 'Paid in full' : 'Send payment request'}
                      </button>
                      {['deposit', 'final_balance', 'security_deposit'].includes(inv.invoice_kind || '') ? <button type="button" onClick={() => handleSendAiInvoiceReminder(inv)} disabled={sendingReminderId === inv.id || !lead.email || getInvoiceBalance(inv) <= 0 || !reminderDueDate} title={!reminderDueDate ? 'A saved payment due date is required before a reminder can be sent.' : `Payment due ${formatDisplayDate(reminderDueDate)}`} className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-purple-300 transition-colors hover:bg-purple-500/20 disabled:opacity-40 cursor-pointer">
                        <Sparkles size={12} /> {sendingReminderId === inv.id ? 'Sending AI Email...' : reminderDueDate ? `Send reminder · Due ${formatDisplayDate(reminderDueDate)}` : 'Set due date to remind'}
                      </button> : null}
                      <button type="button" onClick={() => setInvoiceToDelete(inv)} disabled={getInvoicePaidTotal(inv.id) > 0 || inv.status === 'paid'} className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35 dark:text-red-300">
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                })}
              </div>
            )}
          </div>
          ) : null}
        </div>
      </div>
      )}

      {typeof document !== 'undefined' ? createPortal(
        <LeadMobileActionBar
          phoneAvailable={Boolean(lead.phone)}
          onCall={() => lead.phone && startLuxorBrowserCall({ phoneNumber: lead.phone, contactName: lead.full_name, inquiryId: lead.id })}
          onText={() => {
            window.dispatchEvent(
              new CustomEvent('luxor-open-text', {
                detail: { inquiryId: lead.id, phone: lead.phone, contactName: lead.full_name },
              })
            )
          }}
          emailAvailable={Boolean(lead.email)}
          onEmail={() => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: {
            lead,
            purpose: 'inquiry-response',
            initialSubject: `Your ${lead.event_type?.trim() || 'event'} inquiry at Luxor`,
          } }))}
        />,
        document.body
      ) : null}

      <AnimatePresence>
        {textPopupOpen && lead.phone ? <LuxorThreadPopup inquiryId={lead.id} phone={lead.phone} contactName={lead.full_name} onClose={() => setTextPopupOpen(false)} /> : null}
      </AnimatePresence>

      <LeadLifecycleActionSheet
        lead={lead}
        action={leadLifecycleAction}
        onClose={() => setLeadLifecycleAction(null)}
        onCompleted={({ lead: updatedLead, calendarWarning }) => {
          setLead(updatedLead)
          setLeadLifecycleAction(null)
          notify({
            title: leadLifecycleAction === 'archive' ? 'Lead archived' : 'Tour cancelled',
            description: leadLifecycleAction === 'archive'
              ? 'The lead’s history is preserved in Archived Leads.'
              : 'The tour slot and pending reminders have been released.',
            variant: 'success',
          })
          if (calendarWarning) {
            notify({
              title: 'Calendar invite still needs attention',
              description: calendarWarning,
              variant: 'warning',
              durationMs: 0,
            })
          }
          void fetchAllData(false)
        }}
      />

      <CorrectEmailResendDialog
        isOpen={correctEmailResendOpen}
        leadId={lead.id}
        currentEmail={lead.email || ''}
        options={correctEmailResendOptions}
        suggestedId={correctEmailResendSuggestedId}
        onClose={() => setCorrectEmailResendOpen(false)}
        onSaveEmail={async (email) => {
          const saved = await handleLeadFieldUpdate('email', email)
          if (saved) await fetchAllData(false)
          return saved
        }}
        onComplete={(status, message) => {
          void fetchAllData(false)
          notify({
            title: status === 'sent' || status === 'accepted_pending_provider_confirmation' ? 'Corrected email sent' : status === 'sending' ? 'Corrected email is sending' : status === 'already_sent' ? 'Agreement already sent' : 'Corrected email queued',
            description: message || 'The saved message snapshot was addressed to the corrected lead email.',
            variant: 'success',
          })
        }}
      />


      <PortalModal isOpen={isTourScheduleModalOpen} onClose={() => setIsTourScheduleModalOpen(false)} maxWidth="max-w-2xl">
        <form onSubmit={handleScheduleTour} className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--portal-card)] text-[color:var(--portal-text)]">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 sm:px-6">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">{tourVisitIntent === 'new_visit' ? 'Schedule another visit' : 'Reschedule this visit'}</h3>
              <p className="mt-1 text-[11px] leading-4 text-[color:var(--portal-muted)]">This {tourVisitIntent === 'new_visit' ? 'creates a separate visit with its own follow-up' : 'keeps this visit’s follow-up identity'} and sends a calendar invitation and reminders.</p>
            </div>
            <PortalCloseButton onClick={() => setIsTourScheduleModalOpen(false)} aria-label="Close tour scheduler" className="shrink-0" />
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 pb-7 portal-scrollbar sm:p-6 sm:pb-8">
            <div className="overflow-hidden rounded-xl border border-[#caa24c]/30 bg-[color:var(--portal-soft)] shadow-md">
              <img src={getEventPreviewImage(activeEventForDisplay?.event_type || lead.event_type)} alt={`${activeEventForDisplay?.event_type || lead.event_type || 'Event'} inspiration`} className="h-36 w-full object-cover opacity-90" />
              <div className="px-4 py-3 bg-[color:var(--portal-card)] border-t border-[color:var(--portal-border)]">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Email image selected from event type</p>
                <p className="mt-1 text-xs font-bold text-[color:var(--portal-text)]">{activeEventForDisplay?.event_type || lead.event_type || 'Private Event'} inspiration</p>
              </div>
            </div>
            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2">
              <div className="flex min-h-[66px] flex-col">
                <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Tour date</label>
                <PortalDatePicker value={tourScheduleDate} onChange={setTourScheduleDate} className="w-full [&>button]:min-h-10" placeholder="Choose tour date" />
              </div>
              <div className="flex min-h-[66px] flex-col">
                <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Start time</label>
                <PortalSelect value={tourScheduleTime} onChange={setTourScheduleTime} options={EVENT_TIME_OPTIONS} className="w-full" buttonClassName="min-h-10" placeholder="Choose tour time" />
              </div>
              <div className="flex min-h-[66px] flex-col">
                <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Meeting type</label>
                <PortalSelect value={tourMeetingType} onChange={setTourMeetingType} options={[
                  { value: 'Private Venue Tour', label: 'Private Venue Tour' },
                  { value: 'Wedding Walkthrough', label: 'Wedding Walkthrough' },
                  { value: 'Quinceañera Walkthrough', label: 'Quinceañera Walkthrough' },
                  { value: 'Event Planning Consultation', label: 'Event Planning Consultation' },
                  { value: 'Vendor Walkthrough', label: 'Vendor Walkthrough' },
                ]} className="w-full" buttonClassName="min-h-10" />
              </div>
              <div className="flex min-h-[66px] flex-col">
                <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Duration</label>
                <PortalSelect value={tourScheduleDuration} onChange={setTourScheduleDuration} options={[
                  { value: '30', label: '30 minutes' },
                  { value: '45', label: '45 minutes' },
                  { value: '60', label: '60 minutes' },
                  { value: '90', label: '90 minutes' },
                ]} className="w-full" buttonClassName="min-h-10" />
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
              <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Tour team</p>
              <div className="flex flex-wrap gap-2">
                {['Arianna', 'Carlos', 'Alex'].map((name) => {
                  const selected = tourAssignees.includes(name)
                  return <button key={name} type="button" onClick={() => setTourAssignees((current) => selected ? current.filter((item) => item !== name) : [...current, name])} className={`rounded-lg border px-3 py-2 text-[9px] font-black uppercase ${selected ? 'border-[#caa24c]/50 bg-[#caa24c]/15 text-[#a8792f]' : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'}`}>{name}</button>
                })}
                <input value={tourAssigneeCustom} onChange={(event) => setTourAssigneeCustom(event.target.value)} placeholder="Custom" className="min-w-24 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[10px] text-[color:var(--portal-text)] outline-none" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Details Elena AI may mention to the client</label>
              <textarea value={tourClientFacingNotes} onChange={(event) => setTourClientFacingNotes(event.target.value)} rows={5} maxLength={2000} placeholder="Example: They want space for a quince court entrance, a family photo area, and room for approximately 150 guests." className="w-full resize-none rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-3 text-xs leading-5 text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50" />
              <p className="mt-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">Review this field before sending. Internal staff notes are intentionally excluded unless you copy a client-safe detail here.</p>
            </div>
            <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-[10px] font-semibold leading-5 text-blue-950 dark:text-blue-200/90 shadow-xs">
              This sends one branded calendar invitation now, then reminder emails 24 hours and 2 hours before the tour when enough time remains.
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 shadow-[0_-18px_36px_rgba(0,0,0,0.12)] sm:px-6">
            <div className="hidden text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)] sm:block">
              {!lead.email ? 'Add a client email first' : !tourScheduleDate || !tourScheduleTime ? 'Date and time are required' : 'Ready to send'}
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button type="button" onClick={() => setIsTourScheduleModalOpen(false)} disabled={schedulingTour} className="min-h-11 flex-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] disabled:opacity-40 sm:flex-none">
                Cancel
              </button>
              <button type="submit" disabled={schedulingTour || !lead.email || !tourScheduleDate || !tourScheduleTime} className="inline-flex min-h-11 flex-[1.7] items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-xl shadow-[#caa24c]/15 transition-colors hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:bg-[color:var(--portal-soft)] disabled:text-[color:var(--portal-muted)] disabled:opacity-40 sm:flex-none">
                <Send size={13} /> {schedulingTour ? 'Creating Invite...' : 'Send Invite & Schedule'}
              </button>
            </div>
          </div>
        </form>
      </PortalModal>

      {/* Vendor picker modal */}
      <PortalModal isOpen={isVendorModalOpen} onClose={() => setIsVendorModalOpen(false)} maxWidth="max-w-2xl">
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-6 py-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Add Vendors</h3>
            <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">Link existing operation vendors to this lead.</p>
          </div>
          <PortalCloseButton onClick={() => setIsVendorModalOpen(false)} aria-label="Close vendor picker" />
        </div>
        <div className="max-h-[70vh] overflow-y-auto bg-[color:var(--portal-card)] p-6 portal-scrollbar">
          {loadingVendors ? (
            <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-6 text-center text-xs text-[color:var(--portal-muted)]">Loading vendors...</div>
          ) : allVendors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-6 text-center text-xs leading-5 text-[color:var(--portal-muted)]">
              <p className="font-semibold text-[color:var(--portal-text)]">No vendor records found.</p>
              <p className="mt-1 text-[color:var(--portal-muted)]">Add vendors in Operations first, then link them here.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {allVendors.map((vendor) => {
                const isLinked = linkedVendorIds.has(vendor.id)
                return (
                  <button
                    key={vendor.id}
                    type="button"
                    onClick={() => toggleVendorSelection(vendor.id)}
                    className={`flex items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${
                      isLinked
                        ? 'border-[#caa24c]/40 bg-[#caa24c]/10'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/30'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[color:var(--portal-text)]">{vendor.name}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">{vendor.vendor_type}</p>
                      <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{[vendor.phone, vendor.email].filter(Boolean).join(' • ') || 'No contact details'}</p>
                    </div>
                    <span className={`rounded border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
                      isLinked
                        ? 'border-[#caa24c]/30 bg-[#caa24c]/10 text-[#caa24c]'
                        : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)]'
                    }`}>
                      {isLinked ? 'Linked' : 'Add'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PortalModal>

      {/* Timeline item modal */}
      <PortalModal isOpen={isTimelineModalOpen} onClose={() => setIsTimelineModalOpen(false)} maxWidth="max-w-lg">
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-6 py-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">{timelineEditIndex === null ? 'Add Timeline Step' : 'Edit Timeline Step'}</h3>
            <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">Build a simple run of show for this event.</p>
          </div>
          <PortalCloseButton onClick={() => setIsTimelineModalOpen(false)} aria-label="Close timeline step modal" />
        </div>
        <form onSubmit={handleTimelineSubmit} className="space-y-4 bg-[color:var(--portal-card)] p-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Time</label>
            <input
              type="text"
              required
              value={timelineTime}
              onChange={(event) => setTimelineTime(event.target.value)}
              placeholder="e.g. 4:00 PM"
              className="portal-input-transparent w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 placeholder:text-[color:var(--portal-faint)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Step Title</label>
            <input
              type="text"
              required
              value={timelineTitle}
              onChange={(event) => setTimelineTitle(event.target.value)}
              placeholder="e.g. Vendor load-in"
              className="portal-input-transparent w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 placeholder:text-[color:var(--portal-faint)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Description</label>
            <textarea
              value={timelineDescription}
              onChange={(event) => setTimelineDescription(event.target.value)}
              placeholder="Optional details, owner, or notes..."
              className="portal-input-transparent h-24 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs leading-5 text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 placeholder:text-[color:var(--portal-faint)]"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-[#caa24c] py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#dfbd68]"
          >
            {timelineEditIndex === null ? 'Add Step' : 'Save Step'}
          </button>
        </form>
      </PortalModal>

      {/* Payment request modal */}
      <PortalModal isOpen={Boolean(paymentRequestInvoice)} onClose={() => setPaymentRequestInvoice(null)} maxWidth="max-w-lg">
        {paymentRequestInvoice ? (
          <form onSubmit={handleSendInvoice} className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--portal-bg)]">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-6 py-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Send Signed-Contract Payment Request</h3>
                <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">Available only after the agreement is signed. The client receives a secure Stripe link for the amount selected here.</p>
              </div>
              <PortalCloseButton onClick={() => setPaymentRequestInvoice(null)} aria-label="Close payment request window" />
            </div>
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-[10px]">
                <div><span className="block text-[color:var(--portal-muted)]">Invoice</span><span className="font-mono text-[color:var(--portal-text)]">{formatMoney(paymentRequestInvoice.total)}</span></div>
                <div><span className="block text-[color:var(--portal-muted)]">Paid</span><span className="font-mono text-emerald-700 dark:text-emerald-400">{formatMoney(getInvoicePaidTotal(paymentRequestInvoice.id))}</span></div>
                <div><span className="block text-[color:var(--portal-muted)]">Balance</span><span className="font-mono text-[#8c6529] dark:text-[#f1d27a]">{formatMoney(getInvoiceBalance(paymentRequestInvoice))}</span></div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Payment to request</label>
                <PortalSelect
                  value={paymentRequestKind}
                  onChange={(value) => setPaymentRequestKind(value as typeof paymentRequestKind)}
                  options={paymentRequestInvoice.invoice_kind === 'deposit'
                    ? [{ value: 'deposit', label: 'Initial booking payment + refundable security deposit — ' + formatMoney(getInvoiceBalance(paymentRequestInvoice)) }]
                    : paymentRequestInvoice.invoice_kind === 'final_balance'
                      ? [{ value: 'balance', label: 'Remaining Final Event Price balance — ' + formatMoney(getInvoiceBalance(paymentRequestInvoice)) }]
                      : [
                        { value: 'deposit', label: 'Initial booking payment + refundable security deposit — ' + formatMoney(getSuggestedInvoiceDeposit(paymentRequestInvoice)) },
                        { value: 'balance', label: 'Pay invoice in full — ' + formatMoney(getInvoiceBalance(paymentRequestInvoice)) },
                        { value: 'custom', label: 'Custom installment — choose an amount' },
                      ]}
                />
              </div>
              {paymentRequestKind === 'custom' && paymentRequestInvoice.invoice_kind !== 'deposit' && paymentRequestInvoice.invoice_kind !== 'final_balance' ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Custom amount</label>
                  <input type="number" min="0.50" max={getInvoiceBalance(paymentRequestInvoice)} step="0.01" required value={customPaymentAmount} onChange={(event) => setCustomPaymentAmount(event.target.value)} className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 font-mono text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" />
                </div>
              ) : null}
              <button type="submit" disabled={sendingInvoiceId === paymentRequestInvoice.id} className="w-full rounded-lg bg-[#caa24c] py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#dfbd68] disabled:opacity-40">
                {sendingInvoiceId === paymentRequestInvoice.id ? 'Creating link and sending...' : 'Email Secure Payment Link'}
              </button>
            </div>
          </form>

        ) : null}
      </PortalModal>

      <PortalModal
        isOpen={Boolean(contractToCancel)}
        onClose={() => !contractActionKey?.startsWith('cancel-') && setContractToCancel(null)}
        maxWidth="max-w-md"
      >
        {contractToCancel ? (
          <div className="bg-[color:var(--portal-bg)] p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-700 dark:text-red-300"><Trash2 size={18} /></div>
              <div>
                <h3 className="text-sm font-black text-[color:var(--portal-text)]">Cancel this contract?</h3>
                <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">
                  This immediately disables <span className="font-semibold text-[color:var(--portal-text)]">{contractToCancel.client_name}&apos;s current signing link</span>. The booking and its documents remain saved, but this link cannot be used after cancellation.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setContractToCancel(null)}
                disabled={contractActionKey === `cancel-${contractToCancel.id}`}
                className="rounded-lg border border-[color:var(--portal-border)] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] disabled:opacity-40"
              >
                Keep link
              </button>
              <button
                type="button"
                onClick={() => void handleContractRequestAction(contractToCancel, 'cancel')}
                disabled={contractActionKey === `cancel-${contractToCancel.id}`}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-red-700 disabled:opacity-40"
              >
                {contractActionKey === `cancel-${contractToCancel.id}` ? 'Cancelling...' : 'Cancel contract'}
              </button>
            </div>
          </div>
        ) : null}
      </PortalModal>

      <PortalModal isOpen={Boolean(invoiceToDelete)} onClose={() => !deletingInvoiceId && setInvoiceToDelete(null)} maxWidth="max-w-md">
        {invoiceToDelete ? (
          <div className="bg-[color:var(--portal-bg)] p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-700 dark:text-red-300"><Trash2 size={18} /></div>
              <div>
                <h3 className="text-sm font-black text-[color:var(--portal-text)]">Delete this invoice?</h3>
                <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">This permanently removes <span className="font-semibold text-[color:var(--portal-text)]">{invoiceToDelete.description || `invoice ${invoiceToDelete.id.slice(0, 8).toUpperCase()}`}</span>, its saved PDF, and any unused Stripe payment link. Paid invoices cannot be deleted.</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setInvoiceToDelete(null)} disabled={Boolean(deletingInvoiceId)} className="rounded-lg border border-[color:var(--portal-border)] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] disabled:opacity-40">Keep invoice</button>
              <button type="button" onClick={() => void handleDeleteInvoice()} disabled={Boolean(deletingInvoiceId)} className="rounded-lg bg-red-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-red-700 disabled:opacity-40">{deletingInvoiceId ? 'Deleting...' : 'Delete invoice'}</button>
            </div>
          </div>
        ) : null}
      </PortalModal>

      <PortalModal isOpen={confirmRefundModalOpen} onClose={() => !refundingDeposit && setConfirmRefundModalOpen(false)} maxWidth="max-w-md">
        <div className="bg-[color:var(--portal-card)] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <RotateCcw size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-[color:var(--portal-text)]">Refund {formatMoney(refundableSecurityDepositAmount)} Security Deposit via Stripe?</h3>
              <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">
                This will process an immediate <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(refundableSecurityDepositAmount)} refund</span> back to <span className="font-semibold text-[color:var(--portal-text)]">{lead?.full_name}&apos;s original Stripe payment method</span>.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmRefundModalOpen(false)}
              disabled={refundingDeposit}
              className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-xs font-bold uppercase text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-card)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRefundSecurityDeposit}
              disabled={refundingDeposit}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {refundingDeposit ? 'Processing Refund...' : `Confirm ${formatMoney(refundableSecurityDepositAmount)} Stripe Refund`}
            </button>
          </div>
        </div>
      </PortalModal>

      <ProposalDeliveryPreview
        invoice={proposalDeliveryPreview?.invoice || null}
        initialTab={proposalDeliveryPreview?.initialTab || 'email'}
        clientEmail={isLuxorTestInquiry(lead) ? 'luxoratlaspalmas@gmail.com' : lead.email}
        onClose={() => setProposalDeliveryPreview(null)}
      />

      <PortalModal isOpen={Boolean(pdfPreviewInvoice)} onClose={() => setPdfPreviewInvoice(null)} maxWidth="max-w-6xl">
        {pdfPreviewInvoice ? (
          <div className="flex h-[min(82vh,860px)] min-h-[520px] flex-col overflow-hidden bg-[color:var(--portal-bg)]">
            <div className="flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <h3 className="truncate text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">{pdfPreviewInvoice.status === 'draft' ? 'Proposal' : 'Invoice'} Preview</h3>
                <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">Saved PDFs open exactly as the client received them. Drafts are previewed live.</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <a href={`/api/invoices/${pdfPreviewInvoice.id}/pdf`} className="hidden items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#8c6529] hover:text-[#caa24c] sm:inline-flex">
                  <FileText size={13} /> Download
                </a>
                <PortalCloseButton onClick={() => setPdfPreviewInvoice(null)} aria-label="Close PDF preview window" />
              </div>
            </div>
            <PortalPdfViewer url={`/api/invoices/${pdfPreviewInvoice.id}/pdf?disposition=inline`} title={pdfPreviewInvoice.status === 'draft' ? 'final proposal draft' : 'invoice'} />
          </div>
        ) : null}
      </PortalModal>

      <PortalModal isOpen={Boolean(inPersonCloseInvoice)} onClose={() => { if (!inPersonCloseBusy) { setInPersonCloseInvoice(null); setInPersonHandoffUrl(null) } }} maxWidth="max-w-xl">
        {inPersonCloseInvoice ? (
          <div className="bg-[color:var(--portal-bg)] text-[color:var(--portal-text)]">
            <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8c6529] dark:text-[#f1d27a]">Client handoff</p>
                <h3 className="mt-1 text-sm font-black">Review, sign, and choose payment with {lead?.full_name || inPersonCloseInvoice.client_name}</h3>
                <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Keep the choices simple: review the final proposal together, hand over the iPad for signing, then confirm the payment method.</p>
              </div>
              <PortalCloseButton onClick={() => { setInPersonCloseInvoice(null); setInPersonHandoffUrl(null) }} aria-label="Close client handoff" />
            </div>
            {agreementBooking?.contract_status === 'signed' ? (
              <div className="space-y-4 p-5 sm:p-6">
                <div className={`rounded-xl border p-4 text-xs leading-5 ${clientPaymentMethod ? 'border-[#caa24c]/30 bg-[#caa24c]/[0.07] text-[color:var(--portal-text)]' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'}`}><CheckCircle2 className="mb-2" size={17} />{clientPaymentMethod === 'zelle' ? <><span className="font-bold">Client chose Zelle{clientPaymentAmount === 'full' ? ' for the full event balance' : ' for the initial booking payment'}.</span> {clientReportedZelleSent ? 'They marked it as sent—verify the transfer before recording it.' : clientManualHandoffComplete ? 'They handed the iPad back—verify the transfer before recording it.' : 'Confirm the transfer before recording it.'}</> : clientPaymentMethod === 'cash' ? <><span className="font-bold">Client chose Cash{clientPaymentAmount === 'full' ? ' for the full event balance' : ' for the initial booking payment'}.</span> {clientManualHandoffComplete ? 'They handed the iPad back for Luxor to take and verify it.' : 'Take and verify the cash before recording it.'}</> : clientPaymentMethod === 'card' ? <><span className="font-bold">Client chose Card.</span> Open the secure Stripe checkout on the iPad; it is not marked paid until Stripe confirms it.</> : <>The agreement is signed. Confirm the payment only after the client has chosen a method and the funds have been received.</>}</div>
                {clientPaymentAmount === 'full' && clientSelectedManualMethod ? <p className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">Luxor tracks the initial booking payment and final event balance separately. After verifying the full Cash or Zelle amount, record the initial payment first, then the final balance.</p> : null}
                {clientPaymentMethod === 'card' ? <div className="grid gap-2"><button type="button" disabled={inPersonCloseBusy} onClick={() => void openInPersonCardCheckout(agreementBooking)} className="rounded-xl bg-[#caa24c] px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#dfbd68] disabled:opacity-45"><CreditCard className="mr-1.5 inline" size={15} /> Open secure card payment</button></div> : clientSelectedManualMethod ? <div className={`grid gap-2 ${clientPaymentAmount === 'full' ? 'sm:grid-cols-2' : ''}`}><button type="button" disabled={updatingStatus || inPersonCloseBusy || depositBalance <= 0} onClick={() => void handleRecordManualPayment(agreementBooking, 'deposit', clientSelectedManualMethod)} className="rounded-xl bg-[#caa24c] px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#dfbd68] disabled:opacity-45">Record {clientSelectedManualMethod === 'zelle' ? 'Zelle' : 'cash'} received</button>{clientPaymentAmount === 'full' ? <button type="button" disabled={updatingStatus || inPersonCloseBusy || depositBalance > 0 || finalPaymentBalance <= 0} onClick={() => void handleRecordManualPayment(agreementBooking, 'final', clientSelectedManualMethod)} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-xs font-bold text-[color:var(--portal-text)] disabled:opacity-45">Record final balance received</button> : null}</div> : <div className="grid gap-2 sm:grid-cols-3"><button type="button" disabled={inPersonCloseBusy} onClick={() => void openInPersonCardCheckout(agreementBooking)} className="rounded-xl bg-[#caa24c] px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[#dfbd68] disabled:opacity-45"><CreditCard className="mr-1.5 inline" size={15} /> Card via Stripe</button><button type="button" disabled={updatingStatus || inPersonCloseBusy} onClick={() => void handleRecordManualPayment(agreementBooking, 'deposit', 'zelle')} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-xs font-bold text-[color:var(--portal-text)] disabled:opacity-45">Record Zelle received</button><button type="button" disabled={updatingStatus || inPersonCloseBusy} onClick={() => void handleRecordManualPayment(agreementBooking, 'deposit', 'cash')} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-xs font-bold text-[color:var(--portal-text)] disabled:opacity-45">Record cash received</button></div>}
                <button type="button" onClick={() => { setActiveLeadTab('documents'); setInPersonCloseInvoice(null); setInPersonHandoffUrl(null) }} className="text-xs font-semibold text-[#8c6529] underline decoration-[#caa24c]/50 underline-offset-4 dark:text-[#f1d27a]">View signed documents</button>
                <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">Only record Cash or Zelle after it has actually been received. A client selection or handoff confirmation is never payment proof.</p>
              </div>
            ) : inPersonHandoffUrl ? (
              <div className="space-y-5 p-5 sm:p-6">
                <div className="rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/[0.055] p-4">
                  <p className="text-xs font-bold">The client handoff is ready.</p>
                  <ol className="mt-3 space-y-2 text-[11px] leading-5 text-[color:var(--portal-muted)]">
                    <li><span className="mr-2 font-black text-[#8c6529] dark:text-[#f1d27a]">1.</span>Review the selected package and final price together.</li>
                    <li><span className="mr-2 font-black text-[#8c6529] dark:text-[#f1d27a]">2.</span>Hand over the iPad so the client can accept and sign.</li>
                    <li><span className="mr-2 font-black text-[#8c6529] dark:text-[#f1d27a]">3.</span>They choose Card, Zelle, or Cash. Zelle and Cash end with one clear “hand iPad back” step.</li>
                  </ol>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={() => void fetchAllData(false)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)]"><RefreshCw size={13} /> Refresh handoff status</button>
                  <button type="button" onClick={() => openClientProposalHandoff(inPersonCloseInvoice, undefined, inPersonHandoffUrl)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-[#dfbd68]"><Users size={14} /> Open client handoff</button>
                </div>
                <p className="text-[10px] leading-4 text-[color:var(--portal-muted)]">When the client hands the iPad back, refresh this status. Their chosen payment method becomes the one clear next action.</p>
              </div>
            ) : (
              <div className="space-y-5 p-5 sm:p-6">
                <div className="rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/5 p-4">
                  <p className="text-xs font-bold">Use the proposal builder to start a client handoff.</p>
                  <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Choose Review together at the end of the builder to open the client-facing proposal, agreement signature, and payment choice in one guided sequence.</p>
                </div>
                <details className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                  <summary className="cursor-pointer text-xs font-bold text-[color:var(--portal-text)]">Use a paper-signed agreement instead</summary>
{sameDayBookingPromotion(inPersonCloseInvoice)?.coverage_amount ? <div className="mt-3 space-y-3 text-xs"><label className="block space-y-1">Actual signing time, including UTC offset<input value={paperSignedAt} onChange={event => setPaperSignedAt(event.target.value)} placeholder="2026-10-11T22:15:00-05:00" className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3" /></label><label className="block space-y-1">Signing evidence<textarea value={paperSignatureEvidence} onChange={event => setPaperSignatureEvidence(event.target.value)} className="min-h-20 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3" /></label><label className="flex gap-2"><input type="checkbox" checked={paperSignatureConfirmed} onChange={event => setPaperSignatureConfirmed(event.target.checked)} /><span>I verified when both parties signed and that this PDF contains the exact locked proposal terms.</span></label><p className="text-[color:var(--portal-muted)]">Upload time alone does not establish eligibility. The full initial payment is also required before the original-day midnight in Chicago.</p></div> : null}
                  <p className="mt-2 text-[11px] leading-5 text-[color:var(--portal-muted)]">Choose a PDF only after both parties have signed a printed agreement. It is saved privately and unlocks the payment step.</p>
                  <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-xs font-semibold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/50"><span className="truncate">{manualSignedAgreementFile ? manualSignedAgreementFile.name : 'Choose signed agreement PDF'}</span><Upload size={15} className="ml-3 shrink-0 text-[#a8792f] dark:text-[#f1d27a]" /><input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => setManualSignedAgreementFile(event.target.files?.[0] || null)} /></label>
                  <button type="button" disabled={!manualSignedAgreementFile || inPersonCloseBusy} onClick={() => void uploadManualSignedAgreement()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#caa24c]/40 bg-[#caa24c]/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-[#8c6529] transition hover:bg-[#caa24c]/20 disabled:opacity-45 dark:text-[#f1d27a]">{inPersonCloseBusy ? <Loader2 className="animate-spin" size={15} /> : <Upload size={15} />} Save signed PDF</button>
                </details>
              </div>
            )}
          </div>
        ) : null}
      </PortalModal>

      <PortalModal isOpen={Boolean(documentPreview)} onClose={() => setDocumentPreview(null)} maxWidth="max-w-6xl">
        {documentPreview ? (
          <div className="flex h-[min(86vh,900px)] min-h-[560px] flex-col overflow-hidden bg-[color:var(--portal-bg)]">
            <div className="flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 sm:px-6">
              <div className="min-w-0"><h3 className="truncate text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">{documentPreview.title}</h3><p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">Private owner preview of the saved PDF.</p></div>
              <div className="flex shrink-0 items-center gap-3"><a href={documentPreview.url} download className="hidden items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#8c6529] hover:text-[#caa24c] sm:inline-flex"><FileText size={13} /> Download</a><PortalCloseButton onClick={() => setDocumentPreview(null)} aria-label="Close document preview" /></div>
            </div>
            <PortalPdfViewer url={documentPreview.url} title={documentPreview.title} />
          </div>
        ) : null}
      </PortalModal>

      <PortalModal isOpen={Boolean(emailPreview)} onClose={() => setEmailPreview(null)} maxWidth="max-w-3xl">
        {emailPreview ? (
          <div className="flex h-[min(82vh,820px)] min-h-[520px] flex-col overflow-hidden bg-[color:var(--portal-bg)]">
            <div className="flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 sm:px-6">
              <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">Email preview</p><h3 className="mt-1 truncate text-sm font-bold text-[color:var(--portal-text)]">{emailPreview.subject}</h3><p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">This is a preview only. Nothing is sent from this window.</p></div>
              <PortalCloseButton onClick={() => setEmailPreview(null)} aria-label="Close email preview" />
            </div>
            <iframe title="Email preview" srcDoc={emailPreview.html} className="min-h-0 flex-1 bg-white" sandbox="" />
          </div>
        ) : null}
      </PortalModal>

      <PortalModal isOpen={isAddEventModalOpen} onClose={() => !submittingEvent && setIsAddEventModalOpen(false)} maxWidth="max-w-lg">
        <form onSubmit={handleAddEvent} className="bg-[color:var(--portal-bg)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#f1d27a]">New event</p>
              <h3 className="mt-1 text-xl font-serif font-semibold text-[color:var(--portal-text)]">Add another event</h3>
              <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">This stays under {lead.full_name}&apos;s lead and starts with its own proposal, booking, and planning track.</p>
            </div>
            <PortalCloseButton onClick={() => setIsAddEventModalOpen(false)} aria-label="Close add event" />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <LuxorEventTypeCombobox
                label="Event Type"
                required
                value={newEventType}
                onChange={setNewEventType}
                className="sm:col-span-2"
                labelClassName="mb-1.5 text-[9px] font-black tracking-[0.16em]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Date</label>
              <input value={newEventDate} onChange={(event) => setNewEventDate(event.target.value)} placeholder="Date TBD or 2027-08-11" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" />
            </div>
            <div>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Guest count</label>
              <input type="number" min="0" max={LUXOR_MAX_GUESTS} step="1" value={newEventGuestCount} onChange={(event) => setNewEventGuestCount(event.target.value)} placeholder="150" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Package interest</label>
              <PortalSelect value={newEventPackage} onChange={setNewEventPackage} options={[{ value: '', label: 'Not decided yet' }, ...LUXOR_PACKAGE_INTEREST_OPTIONS]} className="w-full" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Notes</label>
              <textarea value={newEventNotes} onChange={(event) => setNewEventNotes(event.target.value)} rows={3} placeholder="Anything specific to this event..." className="w-full resize-none rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setIsAddEventModalOpen(false)} disabled={submittingEvent} className="rounded-lg border border-[color:var(--portal-border)] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)] disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={submittingEvent || !newEventType.trim()} className="rounded-lg bg-[#caa24c] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#dfbd68] disabled:opacity-40">{submittingEvent ? 'Adding event...' : 'Add event'}</button>
          </div>
        </form>
      </PortalModal>

      <SameDayReceiptDialog isOpen={Boolean(sameDayReceipt)} onClose={() => !updatingStatus && setSameDayReceipt(null)} busy={updatingStatus} onSubmit={evidence => { if (sameDayReceipt) void handleRecordManualPayment(sameDayReceipt.booking, 'deposit', sameDayReceipt.method, evidence) }} />
      <ProposalBuilderModal
        isOpen={isInvoiceModalOpen}
        isEditing={Boolean(editingInvoiceId)}
        invoiceId={editingInvoiceId && !invoices.find(invoice => invoice.id === editingInvoiceId)?.price_locked_at ? editingInvoiceId : null}
        supersedesInvoiceId={editingInvoiceId && invoices.find(invoice => invoice.id === editingInvoiceId)?.price_locked_at ? editingInvoiceId : null}
        onClose={() => {
          proposalEditorOpenRef.current = false
          setIsInvoiceModalOpen(false)
          setEditingInvoiceId(null)
        }}
        clientName={lead.full_name}
        clientEmail={lead.email}
        eventType={proposalContext?.event_type || activeEventForDisplay?.event_type || lead.event_type}
        eventDate={proposalContext?.event_date || activeEventForDisplay?.target_date || lead.target_date}
        onEventDateChange={(value) => {
          setProposalContext((current) => ({ ...current, event_date: value }))
        }}
        eventGuestCount={proposalGuestCount}
        onEventGuestCountChange={(value) => {
          setProposalGuestCount(value)
          setProposalContext((current) => ({ ...current, expected_guest_count: Number(value) || undefined }))
        }}
        description={invoiceDesc}
        onDescriptionChange={setInvoiceDesc}
        dueDate={invoiceDueDate}
        onDueDateChange={setInvoiceDueDate}
        offerExpiryTime={invoiceOfferExpiryTime}
        onOfferExpiryTimeChange={setInvoiceOfferExpiryTime}
        discountPercent={invoiceDiscountPercent}
        onDiscountPercentChange={setInvoiceDiscountPercent}
        discountType={invoiceDiscountType}
        onDiscountTypeChange={setInvoiceDiscountType}
        discountValue={invoiceDiscountValue}
        onDiscountValueChange={setInvoiceDiscountValue}
        items={invoiceItems}
        onItemsChange={setInvoiceItems}
        proposalContext={proposalContext}
        onProposalContextChange={(context) => {
          setProposalContext(context)
          if (context.expected_guest_count !== undefined) setProposalGuestCount(String(context.expected_guest_count))
        }}
        selectedPackageId={selectedProposalPackageId}
        onSelectedPackageIdChange={(packageId) => {
          setSelectedProposalPackageId(packageId)
          setProposalContext((current) => ({ ...current, package_id: packageId }))
        }}
        promotionId={selectedProposalPromotionId}
        onPromotionIdChange={(promotionId) => {
          setSelectedProposalPromotionId(promotionId)
          // A legacy draft adjustment must be explicitly converted to a saved
          // promotion. Clearing the selector cannot silently discard it.
          if (promotionId) setLegacyProposalDiscount(null)
          setProposalContext((current) => {
            const nextSelection = { ...(current?.pricing_selection || {}) }
            if (promotionId) {
              nextSelection.promotionId = promotionId
              nextSelection.promotion_id = promotionId
            } else {
              delete nextSelection.promotionId
              delete nextSelection.promotion_id
            }
            return { ...current, promotionId, promotion_id: promotionId, pricing_selection: nextSelection }
          })
        }}
        legacyDiscount={legacyProposalDiscount}
        onCalculationChange={handleProposalCalculationChange}
        pricingEndpoint="/api/proposal-pricing"
        testRunId={isLuxorTestInquiry(lead) ? activeTestRunId : null}
        testProposalReadOnly={testProposalReadOnly}
        notes={invoiceNotes}
        onNotesChange={setInvoiceNotes}
        taxRate={invoiceTaxRate}
        onTaxRateChange={setInvoiceTaxRate}
        submitting={submittingInvoice}
        submissionError={invoiceSubmissionError}
        publicationPending={publicationPending}
        breakdownPublished={breakdownPublished}
        breakdownRetryAvailable={Boolean(
          publicationPending
          && !breakdownPublished
          && savedPublicationInvoice.current?.proposal_context?.proposal_record_type === 'proposal_breakdown'
        )}
        onSubmit={(action, details) => void handleCreateInvoice(action, details)}
      />

      {layoutDesignerOpen ? <EventLayoutDesigner
        open={layoutDesignerOpen}
        onClose={() => setLayoutDesignerOpen(false)}
        initialLayout={(activeEventMetadata.event_layout as EventLayoutDocument | undefined) || null}
        leadName={lead.full_name}
        eventType={activeEventForDisplay?.event_type || lead.event_type}
        eventDate={latestBooking?.event_date || activeEventForDisplay?.target_date || lead.target_date}
        guestCount={latestBooking?.guest_count || activeEventForDisplay?.guest_count || lead.guest_count}
        onSave={async (layout) => {
          const saved = await (selectedLeadEvent ? handleEventMetadataUpdate({
            event_layout: layout,
            floor_plan_layout: layout.name,
          }) : handleMetadataUpdate({ event_layout: layout, floor_plan_layout: layout.name }))
          if (saved) notify({ title: 'Layout saved', description: 'The editable floor plan is saved with this lead.', variant: 'success' })
          return saved
        }}
        onCreateReview={async (layout) => {
          try {
            const response = await fetch('/api/portal/layout-reviews', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ inquiryId: lead.id, leadEventId: selectedLeadEvent?.id || null, layout }),
            })
            const data = await response.json() as { review?: { share_url?: string | null }; error?: string }
            if (!response.ok || !data.review) throw new Error(data.error || 'Unable to create a private layout link.')
            setLayoutReviewRefreshKey((value) => value + 1)
            notify({ title: 'Private layout link created', description: 'Close the builder to preview or email it to the client.', variant: 'success' })
            return typeof data.review.share_url === 'string' ? data.review.share_url : null
          } catch (error) {
            notify({ title: 'Could not create the review link', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
            return null
          }
        }}
      /> : null}

      {/* Legacy invoice builder retained as a fallback while the new proposal builder is validated. */}
      <PortalModal isOpen={false} onClose={() => setIsInvoiceModalOpen(false)} maxWidth="max-w-xl">
        <div className="flex items-center justify-between border-b border-zinc-900 bg-white/[0.02] px-6 py-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Draft Event Invoice</h3>
              <PortalCloseButton onClick={() => setIsInvoiceModalOpen(false)} aria-label="Close invoice draft modal" />
            </div>
            
            <form onSubmit={(event) => { event.preventDefault(); void handleCreateInvoice('save') }} className="flex-1 overflow-y-auto p-6 space-y-4 portal-scrollbar bg-[#080706]">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Invoice Description / Summary</label>
                <input
                  type="text"
                  required
                  value={invoiceDesc}
                  onChange={(e) => setInvoiceDesc(e.target.value)}
                  placeholder="e.g. Wedding Booking & Reception fee"
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Client Name</label>
                  <input
                    type="text"
                    disabled
                    value={lead.full_name}
                    className="w-full bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-500 rounded px-3 py-2 outline-none cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Due Date</label>
                  <PortalDatePicker
                    value={invoiceDueDate}
                    onChange={setInvoiceDueDate}
                    className="w-full"
                    placeholder="Due Date"
                  />
                </div>
              </div>

              {/* Line Items builder */}
              <div className="space-y-3 pt-2">
                <div className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/5 p-3">
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[#caa24c]">Add from Packages.xlsx</label>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <PortalSelect
                        value={selectedCatalogItem}
                        onChange={setSelectedCatalogItem}
                        placeholder="Choose a service"
                        options={LUXOR_SERVICE_CATALOG.map((item) => ({
                          value: item.id,
                          label: `${item.category} - ${item.name}${item.unitPrice === null ? ' (set price)' : ` - ${formatMoney(item.unitPrice)}`}`,
                        }))}
                      />
                    </div>
                    <button type="button" onClick={addCatalogItem} disabled={!selectedCatalogItem} className="rounded-lg bg-[#caa24c] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white disabled:opacity-40">
                      Add
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-zinc-500">Prices remain editable. Custom-priced and approximate workbook items must be confirmed before sending.</p>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Line Items</label>
                  <button
                    type="button"
                    onClick={addInvoiceItem}
                    className="text-[9px] font-black uppercase text-blue-500 tracking-wider flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Row
                  </button>
                </div>

                <div className="space-y-2">
                  {invoiceItems.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <input
                        type="text"
                        required
                        value={item.description}
                        onChange={(e) => handleInvoiceItemChange(index, 'description', e.target.value)}
                        placeholder="Item description..."
                        className="flex-1 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-2.5 py-1.5 outline-none focus:border-blue-500"
                      />
                      <input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={(e) => handleInvoiceItemChange(index, 'quantity', e.target.value)}
                        placeholder="Qty"
                        className="w-14 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-2.5 py-1.5 outline-none focus:border-blue-500 text-center"
                      />
                      <input
                        type="number"
                        min="0"
                        required
                        value={item.unitPrice}
                        onChange={(e) => handleInvoiceItemChange(index, 'unitPrice', e.target.value)}
                        placeholder="Price"
                        className="w-24 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-2.5 py-1.5 outline-none focus:border-blue-500 text-right font-mono"
                      />
                      {invoiceItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInvoiceItem(index)}
                          className="text-zinc-600 hover:text-red-400 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="bg-zinc-950/70 border border-zinc-900 rounded-xl p-4 space-y-2 text-right">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Subtotal:</span>
                  <span className="font-mono text-zinc-300">${getInvoiceSubtotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 border-b border-zinc-900/50 pb-2">
                  <label className="flex items-center gap-2">Tax rate
                    <input type="number" min="0" step="0.01" value={invoiceTaxRate} onChange={(event) => setInvoiceTaxRate(event.target.value)} className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-right font-mono text-zinc-300" />%
                  </label>
                  <span className="font-mono text-zinc-300">${getInvoiceTax().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1">
                  <span>Total Amount Due:</span>
                  <span className="font-mono text-[#caa24c]">${getInvoiceTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Invoice Notes / Memo</label>
                <textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="Notes shown on invoice..."
                  className="w-full h-16 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded p-2 outline-none focus:border-blue-500 leading-relaxed font-sans"
                />
              </div>

              <button
                type="submit"
                disabled={submittingInvoice}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-widest shadow-xl shadow-blue-600/20 disabled:opacity-40"
              >
                Create Invoice
              </button>
            </form>
      </PortalModal>

    </PortalPageFrame>
  )
}
function ClientDossierLoading() {
  return (
    <PortalPageFrame className="max-w-[1560px] !gap-0">

      {/* 1. Header Back & Status */}
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#caa24c]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#caa24c] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#caa24c]" />
          </span>
          <span className="uppercase tracking-widest text-[10px]">Syncing Client Dossier Telemetry...</span>
        </div>
        <div className="h-6 w-24 luxor-skeleton rounded-full animate-pulse" />
      </div>

      {/* 2. Top Header Card */}
      <section className="overflow-hidden rounded-t-2xl border border-b-0 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 lg:p-6 shadow-2xl shadow-black/10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="flex min-w-0 gap-4">
            <div className="h-20 w-20 shrink-0 rounded-full luxor-skeleton animate-pulse" />
            <div className="min-w-0 pt-1 flex-1 space-y-3">
              <div className="h-8 w-64 max-w-full luxor-skeleton rounded animate-pulse" />
              <div className="flex flex-wrap gap-4 mt-2">
                <div className="h-4 w-20 luxor-skeleton rounded" />
                <div className="h-4 w-24 luxor-skeleton rounded" />
                <div className="h-4 w-20 luxor-skeleton rounded" />
              </div>
              <div className="h-3.5 w-44 luxor-skeleton rounded mt-2" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="h-9 w-28 luxor-skeleton rounded-lg" />
            <div className="h-9 w-28 luxor-skeleton rounded-lg" />
            <div className="h-9 w-32 luxor-skeleton rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="border-t border-[color:var(--portal-border)] mt-5 pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex flex-col items-center text-center space-y-2">
                <div className="h-8 w-8 rounded-full luxor-skeleton animate-pulse" />
                <div className="h-3.5 w-16 luxor-skeleton rounded" />
                <div className="h-3 w-10 luxor-skeleton rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Sticky Tab Bar */}
      <div className="sticky -top-4 z-30 -mt-px overflow-hidden rounded-b-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/50 backdrop-blur-xl px-4 py-3 sm:-top-6 lg:-top-8">
        <div className="flex min-w-max gap-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-6 w-16 luxor-skeleton rounded-full" />
          ))}
        </div>
      </div>

      {/* 4. Split Column Layout */}
      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Next Step Skeleton */}
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 shrink-0 rounded-full luxor-skeleton animate-pulse" />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="h-3 w-16 luxor-skeleton rounded" />
                  <div className="h-5 w-36 luxor-skeleton rounded" />
                  <div className="h-4 w-48 luxor-skeleton rounded" />
                  <div className="h-8 w-32 luxor-skeleton rounded-lg mt-1" />
                </div>
              </div>
            </section>

            {/* Client Details Skeleton */}
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-3 w-20 luxor-skeleton rounded" />
                  <div className="h-5 w-32 luxor-skeleton rounded" />
                </div>
                <div className="h-5 w-5 luxor-skeleton rounded" />
              </div>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg luxor-skeleton" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-12 luxor-skeleton rounded" />
                      <div className="h-4 w-40 luxor-skeleton rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Event Details Skeleton */}
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <div className="space-y-2">
                <div className="h-3 w-20 luxor-skeleton rounded" />
                <div className="h-4 w-48 luxor-skeleton rounded" />
              </div>
            </div>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 min-h-[72px]">
                  <div className="h-8 w-8 rounded-lg luxor-skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-16 luxor-skeleton rounded" />
                    <div className="h-4 w-32 luxor-skeleton rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message Payload Skeleton */}
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
            <div className="h-3 w-32 luxor-skeleton rounded mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-full luxor-skeleton rounded" />
              <div className="h-4 w-5/6 luxor-skeleton rounded" />
            </div>
          </div>
        </div>

        {/* Sidebar Recommended Actions Column Skeleton */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
              <div className="h-5 w-40 luxor-skeleton rounded" />
              <div className="h-3 w-20 luxor-skeleton rounded" />
            </div>
            <div className="grid gap-2.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl border border-[color:var(--portal-border)] p-3">
                  <div className="h-8 w-8 rounded-lg luxor-skeleton shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-4 w-32 luxor-skeleton rounded" />
                    <div className="h-3 w-40 luxor-skeleton rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PortalPageFrame>
  )
}

function ClientSummaryCard({
  lead,
  isSaving,
  onUpdate,
  onViewDetails,
  onAvatarUpdate,
}: {
  lead: LuxorInquiry
  isSaving: boolean
  onUpdate: (field: EditableLeadField, value: string) => Promise<boolean>
  onViewDetails: () => void
  onAvatarUpdate?: (newUrl: string) => void
}) {
  const [sectionEditing, setSectionEditing] = useState(false)
  const [sectionDraft, setSectionDraft] = useState<Partial<Record<EditableLeadField, string>>>({})
  const isNewsletter = isNewsletterLead(lead)
  const summaryRows: Array<{
    label: string
    value: string
    editValue: string
    copyValue: string
    field: EditableLeadField
    icon: React.ReactNode
    inputType?: LeadDetailInputType
    placeholder?: string
    options?: { value: string; label: string }[]
    isMono?: boolean
    onCompose?: () => void
    onCall?: () => void
    readOnly?: boolean
  }> = [
    { label: 'Phone Number', icon: <Phone size={14} />, value: lead.phone ? formatPhoneDisplay(lead.phone) : 'No phone captured', editValue: lead.phone || '', copyValue: lead.phone || '', field: 'phone', inputType: 'tel', placeholder: 'Phone number', isMono: false, onCall: lead.phone ? () => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id }) : undefined },
    { label: 'Email Address', icon: <Mail size={14} />, value: lead.email || 'No email captured', editValue: lead.email || '', copyValue: lead.email || '', field: 'email', inputType: 'email', placeholder: 'client@email.com', isMono: false, onCompose: lead.email ? () => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead } })) : undefined },
    { label: 'Event Type', icon: <Star size={14} />, value: lead.event_type || 'Event type not captured', editValue: lead.event_type || '', copyValue: lead.event_type || '', field: 'event_type', inputType: 'event-type', placeholder: 'Search or enter an event type...' },
    { label: 'Tour Date', icon: <Calendar size={14} />, value: lead.preferred_tour_date ? formatDisplayDate(lead.preferred_tour_date) : 'No tour scheduled', editValue: lead.preferred_tour_date || '', copyValue: lead.preferred_tour_date || '', field: 'preferred_tour_date', inputType: 'date', readOnly: true },
    { label: 'Tour Time', icon: <Clock size={14} />, value: lead.preferred_tour_time || 'N/A', editValue: normalizeTimeInputValue(lead.preferred_tour_time), copyValue: lead.preferred_tour_time || '', field: 'preferred_tour_time', inputType: 'time', readOnly: true },
  ]

  const beginSummaryEdit = () => {
    setSectionDraft(Object.fromEntries([
      ...summaryRows.map((row) => [row.field, row.editValue] as const),
      ['full_name', lead.full_name] as const,
    ]))
    setSectionEditing(true)
  }
  const saveSummary = async () => {
    const updates: Array<[EditableLeadField, string]> = [
      ['full_name', sectionDraft.full_name ?? lead.full_name],
      ...summaryRows.filter((row) => !row.readOnly).map((row): [EditableLeadField, string] => [row.field, sectionDraft[row.field] ?? row.editValue]),
    ]
    for (const [field, value] of updates) {
      const currentValue = field === 'full_name' ? lead.full_name : summaryRows.find((row) => row.field === field)?.editValue ?? ''
      if (normalizeComparableValue(currentValue) === normalizeComparableValue(value)) continue
      if (!await onUpdate(field, value)) return
    }
    setSectionEditing(false)
  }
  const cancelSummaryEdit = () => {
    setSectionDraft({})
    setSectionEditing(false)
  }

  return (
    <section className="flex min-h-[260px] flex-col rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <PortalContactAvatar
            name={lead.full_name}
            avatarUrl={lead.metadata?.avatar_url as string | null}
            inquiryId={lead.id}
            size="lg"
            onAvatarUpdate={onAvatarUpdate}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#caa24c]">Client Summary</p>
            {sectionEditing ? (
              <input
                aria-label="Client name"
                value={sectionDraft.full_name ?? lead.full_name}
                maxLength={120}
                onChange={(event) => setSectionDraft((current) => ({ ...current, full_name: event.target.value }))}
                className="mt-1 min-h-9 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-2 text-sm font-semibold text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/45"
              />
            ) : <p className="mt-1 truncate text-sm font-bold text-[color:var(--portal-text)]">{lead.full_name}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {sectionEditing ? (
            <>
              <button type="button" onClick={cancelSummaryEdit} disabled={isSaving} className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void saveSummary()} disabled={isSaving} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#caa24c] px-2.5 text-xs font-semibold text-white hover:bg-[#b98a3d] disabled:opacity-50"><Check size={13} /> Save</button>
            </>
          ) : (
            <button type="button" onClick={beginSummaryEdit} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] px-2.5 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]"><Pencil size={13} /> Edit</button>
          )}
        </div>
      </div>
      <div className="min-w-0 space-y-1">
        {summaryRows.map((row) => (
          <DetailItem
            key={row.label}
            compact
            {...row}
            copyValue={undefined}
            isSaving={isSaving}
            onCommit={sectionEditing && !row.readOnly ? (value) => onUpdate(row.field, value) : undefined}
            sectionEditing={sectionEditing && !row.readOnly}
            sectionDraftValue={sectionDraft[row.field] ?? row.editValue}
            onSectionDraftChange={(value) => setSectionDraft((current) => ({ ...current, [row.field]: value }))}
          />
        ))}
      </div>
      <EventContacts inquiryId={lead.id} />
      <div className="mt-4 border-t border-zinc-100/5 pt-3 dark:border-zinc-850/30">
        <button type="button" onClick={onViewDetails} className="w-full rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/8 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] transition-colors hover:bg-[#caa24c]/14 hover:text-[#f1d27a]">
          Open Messages &rarr;
        </button>
      </div>
    </section>
  )
}

type EventContact = { id: string; full_name: string; email: string | null; phone: string | null; role_label: string | null }

function EventContacts({ inquiryId }: { inquiryId: string }) {
  const [contacts, setContacts] = useState<EventContact[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [removing, setRemoving] = useState<EventContact | null>(null)
  const [busy, setBusy] = useState(false)

  const loadContacts = async () => {
    const response = await fetch(`/api/portal/event-contacts?inquiryId=${encodeURIComponent(inquiryId)}`)
    const data = await response.json().catch(() => ({})) as { contacts?: EventContact[] }
    setContacts(data.contacts || [])
    setLoading(false)
  }
  useEffect(() => { void loadContacts() }, [inquiryId])

  const addContact = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const response = await fetch('/api/portal/event-contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId, fullName: name, email, phone, roleLabel: role }) })
      const data = await response.json().catch(() => ({})) as { contact?: EventContact; error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not add this contact.')
      setContacts((current) => [...current, data.contact!])
      setName(''); setEmail(''); setPhone(''); setRole(''); setAdding(false)
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not add this contact.') } finally { setBusy(false) }
  }
  const removeContact = async () => {
    if (!removing) return
    setBusy(true)
    try {
      const response = await fetch(`/api/portal/event-contacts?id=${encodeURIComponent(removing.id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not remove this contact.')
      setContacts((current) => current.filter((contact) => contact.id !== removing.id))
      setRemoving(null)
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Could not remove this contact.') } finally { setBusy(false) }
  }

  return <>
    <div className="mt-4 border-t border-[color:var(--portal-border)] pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Event contacts</p>
        <button type="button" onClick={() => setAdding((value) => !value)} className="inline-flex items-center gap-1 text-[10px] font-bold text-[#a8792f] hover:text-[#caa24c] dark:text-[#f1d27a]"><Plus size={12} /> Add</button>
      </div>
      {loading ? <div className="h-10 rounded-xl luxor-skeleton" /> : contacts.length === 0 && !adding ? <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[#caa24c]/30 bg-[#caa24c]/5 px-3 py-2.5 text-left text-[10px] text-[color:var(--portal-muted)] hover:border-[#caa24c]/55"><Plus size={14} className="text-[#caa24c]" /> Add another person to this event</button> : null}
      <div className="space-y-1.5">
        {contacts.map((contact) => <div key={contact.id} className="group flex items-center gap-2 rounded-xl bg-[color:var(--portal-soft)] px-2 py-2">
          <PortalContactAvatar name={contact.full_name} size="sm" />
          <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-[color:var(--portal-text)]">{contact.full_name}{contact.role_label ? ` · ${contact.role_label}` : ''}</p><p className="truncate text-[9px] text-[color:var(--portal-muted)]">{contact.email || 'No email'}{contact.phone ? ` · ${formatPhoneDisplay(contact.phone)}` : ''}</p></div>
          <button type="button" onClick={() => setRemoving(contact)} className="portal-contact-remove-action p-1 text-[color:var(--portal-muted)] opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${contact.full_name}`}><Trash2 size={12} /></button>
        </div>)}
      </div>
      {adding ? <form onSubmit={addContact} className="mt-2 space-y-2 rounded-xl border border-[#caa24c]/25 bg-[color:var(--portal-soft)] p-3">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-2 text-[10px] text-[color:var(--portal-text)] outline-none" autoFocus />
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (optional)" type="email" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-2 text-[10px] text-[color:var(--portal-text)] outline-none" />
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone (optional)" type="tel" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-2 text-[10px] text-[color:var(--portal-text)] outline-none" />
        <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role, e.g. Co-host (optional)" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-2 text-[10px] text-[color:var(--portal-text)] outline-none" />
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="px-2 py-1 text-[9px] font-bold text-[color:var(--portal-muted)]">Cancel</button><button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-[#caa24c] px-3 py-1.5 text-[9px] font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Add contact'}</button></div>
      </form> : null}
    </div>
    <PortalModal isOpen={Boolean(removing)} onClose={() => !busy && setRemoving(null)} maxWidth="max-w-sm"><div className="bg-[color:var(--portal-card)] p-5"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Remove event contact?</h3><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Remove {removing?.full_name} from this event? Their own record is not deleted.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRemoving(null)} className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[10px] font-bold text-[color:var(--portal-text)]">Cancel</button><button type="button" onClick={removeContact} disabled={busy} className="rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy ? 'Removing…' : 'Remove person'}</button></div></div></PortalModal>
  </>
}

function LeadLifecycleRail({
  lead,
  bookings,
  latestBooking,
  latestInvoice,
  hasAcceptedProposalEvidence = false,
  agreementDeliveryConfirmed = false,
  agreementDeliveryPending = false,
  isSaving = false,
  activeStageId,
  onStepClick,
}: {
  lead: LuxorInquiry
  bookings: LuxorBooking[]
  latestBooking: LuxorBooking | null
  latestInvoice: LuxorInvoice | null
  hasAcceptedProposalEvidence?: boolean
  agreementDeliveryConfirmed?: boolean
  agreementDeliveryPending?: boolean
  isSaving?: boolean
  activeStageId?: string
  onStepClick?: (stageId: string) => void
}) {
  const inquiryDate = new Date(lead.created_at)
  const formattedInquiryDate = inquiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const tourDate = parseLocalCalendarDate(lead.preferred_tour_date)
  const formattedTourDate = tourDate ? tourDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  const eventDate = parseLocalCalendarDate(lead.target_date)
  const formattedEventDate = eventDate ? eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  const proposalSentDate = getPublishedFinalProposalSentAt(latestInvoice)
  const formattedProposalSentDate = proposalSentDate
    ? new Date(proposalSentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : (lead.status === 'proposal_sent' && !isProposalBreakdownInvoice(latestInvoice)) || lead.status === 'booked'
      ? new Date(lead.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : ''

  const proposalAccepted = Boolean(latestInvoice?.proposal_accepted_at || hasAcceptedProposalEvidence)
  const steps = getLeadLifecycleSteps(lead, latestBooking, latestInvoice, proposalAccepted).map((step) => {
    if (step.id === 'newsletter') {
      return { ...step, label: 'Newsletter', subtext: formattedInquiryDate }
    }
    if (step.id === 'inquiry') {
      return { ...step, label: 'Inquiry', subtext: lead.pipeline_stage === 'newsletter' ? '' : formattedInquiryDate }
    }
    if (step.id === 'tour') {
      const tourSection = getLuxorTourSection(lead, luxorTodayKey())
      const outcomeLabel = lead.tour_attendance_status === 'attended'
        ? 'Completed'
        : lead.tour_attendance_status === 'no_show'
          ? 'No Show'
          : lead.tour_attendance_status === 'cancelled'
            ? 'Cancelled'
            : tourSection === 'needs_outcome'
              ? 'Needs outcome'
              : tourSection === 'needs_schedule'
                ? 'Needs schedule'
                : ''
      return { ...step, label: 'Tour', subtext: [formattedTourDate, outcomeLabel].filter(Boolean).join(' · ') }
    }
    if (step.id === 'proposal') {
      return {
        ...step,
        label: 'Proposal',
        subtext:
          proposalAccepted
            ? 'Accepted'
            : hasPublishedFinalProposal(latestInvoice) || (lead.status === 'proposal_sent' && !isProposalBreakdownInvoice(latestInvoice))
              ? formattedProposalSentDate || ''
              : '',
      }
    }
    if (step.id === 'contract') {
      return {
        ...step,
        label: 'Contract',
        subtext: latestBooking?.contract_status === 'signed'
          ? 'Signed'
          : latestBooking?.contract_status === 'viewed'
            ? 'Opened'
          : agreementDeliveryConfirmed
            ? 'Sent'
            : agreementDeliveryPending
              ? 'Sending'
              : proposalAccepted
                ? 'Pending'
                : hasPublishedFinalProposal(latestInvoice)
                  ? 'Awaiting acceptance'
                  : '',
      }
    }
    if (step.id === 'deposit') {
      return {
        ...step,
        label: 'Deposit',
        subtext: Boolean(latestBooking?.metadata?.deposit_paid_at || latestBooking?.metadata?.deposit_paid_before_booking)
          ? 'Paid'
          : latestBooking?.contract_status === 'signed'
            ? 'Pending'
            : '',
      }
    }
    if (step.id === 'planning') {
      return { ...step, label: 'Planning', subtext: '' }
    }
    if (step.id === 'final_payment') {
      return { ...step, label: 'Final Payment', subtext: '' }
    }
    if (step.id === 'event') {
      return { ...step, label: 'Event', subtext: formattedEventDate || '' }
    }
    if (step.id === 'closing') {
      return { ...step, label: 'Closing', subtext: '' }
    }
    return { ...step, label: 'Complete', subtext: '' }
  })

  const getStageIdFromStepId = (stepId: string) => {
    if (stepId === 'proposal_sent' || stepId === 'proposal_accepted' || stepId === 'proposal') return 'proposal'
    if (stepId === 'event') return 'event'
    if (stepId === 'complete') return 'closing'
    return stepId
  }

  const getStageIcon = (stageId: string) => {
    const icons = {
      newsletter: Mail,
      inquiry: MessageSquare,
      tour: Calendar,
      proposal: FileText,
      contract: FileSignature,
      deposit: DollarSign,
      planning: NotebookPen,
      final_payment: ReceiptText,
      event: PartyPopper,
      closing: ClipboardCheck,
      complete: CheckCircle2,
    }

    return icons[stageId as keyof typeof icons] || Circle
  }

  const [mobileRailExpanded, setMobileRailExpanded] = useState(false)
  const stageTriggerRef = useRef<HTMLButtonElement>(null)
  const stageGridId = React.useId()
  const reduceMotion = useReducedMotion()

  const activeIndex = steps.findIndex(s => s.isActive)
  let finalSteps = steps.map((step, idx) => {
    let active = step.isActive
    const completed = step.isCompleted
    if (activeIndex === -1) {
      const firstNonCompletedIdx = steps.findIndex(s => !s.isCompleted)
      if (firstNonCompletedIdx === idx) {
        active = true
      }
    }
    return { ...step, isActive: active, isCompleted: completed }
  })

  const firstIncompleteIndex = finalSteps.findIndex((step) => !step.isCompleted)
  finalSteps = finalSteps.map((step, index) => {
    return {
      ...step,
      isCompleted: step.isCompleted && (firstIncompleteIndex === -1 || index < firstIncompleteIndex),
    }
  })

  finalSteps = finalSteps.map((step) => {
    if (step.isActive) {
      return { ...step, isCompleted: false }
    }
    return step
  })

  const currentStepIdx = Math.max(
    0,
    finalSteps.findIndex((step) => {
      const stepStageId = getStageIdFromStepId(step.id)
      return activeStageId ? stepStageId === activeStageId : step.isActive
    }),
  )
  const currentStep = finalSteps[currentStepIdx] || finalSteps[0]
  const progressPercent = finalSteps.length > 1
    ? Math.min(100, Math.max(0, Math.round((currentStepIdx / (finalSteps.length - 1)) * 100)))
    : 100

  return (
    <div>
      {/* Compact stage summary for phones and tablets. */}
      <div className="xl:hidden" onKeyDown={(event) => {
        if (event.key !== 'Escape' || !mobileRailExpanded) return
        event.preventDefault()
        setMobileRailExpanded(false)
        stageTriggerRef.current?.focus()
      }}>
        <button
          ref={stageTriggerRef}
          type="button"
          onClick={() => setMobileRailExpanded((current) => !current)}
          aria-expanded={mobileRailExpanded}
          aria-controls={stageGridId}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/70 px-3.5 py-2.5 text-left transition-colors hover:border-[#caa24c]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 md:min-h-[72px] md:px-4 md:py-3"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#caa24c] text-white shadow-sm shadow-[#caa24c]/25 md:h-10 md:w-10">
              {React.createElement(getStageIcon(currentStep?.id || 'inquiry'), { size: 14, strokeWidth: 2.5 })}
            </span>
            <span className="min-w-0">
              <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-[#a8792f] dark:text-[#f1d27a] md:text-[11px] md:text-[#8c6529] dark:md:text-[#f1d27a]">
                Stage {currentStepIdx + 1} of {finalSteps.length}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-bold text-[color:var(--portal-text)] md:text-sm">
                <span>{currentStep?.label}</span>
                {currentStep?.subtext ? (
                  <span className="text-[10px] font-medium text-[color:var(--portal-muted)] md:text-xs">· {currentStep.subtext}</span>
                ) : null}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[color:var(--portal-border)] md:w-24">
              <motion.span
                className="block h-full rounded-full bg-gradient-to-r from-[#a8792f] to-[#caa24c]"
                initial={{ width: '0%' }}
                whileInView={{ width: `${Math.max(12, progressPercent)}%` }}
                viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                transition={{ duration: reduceMotion ? 0 : 0.85, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
            <span className="hidden text-[13px] font-semibold text-[color:var(--portal-muted)] md:inline">{mobileRailExpanded ? 'Hide stages' : 'View stages'}</span>
            <ChevronDown size={14} className={`text-[color:var(--portal-muted)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${mobileRailExpanded ? 'rotate-180' : ''}`} />
          </span>
        </button>

        <AnimatePresence initial={false}>
          {mobileRailExpanded ? (
            <motion.div
              key="mobile-lifecycle-stage-grid"
              id={stageGridId}
              role="group"
              aria-label="Lead stages"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 shadow-lg md:grid-cols-4 md:gap-2 md:p-3">
                {finalSteps.map((step, index) => {
                  const isDone = step.isCompleted
                  const stepStageId = getStageIdFromStepId(step.id)
                  const isCurrent = activeStageId ? stepStageId === activeStageId : step.isActive
                  const StageIcon = getStageIcon(step.id)
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        onStepClick?.(stepStageId)
                        setMobileRailExpanded(false)
                        stageTriggerRef.current?.focus()
                      }}
                      aria-pressed={isCurrent}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 md:min-h-16 md:gap-3 md:px-3 md:py-2.5 ${
                        isCurrent
                          ? 'border-[#caa24c]/55 bg-[#caa24c]/12 text-[#a8792f] dark:text-[#f1d27a] md:text-[#8c6529] dark:md:text-[#f1d27a]'
                          : isDone
                          ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 text-[color:var(--portal-text)]'
                          : 'border-transparent bg-[color:var(--portal-soft)]/30 text-[color:var(--portal-muted)]'
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full md:h-8 md:w-8 ${
                        isCurrent || isDone ? 'bg-[#caa24c] text-white' : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)]'
                      }`}>
                        {isCurrent || isDone ? <StageIcon size={11} strokeWidth={2.5} className="md:h-3.5 md:w-3.5" /> : <span className="text-[9px] font-bold tabular-nums md:text-[11px]">{index + 1}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-black uppercase tracking-[0.1em] md:overflow-visible md:whitespace-normal md:text-[13px] md:font-semibold md:normal-case md:tracking-normal">{step.label}</span>
                        {step.subtext ? <span className="block truncate text-[9px] text-[color:var(--portal-muted)] md:overflow-visible md:whitespace-normal md:text-[11px]">{step.subtext}</span> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Horizontal stage rail for wide desktop layouts. */}
      <div className="portal-scrollbar hidden overflow-x-auto pb-1 xl:block">
        <div className="relative flex min-w-[760px] items-center justify-between px-4 py-2.5 sm:min-w-[920px] sm:px-6">
          {/* Base Track Line */}
          <div className="absolute left-[5%] right-[5%] top-[26px] h-[2px] rounded-full bg-[color:var(--portal-border)]" />
          {/* Active Gold Fill Line */}
          <motion.div
            className="absolute left-[5%] top-[26px] h-[2px] rounded-full bg-gradient-to-r from-[#a8792f] via-[#caa24c] to-[#f1d27a]"
            initial={{ width: '0%' }}
            whileInView={{ width: `${(progressPercent * 0.9).toFixed(1)}%` }}
            viewport={{ once: true, margin: '0px 0px -30px 0px' }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          />
          
          {finalSteps.map((step, index) => {
            const isDone = step.isCompleted
            const stepStageId = getStageIdFromStepId(step.id)
            const isCurrent = activeStageId ? stepStageId === activeStageId : step.isActive
            const StageIcon = getStageIcon(step.id)

            return (
              <button
                key={index}
                type="button"
                onClick={() => onStepClick?.(stepStageId)}
                className="relative flex flex-col items-center flex-1 cursor-pointer focus:outline-none group/step"
              >
                <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300 ${
                  isCurrent
                    ? 'border-2 border-[#caa24c] bg-[#caa24c] text-white ring-4 ring-[#caa24c]/25 shadow-lg shadow-[#caa24c]/25 font-bold scale-105'
                    : isDone
                    ? 'border-[#caa24c] bg-[#caa24c] text-white shadow-md shadow-[#caa24c]/20 font-bold'
                    : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/45'
                }`}>
                  {isDone || isCurrent ? (
                    <StageIcon
                      size={14}
                      color="#ffffff"
                      style={{ stroke: '#ffffff', color: '#ffffff' }}
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-[color:var(--portal-border)] transition-colors group-hover/step:bg-[#caa24c]" />
                  )}
                </div>

                <span className={`mt-2.5 text-[9px] font-black uppercase tracking-[0.14em] ${
                  isCurrent
                    ? 'text-[#a8792f] dark:text-[#f1d27a]'
                    : isDone
                    ? 'text-[color:var(--portal-text)]'
                    : 'text-[color:var(--portal-muted)] group-hover/step:text-[color:var(--portal-text)]'
                }`}>
                  {step.label}
                </span>
                <span className="mt-0.5 h-3 text-[9px] font-medium text-[color:var(--portal-muted)]">
                  {step.subtext}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ClientActionButton({
  icon,
  label,
  detail,
  onClick,
  disabled = false,
  loading = false,
}: {
  icon: React.ReactNode
  label: string
  detail: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      className={`group flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-left transition-all hover:border-[#caa24c]/25 hover:bg-[#caa24c]/5 disabled:cursor-not-allowed disabled:hover:border-[color:var(--portal-border)] disabled:hover:bg-[color:var(--portal-soft)] ${
        loading ? 'opacity-100 ring-1 ring-[#caa24c]/25' : 'disabled:opacity-45'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#caa24c] transition-colors group-hover:border-[#caa24c]/50 shadow-xs">
        {loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#caa24c]/25 border-t-[#caa24c]" />
        ) : (
          icon
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-[color:var(--portal-text)] group-hover:text-[#caa24c] transition-colors">
          {loading ? 'Saving next step...' : label}
        </span>
        <span className="mt-1 block text-[9px] font-medium leading-4 text-[color:var(--portal-muted)]">
          {loading ? 'Updating the lead record now' : detail}
        </span>
      </span>
    </button>
  )
}

function DetailItem({
  icon,
  label,
  value,
  editValue,
  copyValue,
  inputType = 'text',
  placeholder,
  isMono = false,
  subtext,
  isSaving = false,
  onCommit,
  options = [],
  compact = false,
  onCompose,
  onCall,
  sectionEditing = false,
  sectionDraftValue,
  onSectionDraftChange,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  editValue?: string
  copyValue?: string
  inputType?: LeadDetailInputType
  placeholder?: string
  isMono?: boolean
  subtext?: string
  isSaving?: boolean
  onCommit?: (value: string) => Promise<boolean>
  options?: { value: string; label: string }[]
  compact?: boolean
  onCompose?: () => void
  onCall?: () => void
  sectionEditing?: boolean
  sectionDraftValue?: string
  onSectionDraftChange?: (value: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(editValue ?? value)
  const [copied, setCopied] = useState(false)
  const commitInFlightRef = useRef(false)
  const canEdit = Boolean(onCommit)
  const canCopy = Boolean(copyValue?.trim())
  const currentDraft = sectionEditing ? (sectionDraftValue ?? draft) : draft
  const changeDraft = (value: string) => sectionEditing ? onSectionDraftChange?.(value) : setDraft(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isEditing || inputType !== 'date') return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-portal-popover="true"]')) {
        return
      }
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsEditing(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isEditing, inputType])

  const startEditing = () => {
    if (!canEdit || sectionEditing || isSaving || commitInFlightRef.current) return
    setDraft(editValue ?? value)
    setIsEditing(true)
  }

  const activateRow = () => {
    if (sectionEditing) return
    if (onCompose) {
      onCompose()
      return
    }
    if (onCall) {
      onCall()
      return
    }
    startEditing()
  }

  const commitValue = async (value: string) => {
    if (sectionEditing) {
      onSectionDraftChange?.(value)
      return
    }
    if (!onCommit || isSaving || commitInFlightRef.current) return

    commitInFlightRef.current = true
    try {
      const saved = await onCommit(value)
      if (saved) {
        setIsEditing(false)
      }
    } finally {
      commitInFlightRef.current = false
    }
  }

  const commitDraft = () => commitValue(draft)

  const copyDetail = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!copyValue?.trim()) return

    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch (err) {
      console.error('Unable to copy lead detail:', err)
    }
  }

  return (
    <div
      ref={containerRef}
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      aria-label={canEdit ? onCompose ? 'Compose email' : onCall ? 'Call client' : `Edit ${label}` : undefined}
      onClick={activateRow}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !canEdit || isEditing || sectionEditing) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activateRow()
        }
      }}
      className={`group/card relative flex ${compact ? 'min-h-0 items-start gap-3 px-2 -mx-2 py-2' : 'min-h-[72px] items-start gap-3 px-3 -mx-3 py-3.5'} rounded-xl transition-all hover:bg-[#caa24c]/[0.025] ${
        canEdit ? 'cursor-text focus:outline-none focus:ring-1 focus:ring-[#caa24c]/30' : ''
      }`}
    >
      {icon ? (
        <span className={`${compact ? '' : 'mt-0.5'} flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#caa24c]/10 text-[#a8792f]`}>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
      {!compact ? <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">{label}</div> : null}

      {sectionEditing || isEditing ? (
        inputType === 'date' ? (
          <div className={`${compact ? '' : 'mt-2'} w-full`} onClick={(event) => event.stopPropagation()}>
            <PortalDatePicker
              value={currentDraft}
              onChange={async (val) => {
                changeDraft(val)
                if (sectionEditing) return
                if (onCommit) {
                  const saved = await onCommit(val)
                  if (saved) {
                    setIsEditing(false)
                  }
                }
              }}
            />
          </div>
        ) : inputType === 'event-type' ? (
          <div className={`${compact ? '' : 'mt-2'} w-full`} onClick={(event) => event.stopPropagation()}>
            <LuxorEventTypeCombobox
              label={label}
              hideLabel={!compact}
              required
              value={currentDraft}
              disabled={isSaving}
              variant="portal"
              placeholder="Search or enter an event type..."
              onChange={changeDraft}
              onBlur={() => { if (!sectionEditing) void commitDraft() }}
              onEnterCustom={(value) => {
                changeDraft(value)
                if (!sectionEditing) void commitValue(value)
              }}
              onSelectSuggestion={(value) => {
                changeDraft(value)
                if (!sectionEditing) void commitValue(value)
              }}
              labelClassName="mb-1.5 text-[9px] font-black tracking-[0.16em]"
              inputClassName={`${compact ? 'py-1.5' : 'py-2'} rounded-lg px-3 text-sm font-bold ${isMono ? 'tabular-nums' : ''}`}
            />
          </div>
        ) : inputType === 'select' ? (
          <div className={`${compact ? '' : 'mt-2'} w-full`} onClick={(event) => event.stopPropagation()}>
            <PortalSelect
              value={currentDraft}
              disabled={isSaving}
              options={options}
              onChange={async (val) => {
                changeDraft(val)
                if (sectionEditing) return
                if (onCommit) {
                  const saved = await onCommit(val)
                  if (saved) {
                    setIsEditing(false)
                  }
                }
              }}
            />
          </div>
        ) : (
          <input
            autoFocus
            type={inputType}
            min={inputType === 'number' ? 0 : undefined}
            value={currentDraft}
            disabled={isSaving}
            placeholder={placeholder}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => changeDraft(inputType === 'tel' || label === 'Phone' ? formatUsDialInput(event.target.value) : event.target.value)}
            onBlur={() => {
              if (!sectionEditing) void commitDraft()
            }}
            onKeyDown={(event) => {
              if (sectionEditing && (event.key === 'Enter' || event.key === 'Escape')) {
                event.preventDefault()
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                void commitDraft()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(editValue ?? value)
                setIsEditing(false)
              }
            }}
            className={`${compact ? 'py-1.5' : 'mt-2 py-2'} w-full rounded-lg border border-[#caa24c]/25 bg-[color:var(--portal-card)] px-3 text-sm font-bold text-[color:var(--portal-text)] outline-none transition-all placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 ${
              isMono ? 'tabular-nums' : ''
            }`}
          />
        )
      ) : (
      <div className={`group/value relative ${compact ? '' : 'mt-2'} flex w-full min-w-0 flex-col items-start ${canEdit || canCopy ? 'cursor-pointer' : ''}`}>
          {compact ? <span className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{label}</span> : null}
          <p
            className={`min-w-0 w-full flex-1 break-words ${compact ? 'text-xs font-medium [overflow-wrap:anywhere]' : 'text-sm font-bold'} leading-normal text-[color:var(--portal-text)] transition-all duration-150 ${compact ? '' : 'sm:truncate sm:group-hover/value:pr-[5.5rem]'} ${
              isMono ? 'tabular-nums text-xs' : ''
            }`}
          >
            {isSaving ? 'Saving...' : value}
          </p>
          {canCopy || (canEdit && !isEditing) ? (
            <div className={`portal-contact-value-actions pointer-events-auto relative z-10 mt-1 inline-flex max-w-full flex-wrap items-center gap-1 opacity-100 transition-opacity duration-150 ${compact ? '' : 'sm:pointer-events-none sm:absolute sm:right-0 sm:top-1/2 sm:mt-0 sm:-translate-y-1/2 sm:opacity-0 sm:group-hover/value:pointer-events-auto sm:group-hover/value:opacity-100'}`}>
              {canCopy ? (
                <button
                  type="button"
                  aria-label={`Copy ${label}`}
                  onClick={copyDetail}
                  className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition-all ${
                    copied
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/25 hover:text-[#a8792f]'
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              ) : null}
              {onCompose ? (
                <button
                  type="button"
                  aria-label={`Email client`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onCompose()
                  }}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-all hover:border-[#caa24c]/25 hover:text-[#a8792f]"
                >
                  <Mail size={13} />
                </button>
              ) : null}
              {onCall ? (
                <button
                  type="button"
                  aria-label="Call client"
                  onClick={(event) => {
                    event.stopPropagation()
                    onCall()
                  }}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-all hover:border-emerald-500/25 hover:text-emerald-400"
                >
                  <Phone size={13} />
                </button>
              ) : null}
              {canEdit && !sectionEditing ? (
                <button
                  type="button"
                  aria-label={`Edit ${label}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    startEditing()
                  }}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-all hover:border-[#caa24c]/25 hover:text-[#a8792f]"
                >
                  <Pencil size={13} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {subtext && <p className="mt-1 text-[9px] font-medium italic text-[#a8792f]">{subtext}</p>}
      </div>
    </div>
  )
}

function LeadStatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: 'blue' | 'gold' | 'green' | 'slate'
}) {
  const toneClasses = {
    blue: 'border-blue-500/15 bg-blue-500/5 text-blue-400',
    gold: 'border-[#caa24c]/18 bg-[#caa24c]/8 text-[#f1d27a]',
    green: 'border-emerald-500/15 bg-emerald-500/5 text-emerald-400',
    slate: 'border-zinc-800 bg-zinc-950/70 text-zinc-400',
  }

  return (
    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">{label}</p>
        <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] ${toneClasses[tone]}`}>Live</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="max-w-[70%] font-serif tabular-nums text-lg font-bold leading-tight text-[color:var(--portal-text)]">{value}</p>
        <p className="pb-1 text-right text-[11px] font-medium leading-4 text-[color:var(--portal-muted)]">{detail}</p>
      </div>
    </div>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function normalizeLeadFieldValue(field: EditableLeadField, value: string): string | number | null {
  const trimmed = value.trim()
  if (field === 'full_name') {
    if (!trimmed) throw new Error('Enter a client name before saving.')
    if (Array.from(trimmed).length > 120) throw new Error('Keep the client name to 120 characters or fewer.')
    return trimmed
  }
  if (!trimmed) return null

  if (field === 'guest_count') {
    const parsed = Number.parseInt(trimmed.replace(/[^\d]/g, ''), 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null
  }

  if (field === 'email') {
    return trimmed.toLowerCase()
  }

  if (field === 'preferred_tour_time') {
    return formatTimeInputForStorage(trimmed)
  }

  return trimmed
}

function normalizeComparableValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function getEventPreviewImage(eventType: string | null) {
  const value = (eventType || '').toLowerCase()
  if (value.includes('wedding')) return '/images/dining-hall/main-hall-wedding-wide.png'
  if (value.includes('quince') || value.includes('birthday')) return '/images/dining-hall/main-hall-quinceanera-angle.png'
  if (value.includes('baby')) return '/images/luxor-lounge/luxor-lounge-baby-shower.png'
  if (value.includes('corporate')) return '/images/dining-hall/main-hall-corporate-cocktail.png'
  return '/images/dining-hall/main-hall-dinner-service-candid.png'
}

function SignalMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-3">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">{label}</p>
      <p className="mt-2 font-serif text-lg font-bold tabular-nums text-[color:var(--portal-text)]">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">{detail}</p>
    </div>
  )
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'Unknown'

  const diffMs = Date.now() - timestamp
  const future = diffMs < 0
  const absMs = Math.abs(diffMs)
  const minutes = Math.round(absMs / 60_000)
  const hours = Math.round(absMs / 3_600_000)
  const days = Math.round(absMs / 86_400_000)

  if (minutes < 1) return future ? 'in moments' : 'just now'
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`
  return future ? `in ${days}d` : `${days}d ago`
}

function shortenUrl(url: string) {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.hostname}${path}`.slice(0, 64)
  } catch {
    return url.length > 64 ? `${url.slice(0, 61)}...` : url
  }
}

function formatTimeString(timeStr: string) {
  if (!timeStr) return ''
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return timeStr

  let hours = Number(match[1])
  const minutes = match[2]
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12
  return `${hours}:${minutes} ${ampm}`
}

function calculateEventDurationMinutes(startTime: string, endTime: string) {
  const parse = (value: string) => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/)
    return match ? Number(match[1]) * 60 + Number(match[2]) : null
  }
  const start = parse(startTime)
  const end = parse(endTime)
  if (start === null || end === null) return null
  return end >= start ? end - start : 24 * 60 - start + end
}

function formatEventDuration(startTime: string, endTime: string) {
  const totalMinutes = calculateEventDurationMinutes(startTime, endTime)
  if (totalMinutes === null) return 'Not set'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes} min`
  if (!minutes) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours} hr ${minutes} min`
}

function normalizeTimeInputValue(value: string | null | undefined) {
  if (!value) return ''

  const twentyFourHourMatch = value.match(/^(\d{1,2}):(\d{2})$/)
  if (twentyFourHourMatch) {
    return `${twentyFourHourMatch[1].padStart(2, '0')}:${twentyFourHourMatch[2]}`
  }

  const twelveHourMatch = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!twelveHourMatch) return value

  let hours = Number(twelveHourMatch[1])
  const minutes = twelveHourMatch[2]
  const period = twelveHourMatch[3].toUpperCase()

  if (period === 'PM' && hours < 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  return `${String(hours).padStart(2, '0')}:${minutes}`
}

function formatTimeInputForStorage(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return value

  const hours = Number(match[1])
  const minutes = match[2]
  if (!Number.isFinite(hours)) return value

  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes} ${period}`
}

function formatLeadAge(createdAt: string) {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return 'Unknown'

  const daysOld = Math.max(0, Math.floor((Date.now() - created) / 86_400_000))
  if (daysOld === 0) return 'Today'
  if (daysOld === 1) return '1 day old'
  return `${daysOld} days old`
}

function describeActivityEntry(entry: ActivityEntry) {
  if (entry.kind === 'email') {
    return entry.email.direction === 'outgoing' ? 'Email sent' : 'Email received'
  }

  if (entry.kind === 'call') {
    if (entry.call.is_voicemail) return 'Voicemail received'
    if (entry.call.direction === 'inbound') {
      return ['busy', 'failed', 'no-answer', 'canceled'].includes(entry.call.status) ? 'Inbound call missed' : 'Inbound call received'
    }
    return 'Outbound call placed'
  }

  if (entry.note.note_type === 'call_log') return 'Call logged'
  if (entry.note.note_type === 'email_log') return 'Email logged'
  if (entry.note.note_type === 'status_change') return 'Status updated'
  return 'Note added'
}

function formatCallDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.max(0, seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function getLeadNextStep(lead: LuxorInquiry, latestBooking: LuxorBooking | null, latestInvoice: LuxorInvoice | null) {
  if (lead.status === 'closed_lost') {
    return {
      title: 'Re-open or archive',
      detail: 'Decide whether this should go back into the pipeline',
    }
  }

  if (latestInvoice) {
    if (!hasPublishedFinalProposal(latestInvoice)) {
      return {
        title: 'Finish the final proposal',
        detail: 'Review the package, services, and payment plan before publishing it to the client',
      }
    }

    if (!latestInvoice.proposal_accepted_at) {
      return {
        title: 'Await proposal acceptance',
        detail: 'The client must accept this locked proposal before Luxor prepares the agreement',
      }
    }

    if (!latestBooking) {
      return {
        title: 'Prepare the agreement',
        detail: 'The proposal is accepted, but its matching agreement record is not confirmed yet',
      }
    }

    if (latestBooking.contract_status === 'viewed') {
      return {
        title: 'Contract viewed by client',
        detail: 'The Event Agreement was opened. Track the client signature here.',
      }
    }

    if (latestBooking.contract_status === 'signed') {
      return {
        title: 'Review booking',
        detail: 'Contract is signed, so keep the record clean',
      }
    }

    return {
      title: 'Track agreement signature',
      detail: 'Use the current agreement record to monitor delivery and signature progress',
    }
  }

  if (lead.status === 'new') {
    return {
      title: 'Reach out today',
      detail: 'Call or email before the lead cools off',
    }
  }

  if (lead.status === 'contacted' || lead.status === 'tour_requested') {
    return {
      title: 'Lock the tour',
      detail: 'Confirm the date, time, and who is coming',
    }
  }

  if (lead.status === 'tour_confirmed') {
    return {
      title: 'Send proposal',
      detail: 'Pair pricing with a clear next step',
    }
  }

  if (lead.status === 'proposal_sent') {
    return {
      title: 'Follow up',
      detail: 'Check for questions or objections',
    }
  }

  if (lead.status === 'booked') {
    if (!latestBooking) {
      return {
        title: 'Review final proposal acceptance',
        detail: 'A booking is created automatically when the client accepts the locked final proposal',
      }
    }

    if (latestBooking.contract_status === 'signed') {
      return {
        title: 'Review booking',
        detail: 'Contract is signed, so keep the record clean',
      }
    }

    if (latestBooking.contract_status === 'sent') {
      return {
        title: 'Contract follow-up',
        detail: 'Keep an eye on signature status',
      }
    }

    return {
      title: 'Send contract',
      detail: latestInvoice ? 'Match the booking to the invoice' : 'Keep the contract moving',
    }
  }

  return {
    title: 'Keep momentum',
    detail: 'Move this lead toward a booking or decision',
  }
}

function getMostRecentBooking(bookings: LuxorBooking[]) {
  if (bookings.length === 0) return null

  return [...bookings].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime()
    const bTime = new Date(b.updated_at || b.created_at).getTime()
    return bTime - aTime
  })[0] ?? null
}

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function getPaidTotal(payments: LuxorPayment[], paymentKind?: 'deposit' | 'final') {
  return payments
    .filter((payment) => payment.status === 'paid')
    .filter((payment) => !paymentKind || payment.metadata?.payment_kind === paymentKind)
    .reduce((total, payment) => total + Number(payment.amount || 0), 0)
}

function isGrandOpeningRsvp(lead: LuxorInquiry) {
  return lead.campaign_key === 'grand_opening_2026_07_25' || lead.flow === 'grand_opening_rsvp' || lead.source === 'grand_opening_rsvp'
}

function isNewsletterLead(lead: LuxorInquiry) {
  return (
    lead.pipeline_stage === 'newsletter' ||
    lead.source === 'newsletter' ||
    lead.flow === 'newsletter_signup' ||
    lead.metadata?.submitted_form === 'Newsletter Signup' ||
    lead.metadata?.marketing_source === 'newsletter'
  )
}

type LeadLifecycleStepState = {
  id: 'newsletter' | 'inquiry' | 'tour' | 'proposal' | 'contract' | 'deposit' | 'planning' | 'final_payment' | 'event' | 'closing' | 'complete'
  isCompleted: boolean
  isActive: boolean
}

function getLeadLifecycleSteps(lead: LuxorInquiry, latestBooking: LuxorBooking | null, currentProposal: LuxorInvoice | null = null, proposalAcceptanceRecorded = false): LeadLifecycleStepState[] {
  const isNewsletter = isNewsletterLead(lead) || lead.pipeline_stage === 'newsletter'
  const hasProposalOrContractWorkflow = Boolean(
    hasPublishedFinalProposal(currentProposal) ||
    currentProposal?.proposal_accepted_at ||
    proposalAcceptanceRecorded ||
    latestBooking,
  )
  const hasTourBeenCompleted = lead.tour_attendance_status === 'attended'
  const tourHasFinalOutcome = ['attended', 'no_show', 'cancelled'].includes(lead.tour_attendance_status || '')
  const hasProposalStepBeenReached = hasProposalOrContractWorkflow || lead.status === 'booked' || ['contract', 'deposit', 'planning', 'final_payment', 'event', 'closing'].includes(lead.pipeline_stage || '')
  const leadStatusReflectsFinalProposal = lead.status === 'proposal_sent' && !isProposalBreakdownInvoice(currentProposal)
  const proposalIsActive = !hasProposalOrContractWorkflow && (lead.pipeline_stage === 'proposal' || leadStatusReflectsFinalProposal)
  const bookingMetadata = latestBooking?.metadata || {}
  const isLegacyComplete = latestBooking?.status === 'completed'
  const bookingPaymentCollected = Boolean(bookingMetadata.deposit_paid_at) || Boolean(bookingMetadata.deposit_paid_before_booking)
  const leadCompleted = Boolean(bookingMetadata.lead_completed_at) || isLegacyComplete
  const planningCompleted = Boolean(bookingMetadata.planning_completed_at) || leadCompleted
  const finalPaymentCompleted = Boolean(bookingMetadata.final_payment_recorded_manually_at) || Boolean(bookingMetadata.final_payment_paid_at) || leadCompleted
  const eventCompleted = Boolean(bookingMetadata.event_completed_at) || leadCompleted
  const closeoutCompleted = Boolean(bookingMetadata.closeout_completed_at) || leadCompleted

  const steps: LeadLifecycleStepState[] = []

  if (isNewsletter) {
    steps.push({
      id: 'newsletter',
      isCompleted: lead.pipeline_stage !== 'newsletter',
      isActive: lead.pipeline_stage === 'newsletter',
    })
  }

  steps.push(
    {
      id: 'inquiry',
      isCompleted: isNewsletter ? (lead.pipeline_stage !== 'newsletter' && lead.status !== 'new') : lead.status !== 'new',
      isActive: isNewsletter ? false : lead.status === 'new',
    },
    {
      id: 'tour',
      isCompleted: hasTourBeenCompleted,
      isActive: !tourHasFinalOutcome && Boolean(lead.preferred_tour_date || ['contacted', 'tour_requested', 'tour_confirmed'].includes(lead.status)),
    },
    {
      id: 'proposal',
      isCompleted: hasProposalStepBeenReached,
      isActive: proposalIsActive && !latestBooking && !hasProposalStepBeenReached,
    },
    {
      id: 'contract',
      isCompleted: latestBooking?.contract_status === 'signed',
      isActive: hasProposalOrContractWorkflow && latestBooking?.contract_status !== 'signed',
    },
    {
      id: 'deposit',
      isCompleted: bookingPaymentCollected,
      isActive: latestBooking?.contract_status === 'signed' && !bookingPaymentCollected,
    },
    {
      id: 'planning',
      isCompleted: planningCompleted,
      isActive: bookingPaymentCollected && !planningCompleted,
    },
    {
      id: 'final_payment',
      isCompleted: finalPaymentCompleted,
      isActive: planningCompleted && !finalPaymentCompleted,
    },
    {
      id: 'event',
      isCompleted: eventCompleted,
      isActive: finalPaymentCompleted && !eventCompleted,
    },
    {
      id: 'closing',
      isCompleted: closeoutCompleted,
      isActive: eventCompleted && !closeoutCompleted,
    },
    {
      id: 'complete',
      isCompleted: leadCompleted,
      isActive: closeoutCompleted && !leadCompleted,
    },
  )

  return steps
}

function normalizeTimelineDate(value: string | null) {
  if (!value) return new Date().toISOString()

  const numericValue = Number(value)
  const date = Number.isFinite(numericValue) ? new Date(numericValue) : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function formatTimelineDate(value: string | number) {
  if (!value) return 'No date'
  const numericValue = Number(value)
  const date = Number.isFinite(numericValue) ? new Date(numericValue) : new Date(value)
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleString('en-US', { weekday: 'short' })
}

function compactActivityText(value: string | null | undefined, maxLength = 520) {
  if (!value) return ''

  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed

  return `${trimmed.slice(0, maxLength).trimEnd()}...`
}

function cleanEmailPreview(value: string | null | undefined) {
  if (!value) return ''

  const decoded = decodeHtmlEntities(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const stylesheetStart = decoded.search(/(?:^|\s)(:root|@media|body\s*,\s*table|table\s*,\s*td)\b/i)
  const preview = compactActivityText(stylesheetStart > 0 ? decoded.slice(0, stylesheetStart) : decoded, 180)
  return /^\d{1,3}$/.test(preview) ? '' : preview
}

function formatSourceLabel(lead: LuxorInquiry) {
  if (isGrandOpeningRsvp(lead)) return 'Grand Opening RSVP'
  if (isNewsletterLead(lead)) return 'Newsletter'
  return lead.source.replaceAll('_', ' ')
}

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return ''

  // If the format is YYYY-MM-DD, parse it with noon local time to avoid timezone offset shifts
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const date = new Date(year, month, day, 12, 0, 0)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatVenueDateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatProposalClock(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return value
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return value
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)))
}

function parseLocalCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 12)
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
