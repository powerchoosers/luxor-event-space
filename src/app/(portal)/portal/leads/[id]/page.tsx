'use client'

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, use } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
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
} from 'lucide-react'
import { LUXOR_EVENT_TYPES, LuxorBooking, LuxorDocument, LuxorEmailJob, LuxorInquiry, LuxorLeadEvent, LuxorNote, LuxorTask, LuxorInvoice, LuxorInvoiceLineItem, LuxorPayment, LuxorPaymentInstallment, LuxorVendor } from '@/lib/luxorInquiryTypes'
import { LUXOR_DEFAULT_SECURITY_DEPOSIT } from '@/lib/luxorBookingMoney'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import { LUXOR_TIME_DROPDOWN_OPTIONS, normalizeLuxorTimeDropdownValue } from '@/lib/luxorTimeOptions'
import { PortalPageFrame, PortalStatusBadge, PortalSelect, PortalDatePicker, PortalModal, PortalContactAvatar, PortalCloseButton, PortalFilterBar } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'
import { LUXOR_GRAND_OPENING } from '@/lib/luxorGrandOpening'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { formatPhoneDisplay, formatUsDialInput } from '@/lib/luxorPhoneClient'
import type { LuxorCall } from '@/lib/luxorCallTypes'
import { LuxorTextThread } from '@/components/portal/LuxorTextThread'
import { LuxorThreadPopup } from '@/components/portal/LuxorThreadPopup'
import {
  ProposalBuilderModal,
  type ProposalBuilderContext,
  type ProposalPricingCalculation,
} from '@/components/portal/ProposalBuilderModal'
import { EventLayoutDesigner, type EventLayoutDocument } from '@/components/portal/EventLayoutDesigner'
import { PortalSmsConsentBadge } from '@/components/portal/PortalSmsConsentBadge'
import { catalogItemToLineItem, LUXOR_PACKAGE_INTEREST_OPTIONS, LUXOR_SERVICE_CATALOG } from '@/lib/luxorServiceCatalog'
import { PortalPdfViewer } from '@/components/portal/PortalPdfViewer'
import { ProposalDeliveryPreview } from '@/components/portal/ProposalDeliveryPreview'
import { ProposalPaymentSchedule } from '@/components/portal/ProposalPaymentSchedule'
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
  folderId?: string
  threadId?: string
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
  if (lead.status === 'tour_confirmed') return 'Confirmed'
  if (lead.preferred_tour_date || lead.preferred_tour_time || lead.status === 'tour_requested') return 'Requested'
  return 'Not scheduled'
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

function hasPublishedFinalProposal(invoice: LuxorInvoice | null) {
  return Boolean(
    invoice?.proposal_sent_at ||
    invoice?.status === 'sent' ||
    getProposalDeliveryState(invoice) === 'delivered',
  )
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

type LeadDetailInputType = 'text' | 'number' | 'date' | 'time' | 'email' | 'tel' | 'select'
type LeadDetailTab = 'overview' | 'activity' | 'tasks' | 'vendors' | 'timeline' | 'documents' | 'messages' | 'notes'

const LEAD_BUDGET_OPTIONS = [
  { value: 'Under $5,000', label: 'Under $5,000' },
  { value: '$5,000–$10,000', label: '$5,000–$10,000' },
  { value: '$10,000–$15,000', label: '$10,000–$15,000' },
  { value: '$15,000–$20,000', label: '$15,000–$20,000' },
  { value: '$20,000+', label: '$20,000+' },
  { value: 'Not sure yet', label: 'Not sure yet' },
]

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

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { notify } = useToast()

  const [lead, setLead] = useState<LuxorInquiry | null>(null)
  const [notes, setNotes] = useState<LuxorNote[]>([])
  const [callRecords, setCallRecords] = useState<LuxorCall[]>([])
  const [tasks, setTasks] = useState<LuxorTask[]>([])
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([])
  const [bookings, setBookings] = useState<LuxorBooking[]>([])
  const [documents, setDocuments] = useState<LuxorDocument[]>([])
  const [signatureRequests, setSignatureRequests] = useState<Array<{ id: string; booking_id: string; inquiry_id: string | null; client_name: string; status: string; created_at: string; signed_at: string | null }>>([])
  const [leadEvents, setLeadEvents] = useState<LuxorLeadEvent[]>([])
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const initializedEventPreferenceRef = useRef(false)
  const [payments, setPayments] = useState<LuxorPayment[]>([])
  const [paymentInstallments, setPaymentInstallments] = useState<LuxorPaymentInstallment[]>([])
  const [tourEmailJobs, setTourEmailJobs] = useState<LuxorEmailJob[]>([])
  const [emailMessages, setEmailMessages] = useState<ZohoEmailMessage[]>([])
  const [loadingEmailMessages, setLoadingEmailMessages] = useState(false)
  const [emailThreadError, setEmailThreadError] = useState<string | null>(null)
  const [zohoReconnectRequired, setZohoReconnectRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  const [selectedProposalPackageId, setSelectedProposalPackageId] = useState<string | null>(null)
  const [selectedProposalPromotionId, setSelectedProposalPromotionId] = useState<string | null>(null)
  const [legacyProposalDiscount, setLegacyProposalDiscount] = useState<{ type: 'percent' | 'fixed'; value: number } | null>(null)
  const [proposalGuestCount, setProposalGuestCount] = useState('')
  const [proposalCalculation, setProposalCalculation] = useState<ProposalPricingCalculation | null>(null)
  const [selectedCatalogItem, setSelectedCatalogItem] = useState('')
  const [submittingInvoice, setSubmittingInvoice] = useState(false)
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

  useEffect(() => {
    proposalEditorOpenRef.current = isInvoiceModalOpen
  }, [isInvoiceModalOpen])

  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [refundingDeposit, setRefundingDeposit] = useState(false)
  const [confirmRefundModalOpen, setConfirmRefundModalOpen] = useState(false)

  // Tour scheduling + Zoho invite state
  const [isTourScheduleModalOpen, setIsTourScheduleModalOpen] = useState(false)
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
  const [selectedStageOverride, setSelectedStageOverride] = useState<string | null>(null)
  const [planningSubTab, setPlanningSubTab] = useState<'details' | 'vendors' | 'fb' | 'decor' | 'timeline' | 'files'>('details')
  const [planningEditSection, setPlanningEditSection] = useState<PlanningEditSection>(null)
  const [savingPlanningSection, setSavingPlanningSection] = useState(false)
  const [planningDraft, setPlanningDraft] = useState<Record<string, string>>({})
  const [planningColors, setPlanningColors] = useState<string[]>([])
  const [layoutDesignerOpen, setLayoutDesignerOpen] = useState(false)
  const [activeFeedTab, setActiveFeedTab] = useState<'all' | 'notes' | 'comms' | 'system'>('all')
  const [activitySearch, setActivitySearch] = useState('')
  const [activityWindow, setActivityWindow] = useState<'all' | '30d' | '90d' | 'year'>('all')
  const [visibleActivityCount, setVisibleActivityCount] = useState(ACTIVITY_BATCH_SIZE)
  const [showInternalSignals, setShowInternalSignals] = useState(false)
  const [showTaskTools, setShowTaskTools] = useState(false)
  const [textPopupOpen, setTextPopupOpen] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [leadLifecycleAction, setLeadLifecycleAction] = useState<LeadLifecycleAction | null>(null)
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false)
  const [newEventType, setNewEventType] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [newEventGuestCount, setNewEventGuestCount] = useState('')
  const [newEventPackage, setNewEventPackage] = useState('')
  const [newEventNotes, setNewEventNotes] = useState('')
  const [submittingEvent, setSubmittingEvent] = useState(false)
  const [savingLeadField, setSavingLeadField] = useState<EditableLeadField | null>(null)
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
  const [marketingEngagement, setMarketingEngagement] = useState<LeadMarketingEngagement | null>(null)
  const [loadingMarketingEngagement, setLoadingMarketingEngagement] = useState(false)
  const [marketingEngagementError, setMarketingEngagementError] = useState<string | null>(null)

  // Event Summary states
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const [summaryVenue, setSummaryVenue] = useState('')
  const [summaryStartTime, setSummaryStartTime] = useState('')
  const [summaryEndTime, setSummaryEndTime] = useState('')
  const [summarySetupTime, setSummarySetupTime] = useState('')
  const [summaryBreakdownTime, setSummaryBreakdownTime] = useState('')
  const [savingSummary, setSavingSummary] = useState(false)

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
  const eventBookings = useMemo(
    () => selectedLeadEvent ? bookings.filter((booking) => booking.lead_event_id === selectedLeadEvent.id) : bookings,
    [bookings, selectedLeadEvent],
  )
  const eventBookingIds = useMemo(() => new Set(eventBookings.map((booking) => booking.id)), [eventBookings])
  const eventInvoices = useMemo(
    () => selectedLeadEvent
      ? invoices.filter((invoice) => invoice.lead_event_id === selectedLeadEvent.id || (!invoice.lead_event_id && Boolean(invoice.booking_id && eventBookingIds.has(invoice.booking_id))))
      : invoices,
    [eventBookingIds, invoices, selectedLeadEvent],
  )
  const eventInvoiceIds = useMemo(() => new Set(eventInvoices.map((invoice) => invoice.id)), [eventInvoices])
  const eventPayments = useMemo(
    () => selectedLeadEvent
      ? payments.filter((payment) => Boolean((payment.booking_id && eventBookingIds.has(payment.booking_id)) || (payment.invoice_id && eventInvoiceIds.has(payment.invoice_id))))
      : payments,
    [eventBookingIds, eventInvoiceIds, payments, selectedLeadEvent],
  )
  const latestBooking = useMemo(() => getMostRecentBooking(eventBookings), [eventBookings])
  // Always anchor proposal/contract UI to the newest final proposal in the
  // active lead workflow. A lead can have an older completed booking, and that
  // record must never make a newer proposal look signed or delivered.
  const currentProposalInvoice = useMemo(
    // An accepted proposal can temporarily have no booking or event link
    // while the acceptance workflow finishes. Include all lead invoices so
    // that transient state cannot fall back to an unrelated legacy booking.
    () => getCurrentFinalProposal(invoices),
    [invoices],
  )
  const currentProposalBooking = useMemo(
    () => currentProposalInvoice
      ? bookings.find((booking) => booking.invoice_id === currentProposalInvoice.id) || null
      : null,
    [bookings, currentProposalInvoice],
  )
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
  }, [currentProposalBooking?.id])
  const lifecycleBooking = currentProposalInvoice ? currentProposalBooking : latestBooking
  const activeEventForDisplay = useMemo(() => {
    if (!lead) return null
    if (!selectedLeadEvent) return null
    const sharedTourReached = ['tour_confirmed', 'proposal_sent', 'booked'].includes(lead.status)
    const sharedTourCompleted = lead.tour_attendance_status === 'attended'
    return {
      ...selectedLeadEvent,
      status: selectedLeadEvent.status === 'new' && sharedTourReached ? 'tour_confirmed' as const : selectedLeadEvent.status,
      pipeline_stage: ['inquiry', 'tour'].includes(selectedLeadEvent.pipeline_stage) && sharedTourCompleted
        ? 'proposal' as const
        : selectedLeadEvent.pipeline_stage === 'inquiry' && sharedTourReached ? 'tour' as const : selectedLeadEvent.pipeline_stage,
    }
  }, [lead, selectedLeadEvent])
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
  const sharedAttachmentEmails = useMemo(
    () => emailMessages.filter((email) => email.hasAttachment).slice(0, 4),
    [emailMessages],
  )
  const hiddenActivityCount = Math.max(0, activityEntries.length - visibleActivityEntries.length)

  const activeStage = useMemo(() => {
    if (!lead) return 'inquiry'
    const steps = getLeadLifecycleSteps(lifecycleLead || lead, lifecycleBooking, currentProposalInvoice)

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
      setSummaryVenue(String(latestBooking?.metadata?.venue || metadata.venue || ''))
      const grandOpeningLead = isGrandOpeningRsvp(lead)
      setSummaryStartTime(String(latestBooking?.start_time || metadata.start_time || (grandOpeningLead ? LUXOR_GRAND_OPENING.startTime : '')))
      setSummaryEndTime(String(latestBooking?.end_time || metadata.end_time || (grandOpeningLead ? LUXOR_GRAND_OPENING.endTime : '')))
      setSummarySetupTime(String(latestBooking?.metadata?.setup_time || metadata.setup_time || ''))
      setSummaryBreakdownTime(String(latestBooking?.metadata?.breakdown_time || metadata.breakdown_time || ''))
    }
  }, [activeEventForDisplay, lead, latestBooking])

  const handleSaveSummary = async () => {
    if (!lead) return
    try {
      setSavingSummary(true)
      const durationMinutes = calculateEventDurationMinutes(summaryStartTime, summaryEndTime)
      if (latestBooking) {
        const res = await fetch('/api/bookings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: latestBooking.id,
            start_time: summaryStartTime,
            end_time: summaryEndTime,
            metadata: {
              ...latestBooking.metadata,
              venue: summaryVenue,
              setup_time: summarySetupTime,
              breakdown_time: summaryBreakdownTime,
              duration_minutes: durationMinutes,
            }
          })
        })
        if (!res.ok) throw new Error('Failed to save event summary details.')
      } else if (selectedLeadEvent) {
        const res = await fetch('/api/lead-events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedLeadEvent.id,
            inquiry_id: lead.id,
            metadata: {
              ...selectedLeadEvent.metadata,
              venue: summaryVenue,
              start_time: summaryStartTime,
              end_time: summaryEndTime,
              setup_time: summarySetupTime,
              breakdown_time: summaryBreakdownTime,
              duration_minutes: durationMinutes,
            },
          }),
        })
        if (!res.ok) throw new Error('Failed to save event summary details.')
      } else {
        const res = await fetch('/api/inquiries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: lead.id,
            metadata: {
              ...lead.metadata,
              venue: summaryVenue,
              start_time: summaryStartTime,
              end_time: summaryEndTime,
              setup_time: summarySetupTime,
              breakdown_time: summaryBreakdownTime,
              duration_minutes: durationMinutes,
            }
          })
        })
        if (!res.ok) throw new Error('Failed to save lead event summary.')
      }

      await fetchAllData(false)
      setIsEditingSummary(false)
    } catch (err) {
      console.error(err)
      notify({ title: 'Event summary not saved', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setSavingSummary(false)
    }
  }

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

  const handleEventMetadataUpdate = async (updatedMetadata: Record<string, unknown>) => {
    if (!lead || !selectedLeadEvent) return false
    const previousEvent = selectedLeadEvent
    const mergedMetadata = { ...selectedLeadEvent.metadata, ...updatedMetadata }
    setLeadEvents((current) => current.map((event) => event.id === selectedLeadEvent.id
      ? { ...event, metadata: mergedMetadata, updated_at: new Date().toISOString() }
      : event))
    try {
      const res = await fetch('/api/lead-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedLeadEvent.id, inquiry_id: lead.id, metadata: mergedMetadata }),
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
    setActiveEventId(eventId)
    setShowEventPicker(false)
    setShowActionsMenu(false)
    void persistLeadEventPreference(eventId)
  }

  const openAddEventModal = () => {
    setShowActionsMenu(false)
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
          event_type: newEventType,
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
    if (!showEventPicker && !showActionsMenu) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowEventPicker(false)
        setShowActionsMenu(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showActionsMenu, showEventPicker])

  const fetchAllData = async (showPageLoader = true, refreshEmailHistory = showPageLoader) => {
    try {
      if (showPageLoader) setLoading(true)
      setError(null)

      const leadRes = await fetch(`/api/inquiries?id=${id}`)
      if (!leadRes.ok) throw new Error('Failed to fetch lead details.')
      const leadData = await leadRes.json()
      setLead(leadData)
      if (!proposalEditorOpenRef.current) {
        const savedProposalItems = leadData.metadata?.proposalLineItems
        if (Array.isArray(savedProposalItems) && savedProposalItems.length) {
          setInvoiceItems(savedProposalItems as LuxorInvoiceLineItem[])
        }
        if (typeof leadData.metadata?.proposalTaxRate === 'number') {
          setInvoiceTaxRate(String(leadData.metadata.proposalTaxRate * 100))
        }
      }

      if (refreshEmailHistory) void fetchClientEmailThread(leadData.email || '')

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
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
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

      setNotes(notesData)
      setTasks(tasksData)
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
      setPayments(paymentsData)
      setTourEmailJobs(tourJobsData)
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

  const fetchClientEmailThread = async (email: string) => {
    if (!email) {
      setEmailMessages([])
      setEmailThreadError(null)
      setZohoReconnectRequired(false)
      return
    }

    try {
      setLoadingEmailMessages(true)
      setEmailThreadError(null)
      setZohoReconnectRequired(false)
      const response = await fetch(`/api/email/inbox?limit=1000&email=${encodeURIComponent(email)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as {
        messages?: ZohoEmailMessage[]
        error?: string
        reconnectRequired?: boolean
      }
      if (!response.ok) {
        setZohoReconnectRequired(Boolean(payload.reconnectRequired))
        throw new Error(payload.error || 'Unable to load email history.')
      }
      setEmailMessages(payload.messages || [])
    } catch (threadError) {
      setEmailMessages([])
      const message = threadError instanceof Error ? threadError.message : 'Unable to load email history.'
      setEmailThreadError(message.includes('reconnected with email search permission') ? 'The mailbox needs to be reconnected in Settings.' : 'Email history could not be refreshed. Please try again.')
      setZohoReconnectRequired((current) => current || message.includes('reconnected with email search permission'))
    } finally {
      setLoadingEmailMessages(false)
    }
  }

  const handleStatusChange = async (newStatus: LuxorInquiry['status']) => {
    if (!lead) return false
    if (newStatus === 'closed_lost') {
      setLeadLifecycleAction('deal-lost')
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

    const normalizedValue = normalizeLeadFieldValue(field, nextValue)

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

      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [fieldKey]: normalizedValue }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update lead detail.')
      }

      const updated = payload as LuxorInquiry
      setLead(updated)
      if (fieldKey === 'email') {
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

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteContent.trim()) return
    try {
      setSubmittingNote(true)
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

  const openProposalBuilder = (invoice?: LuxorInvoice | null) => {
    proposalEditorOpenRef.current = true
    setEditingInvoiceId(invoice?.id || null)
    setProposalCalculation(null)

    const savedContext = invoice?.proposal_context || null
    const eventDate = String(savedContext?.event_date || activeEventForDisplay?.target_date || lead?.target_date || '')
    const guestCount = asProposalNumber(savedContext?.expected_guest_count, activeEventForDisplay?.guest_count, lead?.guest_count)
    const requestedRentalPeriod = String(savedContext?.rental_period || activeEventForDisplay?.metadata?.rental_period || 'evening')
    const rentalPeriod = requestedRentalPeriod === 'morning' || requestedRentalPeriod === 'full_day'
      ? requestedRentalPeriod
      : 'evening'
    const packageId = normalizeProposalPackageId(
      savedContext?.package_id
      || invoice?.proposal_context?.package_name
      || activeEventForDisplay?.package_interest
      || lead?.package_interest,
    ) || 'rent_only'
    const savedSelection = asProposalRecord(savedContext?.pricing_selection) || {}
    const savedPromotionId = String(savedSelection.promotionId || savedSelection.promotion_id || savedContext?.promotionId || savedContext?.promotion_id || '').trim() || null
    const nextContext: ProposalBuilderContext = {
      version: asProposalNumber(savedContext?.version, 1) || 1,
      event_type: String(savedContext?.event_type || activeEventForDisplay?.event_type || lead?.event_type || 'Event Booking'),
      ...(eventDate ? { event_date: eventDate } : {}),
      ...(guestCount ? { expected_guest_count: guestCount } : {}),
      rental_period: rentalPeriod,
      package_id: packageId,
      package_name: String(savedContext?.package_name || packageId.replace('_', ' ')),
      ...savedContext,
      pricing_selection: { ...savedSelection },
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
      setInvoiceDesc(invoice.description?.trim() || defaultProposalTitle(lead?.full_name, activeEventForDisplay?.event_type || lead?.event_type || 'Event'))
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
      const savedItems = activeEventForDisplay?.metadata?.proposalLineItems
      setInvoiceDesc(defaultProposalTitle(lead?.full_name, activeEventForDisplay?.event_type || lead?.event_type || 'Event'))
      setInvoiceDueDate('')
      setInvoiceOfferExpiryTime(DEFAULT_OFFER_EXPIRY_TIME)
      setInvoiceDiscountType('percent')
      setInvoiceDiscountValue('0')
      setInvoiceDiscountPercent('0')
      setInvoiceItems(Array.isArray(savedItems) && savedItems.length
        ? savedItems as LuxorInvoiceLineItem[]
        : [{ description: '', quantity: 1, unitPrice: 0, total: 0 }])
      setInvoiceNotes('')
      setInvoiceTaxRate(DEFAULT_TEXAS_SALES_TAX_RATE_PERCENT)
      setLegacyProposalDiscount(null)
    }

    setIsInvoiceModalOpen(true)
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
        ...(currentPaymentPlan && !calculatedPaymentPlan ? { payment_plan: currentPaymentPlan } : {}),
        package_id: activePackageId || normalizeProposalPackageId(calculationContext.package_id) || current?.package_id,
        pricing_selection: {
          ...currentSelection,
          ...calculatedSelection,
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
    const eventDate = String(context.event_date || calculationContext.event_date || activeEventForDisplay?.target_date || lead?.target_date || '')
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
    const promotionId = selectedProposalPromotionId
      || String(contextSelection?.promotionId || contextSelection?.promotion_id || calculationSelection?.promotionId || calculationSelection?.promotion_id || '').trim()

    return {
      packageId,
      eventDate,
      guestCount,
      eventType: activeEventForDisplay?.event_type || lead?.event_type || context.event_type || null,
      rentalPeriod,
      addOns,
      ...(hasProposalRemovedServiceIds(contextSelection) || removedServiceIds.length ? { removedServiceIds } : {}),
      ...(promotionId ? { promotionId } : {}),
      taxRate: invoiceTaxRate.trim() === '' ? null : Math.max(0, Number(invoiceTaxRate) || 0),
      ...(customItems ? { customItems } : {}),
      ...(paymentPlan ? { paymentPlan } : {}),
    }
  }

  const handleCreateInvoice = async (action: 'save' | 'email') => {
    if (!lead) return

    try {
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
      const updateExistingDraft = Boolean(editingInvoice && !createRevision)
      const proposalSelection = buildProposalSelection()
      const selectedPackage = proposalCalculation?.packages?.find((candidate) => (
        normalizeProposalPackageId(candidate.id) === normalizeProposalPackageId(selectedProposalPackageId || proposalContext?.package_id)
      ))
      const displayedFinalPrice = asProposalNumber(
        selectedPackage?.finalEventPrice,
        proposalCalculation?.context?.final_event_price,
        proposalContext?.final_event_price,
      )

      const res = await fetch('/api/invoices', {
        method: updateExistingDraft ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(updateExistingDraft && editingInvoiceId ? { id: editingInvoiceId } : {}),
          ...(createRevision && editingInvoice ? { supersedes_invoice_id: editingInvoice.id } : {}),
          client_name: lead.full_name,
          event_type: activeEventForDisplay?.event_type || lead.event_type || 'Event Booking',
          description: invoiceDesc || (editingInvoice ? editingInvoice.description || null : defaultProposalTitle(lead.full_name, activeEventForDisplay?.event_type || lead.event_type || 'Event')),
          line_items: invoiceItems,
          tax_rate: taxRate,
          due_date: invoiceDueDate || null,
          offer_expires_at: offerExpiresAt,
          proposal_selection: proposalSelection,
          inquiry_id: id,
          lead_event_id: selectedLeadEvent?.id || null,
          notes: invoiceNotes || null,
        }),
      })

      const responseBody = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(responseBody.error || ('Failed to ' + (updateExistingDraft ? 'update' : 'create') + ' final proposal.'))
      const invoice = responseBody as LuxorInvoice
      setInvoices((prev) => updateExistingDraft
        ? prev.map((item) => item.id === invoice.id ? invoice : item)
        : [invoice, ...prev])
      await (selectedLeadEvent
        ? handleEventMetadataUpdate({ proposalLineItems: invoice.line_items, proposalTaxRate: Number(invoice.tax_rate || 0) })
        : handleMetadataUpdate({ proposalLineItems: invoice.line_items, proposalTaxRate: Number(invoice.tax_rate || 0) }))
      setIsInvoiceModalOpen(false)
      setEditingInvoiceId(null)
      const displayedPriceLabel = displayedFinalPrice === undefined ? 'The final price' : formatMoney(displayedFinalPrice)
      notify({
        title: createRevision ? 'Final proposal revision saved' : updateExistingDraft ? 'Final proposal updated' : 'Final proposal saved',
        description: createRevision
          ? displayedPriceLabel + ' was saved as a new revision; the previous final proposal remains in the audit history.'
          : displayedPriceLabel + ' is ready to review or publish.',
        variant: 'success',
      })
      if (action === 'email') await handleSendFinalProposal(invoice)
      if (action === 'save') setProposalDeliveryPreview({ invoice, initialTab: 'email' })
      if (createRevision) void fetchAllData(false)
    } catch (err) {
      console.error(err)
      notify({ title: 'Final proposal not saved', description: err instanceof Error ? err.message : 'Review the proposal fields and try again.', variant: 'error' })
    } finally {
      setSubmittingInvoice(false)
    }
  }

  const createFlowNote = async (content: string, noteType: LuxorNote['note_type'] = 'note') => {
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

  const openTourScheduleModal = () => {
    if (!lead) return
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

  const handleSendFinalProposal = async (invoice: LuxorInvoice) => {
    try {
      setSendingInvoiceId(invoice.id)
      const response = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'proposal' }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'The final proposal could not be sent.')
      await fetchAllData(false)
      notify({
        title: 'Final proposal sent',
        description: 'The client can accept the final proposal. Acceptance automatically sends the Event Agreement; Stripe is emailed only after signature.',
        variant: 'success',
      })
    } catch (error) {
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
        body: JSON.stringify({ inquiryId: lead.id, leadEventId: selectedLeadEvent?.id, action: 'attendance', attendance }),
      })
      const payload = await response.json().catch(() => ({}))
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
      notify({
        title: attendance === 'attended' ? 'Tour marked complete' : 'Tour marked no show',
        description: attendance === 'no_show' ? 'A reschedule email is queued for three hours from now.' : 'Any pending no-show follow-up was cancelled.',
        variant: 'success',
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
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: id,
          action: 'schedule-tour',
          tourDate: tourScheduleDate,
          tourTime: tourScheduleTime,
          durationMinutes: Number(tourScheduleDuration),
          meetingType: tourMeetingType,
          clientFacingNotes: tourClientFacingNotes,
          tourAssignees,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'The tour could not be scheduled.')

      setLead(payload.inquiry as LuxorInquiry)
      setTourEmailJobs([payload.confirmationJob, ...(payload.reminderJobs || [])].filter(Boolean) as LuxorEmailJob[])
      setIsTourScheduleModalOpen(false)
      await fetchAllData(false)
      notify({
        title: 'Tour scheduled and invite sent',
        description: `${payload.reminderJobs?.length || 0} reminder email${payload.reminderJobs?.length === 1 ? '' : 's'} queued automatically.`,
        variant: 'success',
      })
    } catch (err) {
      notify({ title: 'Tour not scheduled', description: err instanceof Error ? err.message : 'Please try again.', variant: 'error' })
    } finally {
      setSchedulingTour(false)
    }
  }

  const handleRecordManualPayment = async (booking: LuxorBooking, paymentKind: 'deposit' | 'final') => {
    const preferredMethod = ((booking.metadata?.client_payment_preference as { method?: string } | undefined)?.method || 'manual').toLowerCase()
    try {
      setUpdatingStatus(true)
      const paymentRes = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          paymentKind,
          paymentMethod: preferredMethod,
        }),
      })
      const paymentPayload = await paymentRes.json().catch(() => ({})) as {
        error?: string
        alreadyPaid?: boolean
        payment?: { amount?: number }
        invoice?: LuxorInvoice
      }
      if (!paymentRes.ok) throw new Error(paymentPayload.error || 'Failed to record payment.')
      await fetchAllData(false)
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

    if (requestedTab && ['overview', 'activity', 'tasks', 'vendors', 'timeline', 'documents', 'messages', 'notes'].includes(requestedTab)) {
      setActiveLeadTab(requestedTab as LeadDetailTab)
      if (requestedTab === 'tasks') {
        setShowTaskTools(true)
      }
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
  const activeEventMetadata = activeEventForDisplay?.metadata || lead.metadata || {}
  const proposalInvoice = currentProposalInvoice
  const proposalBooking = proposalInvoice
    ? bookings.find((booking) => booking.invoice_id === proposalInvoice.id) || null
    : null
  const agreementBooking = proposalInvoice ? proposalBooking : latestBooking
  const bookingContractAmount = Number(agreementBooking?.contract_total || 0)
  const bookingDepositAmount = Number(agreementBooking?.deposit_required || 0)
  const depositInvoice = sortedInvoices.find((invoice) => invoice.invoice_kind === 'deposit')
  const finalBalanceInvoice = sortedInvoices.find((invoice) => invoice.invoice_kind === 'final_balance')
  const refundableSecurityDepositAmount = Number(depositInvoice?.line_items.find((item) => item.paymentBucket === 'security_deposit' || item.category === 'Security Deposit' || /refundable security deposit/i.test(item.description))?.total || agreementBooking?.security_deposit_amount || LUXOR_DEFAULT_SECURITY_DEPOSIT)
  const initialBookingPaymentAmount = Number(depositInvoice?.line_items.find((item) => item.paymentBucket === 'venue' || /initial booking payment/i.test(item.description))?.total || bookingDepositAmount)
  const initialPaymentInvoiceTotal = Number(depositInvoice?.total || (initialBookingPaymentAmount + refundableSecurityDepositAmount))
  const depositPaidTotal = depositInvoice ? getInvoicePaidTotal(depositInvoice.id) : getPaidTotal(sortedPayments, 'deposit')
  const depositBalance = Math.max(0, initialPaymentInvoiceTotal - depositPaidTotal)
  const finalPaymentTotal = Number(finalBalanceInvoice?.total || Math.max(0, bookingContractAmount - initialBookingPaymentAmount))
  const finalPaymentBalance = finalBalanceInvoice
    ? getInvoiceBalance(finalBalanceInvoice)
    : Math.max(0, finalPaymentTotal - getPaidTotal(sortedPayments, 'final'))
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
  const proposalDeliveryConfirmed = proposalDeliveryState === 'delivered'
  const proposalDeliveryPrepared = proposalDeliveryState === 'prepared'
  const proposalSentAt = proposalInvoice?.proposal_sent_at || (proposalDeliveryConfirmed ? (
    proposalDeliveryEmail && typeof proposalDeliveryEmail === 'object' && !Array.isArray(proposalDeliveryEmail)
      ? typeof (proposalDeliveryEmail as Record<string, unknown>).delivery_sent_at === 'string'
        ? (proposalDeliveryEmail as Record<string, unknown>).delivery_sent_at as string
        : proposalInvoice?.updated_at || null
      : proposalInvoice?.updated_at || null
  ) : null) || (proposalInvoice?.status === 'sent' ? proposalInvoice.updated_at : null)
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
  const eventDetails: Array<{
    label: string
    value: string
    editValue: string
    copyValue: string
    field: EditableLeadField
    icon: React.ReactNode
    inputType?: LeadDetailInputType
    placeholder?: string
    isMono?: boolean
    options?: { value: string; label: string }[]
  }> = [
    {
      label: 'Event Type',
      value: activeEventForDisplay?.event_type || lead.event_type || 'Quinceañera',
      editValue: activeEventForDisplay?.event_type || lead.event_type || '',
      copyValue: activeEventForDisplay?.event_type || lead.event_type || '',
      field: 'event_type',
      icon: <Sparkles size={14} />,
      placeholder: 'Wedding, Quinceañera, birthday...',
    },
    {
      label: 'Guest Count',
      value: (activeEventForDisplay?.guest_count ?? lead.guest_count) ? `${activeEventForDisplay?.guest_count ?? lead.guest_count} guests` : 'Unspecified',
      editValue: (activeEventForDisplay?.guest_count ?? lead.guest_count) ? String(activeEventForDisplay?.guest_count ?? lead.guest_count) : '',
      copyValue: (activeEventForDisplay?.guest_count ?? lead.guest_count) ? String(activeEventForDisplay?.guest_count ?? lead.guest_count) : '',
      field: 'guest_count',
      icon: <Users size={14} />,
      inputType: 'number',
      placeholder: 'Guest count',
    },
    {
      label: 'Target Date',
      value: (activeEventForDisplay?.target_date || lead.target_date) ? formatDisplayDate(activeEventForDisplay?.target_date || lead.target_date || '') : 'TBD',
      editValue: activeEventForDisplay?.target_date || lead.target_date || '',
      copyValue: activeEventForDisplay?.target_date || lead.target_date || '',
      field: 'target_date',
      icon: <Calendar size={14} />,
      inputType: 'date',
    },
    {
      label: 'Package Interest',
      value: activeEventForDisplay?.package_interest || lead.package_interest || 'Not selected',
      editValue: activeEventForDisplay?.package_interest || lead.package_interest || '',
      copyValue: activeEventForDisplay?.package_interest || lead.package_interest || '',
      field: 'package_interest',
      icon: <Briefcase size={14} />,
      inputType: 'select',
      placeholder: 'Package or room interest',
      options: LUXOR_PACKAGE_INTEREST_OPTIONS,
    },
    {
      label: 'Preferred Tour Date',
      value: lead.preferred_tour_date ? formatDisplayDate(lead.preferred_tour_date) : 'No tour requested',
      editValue: lead.preferred_tour_date || '',
      copyValue: lead.preferred_tour_date || '',
      field: 'preferred_tour_date',
      icon: <Calendar size={14} />,
      inputType: 'date',
    },
    {
      label: 'Preferred Tour Time',
      value: lead.preferred_tour_time || 'N/A',
      editValue: normalizeTimeInputValue(lead.preferred_tour_time),
      copyValue: lead.preferred_tour_time || '',
      field: 'preferred_tour_time',
      icon: <Clock size={14} />,
      inputType: 'time',
    },
  ]
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

  if (lead.status === 'closed_lost') {
    pushRecommendedAction({
      icon: <ArrowLeft size={15} />,
      label: 'Re-open lead',
      detail: 'Reopens the lead only; cancelled proposals and contracts stay cancelled',
      onClick: () => handleGuidedStatusChange('new'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (lead.status === 'new') {
    pushRecommendedAction({
      icon: <Phone size={15} />,
      label: 'Mark contacted',
      detail: 'Log the first outreach touch',
      onClick: () => handleGuidedStatusChange('contacted'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (lead.status === 'contacted' || lead.status === 'tour_requested') {
    pushRecommendedAction({
      icon: <Calendar size={15} />,
      label: 'Schedule tour & send invite',
      detail: 'Create the calendar invite, confirmation, and reminders',
      onClick: openTourScheduleModal,
      disabled: !lead.email,
    })
  } else if (lead.status === 'tour_confirmed') {
    pushRecommendedAction({
      icon: <FileSignature size={15} />,
      label: 'Mark proposal sent',
      detail: 'Use after sending pricing',
      onClick: () => handleGuidedStatusChange('proposal_sent'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (lead.status === 'proposal_sent') {
    pushRecommendedAction({
      icon: <MessageSquare size={15} />,
      label: 'Follow up on proposal',
      detail: 'Nudge for a decision or objections',
      onClick: () => {
        setNoteType('call_log')
        scrollToSection('lead-activity')
      },
    })
  } else if (lead.status === 'booked') {
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
      detail: lead.email ? 'Create the calendar invite, confirmation, and reminders' : 'Add an email address first',
      onClick: openTourScheduleModal,
      disabled: !lead.email,
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
    activeFeedTab === 'notes'
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
    { id: 'tasks', label: 'Tasks', count: pendingTaskCount },
    { id: 'vendors', label: 'Vendors', count: (lead?.metadata?.vendors as unknown[])?.length || 0 },
    { id: 'timeline', label: 'Timeline', count: (lead?.metadata?.timeline as unknown[])?.length || 0 },
    { id: 'documents', label: 'Documents', count: documents.length + signatureRequests.length },
    { id: 'messages', label: 'Messages', count: activityCounts.comms },
    { id: 'notes', label: 'Notes', count: activityCounts.notes },
  ]
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

  const displayEventType = activeEventForDisplay?.event_type || lead.event_type || 'Event'
  const displayEventDate = activeEventForDisplay?.target_date || lead.target_date
  const displayGuestCount = activeEventForDisplay?.guest_count ?? lead.guest_count

  return (
    <PortalPageFrame className="max-w-[1560px] !gap-0 pb-24 sm:pb-0">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <Link href="/portal/leads" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)]">
          <ArrowLeft size={13} /> Back to Leads & Clients
        </Link>
        {lead.status === 'tour_confirmed' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#f1d27a]">
            <Calendar size={12} /> Tour scheduled
          </span>
        ) : <PortalStatusBadge status={lead.status} />}
      </div>

      <section className="overflow-hidden rounded-t-2xl border border-b-0 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl shadow-black/10">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-6">
          <div className="flex min-w-0 gap-4">
            <div className="relative shrink-0">
              <PortalContactAvatar
                name={lead.full_name}
                avatarUrl={lead.metadata?.avatar_url as string | null}
                inquiryId={lead.id}
                size="2xl"
                className="shadow-xl shadow-black/10"
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
                className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] text-[#caa24c] shadow-md"
                title={`${displayEventType} event`}
                aria-label={`${displayEventType} event`}
              >
                <EventTypeIcon eventType={displayEventType} />
              </div>
            </div>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="break-words font-serif text-2xl font-semibold leading-tight text-[color:var(--portal-text)] sm:text-4xl">{lead.full_name}</h1>
                {lead.email && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleToggleMarketing}
                      disabled={togglingMarketing}
                      className="group relative flex h-[18px] w-[18px] shrink-0 select-none items-center justify-center focus:outline-none disabled:opacity-50 cursor-pointer"
                      title={isSubscribed ? "Remove from marketing list" : "Add to marketing list"}
                    >
                      <div className="relative h-[18px] w-[18px] shrink-0">
                        {/* Background outline star */}
                        <Star size={18} className="absolute inset-0 text-zinc-650 transition-colors group-hover:text-zinc-400" />
                        
                        {/* Animated liquid fill mask star */}
                        <div 
                          className="absolute bottom-0 left-0 right-0 overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" 
                          style={{ height: isSubscribed ? '18px' : '0px' }}
                        >
                          <Star 
                            size={18} 
                            className="absolute bottom-0 left-0 text-[#caa24c] fill-[#caa24c]" 
                            style={{ width: '18px', height: '18px' }} 
                          />
                        </div>
                      </div>
                    </button>
                    {isGrandOpeningLead ? (
                      <span className="whitespace-nowrap text-[9px] font-black uppercase tracking-[0.16em] text-[#caa24c]">
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
                          className={`text-[9px] font-black uppercase tracking-[0.18em] ${
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
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 text-xs font-semibold text-[color:var(--portal-muted)]">
                {leadEvents.length ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEventPicker((current) => !current)}
                      aria-expanded={showEventPicker}
                      aria-haspopup="listbox"
                      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1 text-left text-[10px] font-black uppercase tracking-[0.08em] text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/50 hover:text-[#a8792f] dark:hover:text-[#f1d27a]"
                    >
                      <EventTypeIcon eventType={displayEventType} />
                      <span className="truncate">{displayEventType}</span>
                      <ChevronDown size={11} className="shrink-0 text-[#caa24c]" />
                    </button>
                    <AnimatePresence>
                      {showEventPicker ? (
                        <motion.div
                          initial={{ opacity: 0, y: -5, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -5, scale: 0.98 }}
                          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                          role="listbox"
                          className="portal-dropdown absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(340px,calc(100vw-3rem))] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 shadow-2xl backdrop-blur-xl"
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
                ) : <span>{displayEventType}</span>}
                <span className="text-zinc-700 font-normal select-none">•</span>
                <span>{displayEventDate ? formatDisplayDate(displayEventDate) : 'Date TBD'}</span>
                <span className="text-zinc-700 font-normal select-none">•</span>
                <span>{displayGuestCount ? `${displayGuestCount} Guests` : 'Guest count open'}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Captured via <span className="capitalize">{formatSourceLabel(lead)}</span> on {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <PortalSmsConsentBadge phone={lead.phone} />
            {lead.email && (
              <button 
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead } }))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                aria-label="Email client"
                title="Email client"
              >
                <Mail size={15} />
              </button>
            )}
            {lead.phone && (
              <button
                type="button"
                onClick={() => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id })}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                aria-label="Call client"
                title="Call client"
              >
                <Phone size={15} />
              </button>
            )}
            {lead.phone && (
              <button
                type="button"
                onClick={() => setTextPopupOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                aria-label="Text client"
                title="Text client"
              >
                <MessageSquare size={15} />
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowActionsMenu((current) => !current)}
                aria-expanded={showActionsMenu}
                aria-haspopup="menu"
                aria-label="More lead options"
                title="More options"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/50 hover:bg-[#caa24c]/10 hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
              >
                <MoreVertical size={16} />
              </button>
              <AnimatePresence>
                {showActionsMenu ? (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowActionsMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -5, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.98 }}
                      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                      role="menu"
                      data-portal-dropdown="true"
                      className="portal-dropdown absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 shadow-2xl backdrop-blur-xl"
                    >
                      <button type="button" role="menuitem" onClick={openAddEventModal} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                        <Plus size={13} className="text-[#caa24c]" />
                        <span>Add event</span>
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); openProposalBuilder() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                        <ReceiptText size={13} className="text-[#caa24c]" />
                        <span>Create invoice for selected event</span>
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); setActiveLeadTab('documents') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                        <FileText size={13} className="text-[#caa24c]" />
                        <span>View invoices & documents</span>
                      </button>
                      {hasCancellableTour(lead) ? (
                        <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); setLeadLifecycleAction('cancel-tour') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/15 hover:text-[#a8792f] dark:hover:text-[#f1d27a]">
                          <Calendar size={13} className="text-[#caa24c]" />
                          <span>Cancel scheduled tour</span>
                        </button>
                      ) : null}
                      {lead.status !== 'closed_lost' && lead.pipeline_stage !== 'closed_lost' ? (
                        <div className="mt-1 border-t border-[color:var(--portal-border)] pt-1.5">
                          <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); setLeadLifecycleAction('deal-lost') }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-red-600 transition-colors hover:border-red-500/45 hover:bg-red-500/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35 dark:text-red-300">
                            <AlertCircle size={13} />
                            <span>Mark deal lost</span>
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

        <div className="border-t border-[color:var(--portal-border)] px-5 py-4 lg:px-6">
          <LeadLifecycleRail
            lead={lifecycleLead || lead}
            bookings={eventBookings}
            latestBooking={agreementBooking}
            latestInvoice={proposalInvoice}
            agreementDeliveryConfirmed={agreementDeliveryConfirmed}
            agreementDeliveryPending={agreementDeliveryPending}
            isSaving={updatingStatus}
            activeStageId={selectedStageOverride || activeStage}
            onStepClick={(stageId) => {
              setSelectedStageOverride(stageId)
              setActiveLeadTab('overview')
            }}
          />
        </div>
      </section>

      <div
        className="sticky -top-4 z-30 -mt-px overflow-hidden rounded-b-2xl border border-[color:var(--portal-border)] shadow-lg shadow-black/10 sm:-top-6 lg:-top-10"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--portal-bg) 97%, transparent)',
          backdropFilter: 'blur(50px)',
          WebkitBackdropFilter: 'blur(50px)',
        }}
      >
        <div className="portal-scrollbar overflow-x-auto bg-transparent px-4">
          <div className="relative flex min-w-max gap-5">
            <span
              className="absolute bottom-0 h-0.5 rounded-full bg-[#caa24c] transition-[left,width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
              style={{ left: tabIndicator.left, width: tabIndicator.width }}
            />
            {tabItems.map((item) => {
              const isActive = activeLeadTab === item.id
              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    tabButtonRefs.current[item.id] = node
                  }}
                  type="button"
                  onClick={() => {
                    setActiveLeadTab(item.id)
                    if (item.id === 'messages') setActiveFeedTab('comms')
                    if (item.id === 'notes') setActiveFeedTab('notes')
                    if (item.id === 'activity') setActiveFeedTab('all')
                    if (item.id === 'tasks') setShowTaskTools(true)
                  }}
                  className={`relative inline-flex shrink-0 items-center gap-2 px-0 py-3 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                    isActive
                      ? 'text-[#a8792f]'
                      : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  {item.label}
                  {typeof item.count === 'number' ? (
                    <span className={`rounded-full px-1.5 py-0.5 font-mono text-[8px] ${isActive ? 'bg-[#caa24c]/12 text-[#a8792f]' : 'bg-black/5 text-[color:var(--portal-muted)]'}`}>
                      {item.count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {activeLeadTab === 'overview' ? (
        <div className="mt-3 grid grid-cols-1 gap-6 pb-12 sm:pb-16 lg:sticky lg:top-[3.25rem] lg:h-[calc(100dvh-7.25rem)] lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:pb-0">
          {/* Left Column (Columns 1 & 2): Dossier main sections */}
          <div className="space-y-6 px-2.5 pt-2 lg:col-span-2 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-3 lg:pt-2 lg:pb-8 lg:[scrollbar-gutter:stable] portal-scrollbar">
            
            {/* Stage-specific Content Router */}
            {(() => {
              const currentStage = selectedStageOverride || activeStage
              
              if (currentStage === 'inquiry') {
                return (
                  <>
                    {/* Next Move */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
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
                            <p className="mt-1 text-[10px] font-bold text-emerald-400">High / Hot</p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 xl:justify-end">
                          <button
                            type="button"
                            onClick={openTourScheduleModal}
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
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/5 text-[#d8b568] transition-colors hover:bg-[#caa24c]/10 hover:text-[#f1d27a] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <CheckCircle2 size={15} className={updatingStatus ? 'animate-pulse' : ''} />
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* Event Details */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Event Details</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <div className="space-y-1">
                          {eventDetails.slice(0, 3).map((item) => (
                            <DetailItem
                              key={item.label}
                              icon={item.icon}
                              label={item.label}
                              value={item.value}
                              editValue={item.editValue}
                              copyValue={item.copyValue}
                              inputType={item.inputType}
                              placeholder={item.placeholder}
                              isMono={item.isMono}
                              isSaving={savingLeadField === item.field}
                              onCommit={(value) => handleLeadFieldUpdate(item.field, value)}
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
                              copyValue={item.copyValue}
                              inputType={item.inputType}
                              placeholder={item.placeholder}
                              isMono={item.isMono}
                              isSaving={savingLeadField === item.field}
                              onCommit={(value) => handleLeadFieldUpdate(item.field, value)}
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
                                <p className="text-[9px] uppercase font-bold text-zinc-500">Target Budget</p>
                                <p className="font-semibold text-white mt-0.5">{tourBudget || 'Not captured'}</p>
                              </div>
                              <div>
                                <p className="text-[9px] uppercase font-bold text-zinc-500">Guests on Tour</p>
                                <p className="font-semibold text-zinc-300 mt-0.5">{tourGuests || 'None specified'}</p>
                              </div>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase font-bold text-zinc-500">Catering Preferences</p>
                              <p className="font-semibold text-zinc-300 mt-0.5">{cateringPreferences || 'Not captured'}</p>
                            </div>
                          </div>
                          <div className="border-t sm:border-t-0 sm:border-l border-[color:var(--portal-border)] pt-3.5 sm:pt-0 sm:pl-4 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Intake / Specific Requirements</p>
                            <p className="text-zinc-400 italic leading-relaxed mt-0.5">&ldquo;{tourNotes || 'No tour notes captured yet.'}&rdquo;</p>
                          </div>
                        </div>
                      )}
                    </section>

                    {/* Recent Activity */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Recent Activity</p>
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
                          <p className="text-xs text-zinc-500 italic py-4">No recent activity logged yet.</p>
                        ) : (
                          allActivityEntries.slice(0, 5).map((entry) => {
                            const isEmail = entry.kind === 'email'
                            const isCall = entry.kind === 'call'
                            return (
                              <div key={entry.id} className={`group relative flex items-center justify-between rounded-lg border-b border-zinc-100/5 px-2 py-2 dark:border-zinc-850/50 last:border-0 transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${isEmail ? 'cursor-pointer hover:-translate-y-px hover:bg-[#caa24c]/10 hover:shadow-sm hover:shadow-[#caa24c]/10' : 'hover:bg-[color:var(--portal-soft)]'}`}>
                                {isEmail ? (
                                  <Link href={emailReaderUrl(entry.email)} aria-label={`Open email: ${decodeHtmlEntities(entry.email.subject)}`} className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40" />
                                ) : null}
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105 ${
                                    isEmail
                                      ? 'bg-purple-500/10 text-purple-400' 
                                      : isCall || entry.note.note_type === 'call_log'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : entry.note.note_type === 'email_log'
                                      ? 'bg-purple-500/10 text-purple-400'
                                      : 'bg-zinc-500/10 text-zinc-500'
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
                                  <span className="text-[10px] font-mono text-zinc-500 transition-transform duration-200 group-hover:-translate-x-0.5">
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

                    {/* RSVP / Inquiry Message */}
                    <div className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl luxor-soft-enter" id="lead-messages">
                      <h4 className="mb-3 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
                        {isGrandOpeningLead ? 'RSVP Notes Payload' : 'Inquiry Message Payload'}
                      </h4>
                      <p className="text-xs leading-relaxed text-zinc-300 font-medium italic">
                        &ldquo;{lead.message || 'No additional message was submitted.'}&rdquo;
                      </p>
                    </div>

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
                    {/* Next Move */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <Calendar size={18} />
                          </span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              {tourDisplayStatus(lead) === 'Confirmed' ? 'Conduct the venue tour' : tourDisplayStatus(lead) === 'Requested' ? 'Accept the tour request' : 'Schedule a venue tour'}
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              {tourDisplayStatus(lead) === 'Confirmed' ? 'Show the space, answer questions, and capture what happens next.' : 'Choose a date and time so the client receives the correct confirmation and reminders.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={openTourScheduleModal}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a8792f] dark:text-[#f1d27a] hover:bg-[#caa24c]/20 transition-all cursor-pointer"
                          >
                            <Calendar size={13} /> {tourDisplayStatus(lead) === 'Requested' ? 'Accept Tour Request' : tourDisplayStatus(lead) === 'Confirmed' ? 'Reschedule' : 'Schedule Tour'}
                          </button>
                        </div>
                      </div>
                    </section>

                    {/* Row 1: Tour Details & Tour Attendance */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Tour Details */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Tour Details</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Tour Date</span>
                              <span className="font-bold text-white">{lead.preferred_tour_date ? formatDisplayDate(lead.preferred_tour_date) : 'Not scheduled'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Tour Time</span>
                              <span className="font-bold text-white">{lead.preferred_tour_time || '3:00 PM'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Assigned To</span>
                              <span className="font-bold text-white">{Array.isArray(lead.metadata?.tour_assignees) && lead.metadata.tour_assignees.length ? lead.metadata.tour_assignees.join(', ') : String(lead.metadata?.tour_coordinator || 'Not assigned')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Location</span>
                              <span className="font-bold text-white">Luxor at Las Palmas Events</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Status</span>
                              <span className="rounded bg-[#caa24c]/10 text-[#a8792f] border border-[#caa24c]/20 px-2 py-0.5 text-[9px] font-bold uppercase">{tourDisplayStatus(lead)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 border-t border-[color:var(--portal-border)] pt-4">
                          {tourDisplayStatus(lead) === 'Confirmed' ? (
                            <span className="mb-3 block rounded-lg border border-emerald-500/20 bg-emerald-500/10 py-1.5 text-center text-[9px] font-black uppercase text-emerald-400">Tour Confirmed</span>
                          ) : null}
                          {!['Completed', 'Cancelled'].includes(tourDisplayStatus(lead)) ? (
                            <button type="button" onClick={() => handleTourAttendanceAction('attended')} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#caa24c] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-md shadow-[#caa24c]/15 transition-colors hover:bg-[#dfbd68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">Mark Complete</button>
                          ) : null}
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <button type="button" onClick={openTourScheduleModal} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-3 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:text-[color:var(--portal-text)]">Reschedule</button>
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
                                  <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Tour Team</label>
                                  <div className="flex flex-wrap gap-2">
                                    {['Arianna', 'Carlos', 'Alex'].map((name) => {
                                      const selected = tourAssignees.includes(name)
                                      return (
                                        <button key={name} type="button" onClick={() => setTourAssignees((current) => selected ? current.filter((item) => item !== name) : [...current, name])} className={`rounded border px-2.5 py-1.5 text-[9px] font-black uppercase ${selected ? 'border-[#caa24c]/50 bg-[#caa24c]/15 text-[#a8792f]' : 'border-[color:var(--portal-border)] text-zinc-500'}`}>
                                          {name}
                                        </button>
                                      )
                                    })}
                                    <input value={tourAssigneeCustom} onChange={(event) => setTourAssigneeCustom(event.target.value)} placeholder="Custom" className="min-w-24 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1.5 text-[10px] text-[color:var(--portal-text)] outline-none" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Primary Attendee</label>
                                    <input
                                      type="text"
                                      disabled
                                      value={lead.full_name}
                                      className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-zinc-500 cursor-not-allowed outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Guests / Additional Attendees</label>
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
                                    <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Catering & Bar Preferences</label>
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
                                  <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Tour Notes / Feedback</label>
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
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Tour Attendance</p>
                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#caa24c]" />
                                      <span className="font-bold text-white">{lead.full_name} <span className="text-zinc-500 font-medium">(Primary)</span></span>
                                    </div>
                                    {tourGuests ? (
                                      <div className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                                        <span className="font-bold text-zinc-300">{tourGuests} <span className="text-zinc-500 font-medium">(Guest)</span></span>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-zinc-500">Target Budget</p>
                                    <p className="text-xs font-semibold text-white mt-0.5">{tourBudget || 'Not captured'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-zinc-500">Catering / Bar</p>
                                    <p className="text-xs font-semibold text-zinc-300 mt-0.5 truncate">{cateringPreferences || 'Not captured'}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="border-t sm:border-t-0 sm:border-l border-[color:var(--portal-border)] pt-3 sm:pt-0 sm:pl-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Tour Notes & Prep</p>
                                <p className="text-xs text-zinc-400 italic leading-relaxed">
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
                      {sharedAttachmentEmails.length ? (
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
                                  {email.summary && (
                                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[color:var(--portal-muted)]">{decodeHtmlEntities(email.summary)}</p>
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
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
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
                    </section>

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
                              isCurrent ? 'border-[#caa24c] text-[#caa24c]' : 'border-transparent text-zinc-500 hover:text-white'
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
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Event Information</p>
                              <button type="button" onClick={() => beginPlanningEdit('event')} className="text-[10px] font-bold uppercase text-[#caa24c] hover:text-[#f1d27a]">Edit</button>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Event Date</span>
                              <span className="font-bold text-white">{latestBooking?.event_date ? formatDisplayDate(latestBooking.event_date) : activeEventForDisplay?.target_date ? formatDisplayDate(activeEventForDisplay.target_date) : 'Date not set'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Event Time</span>
                                <span className="font-bold text-white">{summaryStartTime && summaryEndTime ? `${formatTimeString(summaryStartTime)} – ${formatTimeString(summaryEndTime)}` : 'Time not set'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Duration</span>
                                <span className="font-bold text-white">{formatEventDuration(summaryStartTime, summaryEndTime)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Event Type</span>
                                <span className="font-bold text-white">{activeEventForDisplay?.event_type || lead.event_type || 'Event type not captured'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Location</span>
                                <span className="font-bold text-white">Luxor at Las Palmas Events</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Guest Count</span>
                                <span className="font-bold text-white">{(activeEventForDisplay?.guest_count ?? lead.guest_count) ? `${activeEventForDisplay?.guest_count ?? lead.guest_count} Expected Guests` : 'Guest count not captured'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Theme / Style</span>
                                <span className="font-bold text-white">{String(activeEventMetadata.event_style || 'Not captured')}</span>
                              </div>
                            </div>
                          </section>

                          {/* Client Preferences */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Client Preferences</p>
                              <button type="button" onClick={() => beginPlanningEdit('preferences')} className="text-[10px] font-bold uppercase text-[#caa24c] hover:text-[#f1d27a]">Edit</button>
                            </div>
                            <div className="space-y-3 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Color Palette</span>
                                <div className="flex gap-1.5">
                                  {(Array.isArray(activeEventMetadata.color_palette) && activeEventMetadata.color_palette.length > 0 ? activeEventMetadata.color_palette.map(String) : PLANNING_COLOR_OPTIONS[0].colors).map((color) => (
                                    <span key={color} title={color} className="h-4.5 w-4.5 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                                  ))}
                                </div>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Music Style</span>
                                <span className="font-bold text-white">{String(activeEventMetadata.music_style || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Lighting</span>
                                <span className="font-bold text-white">{String(activeEventMetadata.lighting_preference || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Special Requests</span>
                                <span className="font-bold text-white">{String(activeEventMetadata.special_requests || activeEventForDisplay?.notes || lead.message || 'None captured')}</span>
                              </div>
                            </div>
                          </section>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Space & Layout */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Space & Layout</p>
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={() => beginPlanningEdit('layout')} className="text-[10px] font-bold uppercase text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">Edit details</button>
                                <button type="button" onClick={() => setLayoutDesignerOpen(true)} className="rounded-lg bg-[#caa24c] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white hover:bg-[#dfbd68]">Open layout builder</button>
                              </div>
                            </div>
                            <div className="grid grid-cols-5 gap-4">
                              <div className="col-span-2 border border-zinc-850 rounded bg-black/45 p-2 flex items-center justify-center flex-col text-zinc-600">
                                <span className="text-[8px] font-bold uppercase text-center">{PLANNING_LAYOUT_OPTIONS.find((option) => option.id === activeEventMetadata.floor_plan_layout)?.label || 'Layout not selected'}</span>
                              </div>
                              <div className="col-span-3 space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500">Head Table</span>
                                  <span className="font-bold text-white">{String(activeEventMetadata.head_table || 'Not captured')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500">Dance Floor</span>
                                  <span className="font-bold text-white">{String(activeEventMetadata.dance_floor || 'Not captured')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500">Stage</span>
                                  <span className="font-bold text-white">{String(activeEventMetadata.stage_needed || 'Not captured')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500">Other Areas</span>
                                  <span className="font-bold text-white">{String(activeEventMetadata.other_areas || 'Not captured')}</span>
                                </div>
                              </div>
                            </div>
                          </section>

                          {/* Decor Overview */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Decor Overview</p>
                              <button type="button" onClick={() => beginPlanningEdit('decor')} className="text-[10px] font-bold uppercase text-[#caa24c] hover:text-[#f1d27a]">Edit</button>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Selected Package</span>
                                <span className="font-bold text-white">{activeEventForDisplay?.package_interest || latestBooking?.package_name || lead.package_interest || 'Not selected'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Décor Style</span>
                                <span className="font-bold text-white">{String(activeEventMetadata.decor_style || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Centerpieces</span>
                                <span className="font-bold text-white">{String(activeEventMetadata.centerpieces || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Linens</span>
                                <span className="font-bold text-white">{String(activeEventMetadata.linens || 'Not captured')}</span>
                              </div>
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 mt-0.5">Additional Notes</span>
                                <span className="font-bold text-white text-right max-w-[60%]">{tourNotes || 'No planning notes captured yet.'}</span>
                              </div>
                            </div>
                          </section>
                        </div>

                        {/* Planning Checklist Summary */}
                        <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-4">Planning Checklist Progress</p>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {[
                              { label: 'Event Details', val: 'Completed', color: 'text-emerald-400' },
                              { label: 'Vendors', val: '0/5 Completed', color: 'text-zinc-500' },
                              { label: 'Food & Beverage', val: '0/4 Completed', color: 'text-zinc-500' },
                              { label: 'Décor & Design', val: '0/4 Completed', color: 'text-zinc-500' },
                              { label: 'Timeline', val: '0/3 Completed', color: 'text-zinc-500' },
                            ].map((item, idx) => (
                              <div key={idx} className="p-3 rounded-xl border border-zinc-900 bg-zinc-950/30 text-center space-y-1">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{item.label}</p>
                                <p className={`text-xs font-black uppercase ${item.color}`}>{item.val}</p>
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
                          className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] hover:bg-[#caa24c]/15"
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
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs"><Send size={18} /></span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              {!proposalInvoice ? 'Build final proposal' : !proposalSentAt && proposalPublicationBlocker ? 'Set payment plan' : proposalDeliveryPrepared ? 'Retry final proposal delivery' : !proposalSentAt ? 'Send final proposal' : !proposalAcceptedAt ? 'Await final proposal acceptance' : !agreementBooking ? 'Agreement delivery pending' : agreementBooking.contract_status !== 'signed' ? agreementDeliveryConfirmed ? 'Await agreement signature' : 'Agreement delivery pending' : depositPaidTotal <= 0 ? 'Stripe link sent after signature' : 'Date officially reserved'}
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              {!proposalInvoice ? 'Choose the event facts and package to calculate the exact price.' : !proposalSentAt && proposalPublicationBlocker ? 'The package price is already calculated. Set the owner-approved payment plan before publishing.' : proposalDeliveryPrepared ? 'The private proposal is safely prepared, but email delivery was not confirmed. Review it, correct the lead details if needed, then retry the same locked version.' : !proposalSentAt ? 'Publish the final proposal with its locked itemized price.' : !proposalAcceptedAt ? 'The client accepts through the private proposal page.' : !agreementBooking ? 'The proposal is accepted, but the matching agreement record has not been confirmed yet. Prepare the agreement before asking the client to sign.' : agreementBooking.contract_status !== 'signed' ? agreementDeliveryConfirmed ? 'The Event Agreement was delivered after proposal acceptance. Stripe is not available until it is signed.' : 'The agreement is not confirmed as delivered yet. Do not treat it as sent until delivery is confirmed.' : depositPaidTotal <= 0 ? 'The signed agreement triggered the Stripe email for the initial booking payment and refundable security deposit.' : 'The signed agreement and initial booking payment are both recorded.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
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
                          ) : !proposalAcceptedAt ? (
                            <span className="min-h-11 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Awaiting client acceptance</span>
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
                        </div>
                      </div>
                      {agreementBooking ? <div className="mt-4 grid gap-3 border-t border-[color:var(--portal-border)] pt-4 md:grid-cols-2"><div><p className="mb-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Pre-fill payment method</p><PortalSelect value={String((agreementBooking.metadata?.client_payment_preference as { method?: string } | undefined)?.method || 'card')} onChange={(value) => void saveBookingPaymentPreference(agreementBooking, { method: value as 'card' | 'zelle' | 'cash' | 'check' })} options={[{ value: 'card', label: 'Card via Stripe' }, { value: 'zelle', label: 'Zelle' }, { value: 'cash', label: 'Cash' }, { value: 'check', label: 'Check' }]} className="w-full" /></div><div><p className="mb-1 text-[9px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Pre-fill payment amount</p><PortalSelect value={String((agreementBooking.metadata?.client_payment_preference as { amount?: string } | undefined)?.amount || 'deposit')} onChange={(value) => void saveBookingPaymentPreference(agreementBooking, { amount: value as 'deposit' | 'full' })} options={[{ value: 'deposit', label: 'Reservation deposit to hold date' }, { value: 'full', label: 'Full event balance' }]} className="w-full" /></div></div> : null}
                    </section>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {/* Card 1: Sent & Delivery */}
                      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Delivery Status</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            proposalSentAt ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : proposalDeliveryPrepared ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            <Send size={10} />
                            {proposalSentAt ? 'Sent' : proposalDeliveryPrepared ? 'Delivery pending' : 'Draft'}
                          </span>
                        </div>
                        <div className="mt-3">
                          <p className="text-sm font-bold text-[color:var(--portal-text)]">{proposalSentAt ? formatDisplayDate(proposalSentAt) : proposalDeliveryPrepared ? 'Retry required' : 'Not Sent Yet'}</p>
                          <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">{proposalSentAt ? 'Client delivery completed' : proposalDeliveryPrepared ? 'Private link is saved; email delivery was not confirmed' : 'Send proposal to advance lead'}</p>
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
                      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 shadow-sm flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Final Event Price</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            proposalBalance <= 0 && proposalAmount > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : proposalPaidTotal > 0 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a] border border-[#caa24c]/20'
                          }`}>
                            <DollarSign size={10} />
                            {proposalBalance <= 0 && proposalAmount > 0 ? 'Paid' : proposalPaidTotal > 0 ? 'Partial' : 'Unpaid'}
                          </span>
                        </div>
                        <div className="mt-3">
                          <p className="text-sm font-mono font-bold text-[color:var(--portal-text)]">{proposalAmount > 0 ? formatMoney(proposalAmount) : '$0.00'}</p>
                          <p className="mt-0.5 text-[10px] font-mono text-[color:var(--portal-muted)]">
                            {proposalInvoice ? (proposalPaidTotal > 0 ? `${formatMoney(proposalPaidTotal)} paid · ${formatMoney(proposalBalance)} left` : `${formatMoney(proposalBalance)} balance remaining`) : 'No saved proposal'}
                          </p>
                        </div>
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
                                <div><span className="text-[9px] uppercase text-[color:var(--portal-muted)] sm:hidden">Qty </span><span className="font-mono text-[color:var(--portal-muted)]">{item.quantity}</span></div>
                                <div className="font-mono text-[color:var(--portal-muted)] sm:text-right">{item.included ? <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Included</span> : formatMoney(item.unitPrice)}</div>
                                <div className="font-mono font-bold text-[color:var(--portal-text)] sm:text-right">{item.included ? '—' : formatMoney(item.total)}</div>
                              </div>
                            ))}
                          </div>
                          <div className="grid gap-2 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 text-xs sm:ml-auto sm:w-80">
                            <div className="flex justify-between text-[color:var(--portal-muted)]"><span>Subtotal</span><span className="font-mono text-[color:var(--portal-text)]">{formatMoney(proposalInvoice.subtotal)}</span></div>
                            <div className="flex justify-between text-[color:var(--portal-muted)]"><span>Tax ({(Number(proposalInvoice.tax_rate) * 100).toFixed(2)}%)</span><span className="font-mono text-[color:var(--portal-text)]">{formatMoney(Number(proposalInvoice.total) - Number(proposalInvoice.subtotal))}</span></div>
                            <div className="flex justify-between border-t border-[color:var(--portal-border)] pt-2 text-sm font-black text-[color:var(--portal-text)]"><span>Total</span><span className="font-mono text-[#a8792f] dark:text-[#f1d27a]">{formatMoney(proposalInvoice.total)}</span></div>
                            <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold"><span>Paid</span><span className="font-mono">{formatMoney(proposalPaidTotal)}</span></div>
                            <div className="flex justify-between font-bold text-[color:var(--portal-text)]"><span>Balance</span><span className="font-mono">{formatMoney(proposalBalance)}</span></div>
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
                return (
                  <>
                    {/* Next Move */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
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
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Deposit Summary */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Deposit Invoice</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Invoice Number</span>
                              <span className="font-bold text-white">{depositInvoice ? depositInvoice.id.slice(0, 8).toUpperCase() : 'No invoice'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Deposit Due Date</span>
                              <span className="font-bold text-white">Due with agreement signature</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Initial Payment + Security</span>
                              <span className="font-bold text-[#caa24c] font-mono">{formatMoney(initialPaymentInvoiceTotal)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Paid Status</span>
                              <span className="rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">{depositBalance <= 0 && initialPaymentInvoiceTotal > 0 ? 'paid / held' : 'pending'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Remaining Balance</span>
                              <span className="font-bold text-white font-mono">{formatMoney(depositBalance)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          {depositInvoice && depositBalance > 0 ? <button type="button" onClick={() => openPaymentRequest(depositInvoice)} className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c] text-[9px] font-black uppercase text-white hover:bg-[#a8792f] transition-colors cursor-pointer">Resend Payment Link</button> : null}
                          {latestBooking ? (
                            <button type="button" onClick={() => handleRecordManualPayment(latestBooking, 'deposit')} className="flex-1 min-w-[80px] py-1.5 rounded border border-[#caa24c]/20 bg-[#caa24c]/5 text-[9px] font-black uppercase text-[#caa24c] hover:bg-[#caa24c]/10 transition-colors cursor-pointer">Mark Initial Payment Paid</button>
                          ) : null}
                        </div>
                      </section>

                      {/* Payment Schedule */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-3">Payment Schedule</p>
                          <div className="space-y-3 text-xs">
                            <div className="flex justify-between py-1 border-b border-zinc-850">
                              <div>
                                <p className="font-bold text-white">1. Initial Booking Payment + Security Deposit</p>
                                <p className="text-[9px] text-zinc-500">Due with agreement signature</p>
                              </div>
                              <span className="font-mono font-bold text-[#caa24c]">{formatMoney(initialPaymentInvoiceTotal)}</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <div>
                                <p className="font-bold text-zinc-400">2. Remaining Final Event Price Balance</p>
                                <p className="text-[9px] text-zinc-500">{latestBooking?.final_payment_due_date ? `Due ${formatDisplayDate(latestBooking.final_payment_due_date)}` : 'Due date not set'}</p>
                              </div>
                              <span className="font-mono font-bold text-zinc-400">{formatMoney(finalPaymentTotal)}</span>
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
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
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
                    </section>
                    <ProposalPaymentSchedule
                      finalEventPrice={Number(proposalInvoice?.total || agreementBooking?.contract_total || 0)}
                      venueServicesTotal={venueServices}
                      eventServicesTotal={eventServices}
                      refundableSecurityDeposit={refundableSecurityDepositAmount}
                      paymentPlan={paymentPlan && typeof paymentPlan === 'object' ? paymentPlan : null}
                      eventDate={eventDate}
                      bookingDate={agreementBooking?.created_at}
                      paymentCount={paymentCount}
                      installments={paymentInstallments}
                    />
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Payment history</p><span className="text-[10px] font-bold text-[color:var(--portal-muted)]">Event payments only</span></div>
                      <div className="space-y-3">{sortedPayments.filter((payment) => !/security deposit/i.test(String(payment.metadata?.payment_kind || payment.metadata?.description || ''))).length ? sortedPayments.filter((payment) => !/security deposit/i.test(String(payment.metadata?.payment_kind || payment.metadata?.description || ''))).map((payment) => <div key={payment.id} className="flex items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-3 text-xs"><div><p className="font-bold text-[color:var(--portal-text)]">{String(payment.metadata?.payment_kind || 'Event payment').replaceAll('_', ' ')}</p><p className="text-[10px] text-[color:var(--portal-muted)]">{payment.paid_at ? `Paid ${formatDisplayDate(payment.paid_at)}` : formatTimelineDate(payment.created_at)}</p></div><span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(payment.amount)}</span></div>) : <p className="text-xs text-[color:var(--portal-muted)]">No event payments have been recorded yet.</p>}</div>
                    </section>
                  </>
                )
                return (
                  <>
                    {/* Next Move */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c] shadow-xs">
                            <CreditCard size={18} />
                          </span>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">Next Move</p>
                            <h4 className="mt-1 text-sm font-black text-[color:var(--portal-text)]">
                              {finalPaymentBalance <= 0 ? 'Balance paid in full' : 'Collect final event payment balance'}
                            </h4>
                            <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">
                              {finalPaymentBalance <= 0 ? 'All invoice balances settled. The separate $750 refundable security deposit remains held until post-event inspection.' : `${formatMoney(finalPaymentBalance)} final event balance remaining. The separate $750 refundable security deposit is billed independently and remains held.`}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {finalBalanceInvoice && finalPaymentBalance > 0 ? (
                            <button type="button" onClick={() => openPaymentRequest(finalBalanceInvoice!)} className="min-h-11 rounded-xl bg-[#caa24c] px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-md hover:bg-[#dfbd68] transition-all cursor-pointer">
                              Send Secure Payment Link
                            </button>
                          ) : null}
                          {latestBooking ? (
                            <button type="button" onClick={() => handleRecordManualPayment(latestBooking!, 'final')} className="min-h-11 rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/10 px-5 text-[10px] font-black uppercase tracking-wider text-[#a8792f] dark:text-[#f1d27a] hover:bg-[#caa24c]/20 transition-all cursor-pointer">
                              Mark Paid Manually
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Final Payment Status */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Payment Summary</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Remaining Balance</span>
                              <span className="font-bold text-[#caa24c] font-mono">{formatMoney(finalPaymentBalance)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Due Date</span>
                              <span className="font-bold text-white">{latestBooking?.final_payment_due_date ? formatDisplayDate(latestBooking!.final_payment_due_date) : 'No due date set'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Late Status</span>
                              <span className="font-bold text-emerald-400">On Time</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Invoice Ref</span>
                              <span className="font-bold text-white">{finalBalanceInvoice ? finalBalanceInvoice!.id.slice(0, 8).toUpperCase() : 'No invoice'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Payment Status</span>
                              <span className="rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">{finalPaymentBalance <= 0 && finalPaymentTotal > 0 ? 'paid' : 'pending'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          {finalBalanceInvoice && finalPaymentBalance > 0 ? (
                            <button type="button" onClick={() => openPaymentRequest(finalBalanceInvoice!)} className="flex-1 min-w-[110px] py-1.5 rounded bg-[#caa24c] text-[9px] font-black uppercase text-white hover:bg-[#a8792f] transition-colors cursor-pointer">Send Secure Payment Link</button>
                          ) : null}
                          {latestBooking ? (
                            <button type="button" onClick={() => handleRecordManualPayment(latestBooking!, 'final')} className="flex-1 min-w-[100px] py-1.5 rounded border border-[#caa24c]/20 bg-[#caa24c]/5 text-[9px] font-black uppercase text-[#caa24c] hover:bg-[#caa24c]/10 transition-colors cursor-pointer">Mark Paid Manually</button>
                          ) : null}
                          <button type="button" onClick={() => setActiveLeadTab('tasks')} className="flex-1 min-w-[80px] py-1.5 rounded border border-zinc-850 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">Create Reminder Task</button>
                        </div>
                      </section>

                      {/* Payment History */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-3">Transaction History</p>
                          <div className="space-y-3 text-xs">
                            {sortedPayments.length ? sortedPayments.map((payment) => (
                              <div key={payment.id} className="flex justify-between items-center py-1.5 border-b border-zinc-850 last:border-0">
                                <div>
                                  <p className="font-bold text-white">{String(payment.metadata?.payment_kind || 'Payment').replaceAll('_', ' ')}</p>
                                  <p className="text-[9px] text-zinc-500">{payment.paid_at ? `Paid ${formatDisplayDate(payment.paid_at)}` : formatTimelineDate(payment.created_at)}</p>
                                </div>
                                <span className="font-mono font-bold text-emerald-400">+{formatMoney(payment.amount)} {payment.status}</span>
                              </div>
                            )) : (
                              <p className="text-xs text-zinc-500">No payments have been recorded yet.</p>
                            )}
                          </div>
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'event') {
                return (
                  <>
                    {/* Next Move */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
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
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Coordinator & Contacts */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">On-Site operations</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Head Contact</span>
                              <span className="font-bold text-white">{lead.full_name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Assigned Coordinator</span>
                              <span className="font-bold text-white">{String(activeEventMetadata.event_coordinator || 'Not assigned')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Gate Access Code</span>
                              <span className="font-mono font-bold text-[#caa24c]">{String(activeEventMetadata.gate_access_code || 'Not set')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Backdoor Code</span>
                              <span className="font-mono font-bold text-white">{String(activeEventMetadata.backdoor_code || 'Not set')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Emergency Line</span>
                              <span className="font-bold text-white">{String(activeEventMetadata.emergency_contact || 'Not set')}</span>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Event Day Checklist */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-3 luxor-soft-enter">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Operation Milestones</p>
                        <div className="space-y-2 text-xs">
                          {[
                            { label: 'Coordinator assigned', done: Boolean(activeEventMetadata.event_coordinator) },
                            { label: 'Access details captured', done: Boolean(activeEventMetadata.gate_access_code || activeEventMetadata.backdoor_code) },
                            { label: 'Run of show confirmed', done: Boolean(activeEventMetadata.run_of_show_confirmed_at) },
                            { label: 'Vendor arrival windows confirmed', done: Boolean(activeEventMetadata.vendor_windows_confirmed_at) },
                            { label: 'Final walkthrough complete', done: Boolean(activeEventMetadata.final_walkthrough_completed_at) },
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 py-0.5">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                item.done ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-zinc-850 text-zinc-700'
                              }`}>
                                {item.done && <Check size={8} className="stroke-[3]" />}
                              </span>
                              <span className={item.done ? 'text-zinc-500 line-through' : 'text-white'}>{item.label}</span>
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
                return (
                  <>
                    {/* Next Move */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm luxor-soft-enter">
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
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Post-Event Checklist */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-3 luxor-soft-enter">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Wrap-Up Checklist</p>
                        <div className="space-y-2 text-xs">
                          {[
                            { label: 'Thank-you follow-up logged', done: Boolean(activeEventMetadata.thank_you_follow_up_logged_at) },
                            { label: 'Review request ready', done: Boolean(activeEventMetadata.review_request_ready_at) },
                            { label: 'Photo/video assets requested', done: Boolean(activeEventMetadata.assets_requested_at) },
                            { label: 'Security deposit return authorized', done: Boolean(activeEventMetadata.deposit_return_authorized_at) },
                            { label: 'Damage report & final inspection cleared', done: Boolean(activeEventMetadata.final_inspection_cleared_at) },
                            { label: 'Anniversary reminder noted', done: Boolean(activeEventMetadata.anniversary_reminder_date) },
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 py-0.5">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                item.done ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-zinc-850 text-zinc-700'
                              }`}>
                                {item.done && <Check size={8} className="stroke-[3]" />}
                              </span>
                              <span className={item.done ? 'text-zinc-500 line-through' : 'text-white'}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Feedback & Referrals */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Anniversary Reminder</p>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {activeEventMetadata.anniversary_reminder_date
                              ? <>Anniversary reminder noted for <strong>{formatDisplayDate(String(activeEventMetadata.anniversary_reminder_date))}</strong>. No post-event email automation is created from this page.</>
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
                <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 text-center text-zinc-500 space-y-3 luxor-soft-enter">
                  <Sparkles size={24} className="mx-auto text-zinc-800" />
                  <p className="text-xs uppercase font-black tracking-widest text-[#caa24c] capitalize">{currentStage} Stage Dashboard</p>
                  <p className="text-xs leading-relaxed max-w-md mx-auto">
                    Welcome to the <strong>{currentStage.toUpperCase()}</strong> stage. This dossier dashboard automatically adapts to show details, invoices, and documents matching this phase.
                  </p>
                  <div className="pt-4 flex justify-center gap-3">
                    <button type="button" onClick={() => setSelectedStageOverride(null)} className="px-4 py-2 rounded-lg border border-zinc-800 text-[10px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">
                      Reset Preview to Active Stage
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Right Column: Sticky actions & summary */}
          <div className="space-y-6 px-2.5 pt-2 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-3 lg:pt-2 lg:pb-8 lg:[scrollbar-gutter:stable] portal-scrollbar">
            {(() => {
              const currentStage = selectedStageOverride || activeStage
              
              if (currentStage === 'inquiry') {
                return (
                  <>
                    <ClientSummaryCard
                      lead={lead}
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
                          className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer"
                        >
                          View all tasks &rarr;
                        </button>
                      </div>
                    </section>

                    {renderMarketingEngagementCard()}

                    {/* Event Summary */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Event Summary</p>
                        {!isEditingSummary ? (
                          <button 
                            type="button"
                            onClick={() => setIsEditingSummary(true)}
                            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer animate-[luxor-soft-enter_0.2s_ease-out]"
                          >
                            <Pencil size={11} /> Edit
                          </button>
                        ) : null}
                      </div>

                      {isEditingSummary ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Venue</label>
                            <PortalSelect
                              value={summaryVenue}
                              onChange={setSummaryVenue}
                              options={[
                                { value: 'Luxor Main Hall', label: 'Luxor Main Hall' },
                                { value: 'Luxor Grand Pavilion', label: 'Luxor Grand Pavilion' },
                                { value: 'Elena Garden Plaza', label: 'Elena Garden Pavilion' },
                                { value: 'Palmas Terrace Suite', label: 'Palmas Terrace Suite' },
                              ]}
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Start Time</label>
                              <PortalSelect
                                value={summaryStartTime}
                                onChange={setSummaryStartTime}
                                options={EVENT_TIME_OPTIONS}
                                placeholder="Select start time"
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">End Time</label>
                              <PortalSelect
                                value={summaryEndTime}
                                onChange={setSummaryEndTime}
                                options={EVENT_TIME_OPTIONS}
                                placeholder="Select end time"
                                className="w-full"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Setup Time</label>
                            <input
                              type="text"
                              value={summarySetupTime}
                              onChange={(e) => setSummarySetupTime(e.target.value)}
                              placeholder="e.g. 3:00 PM"
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Breakdown Time</label>
                            <input
                              type="text"
                              value={summaryBreakdownTime}
                              onChange={(e) => setSummaryBreakdownTime(e.target.value)}
                              placeholder="e.g. 11:00 PM – 12:30 AM"
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                            />
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => setIsEditingSummary(false)}
                              className="px-3 py-1.5 rounded border border-zinc-850 text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveSummary}
                              disabled={savingSummary}
                              className="px-4 py-1.5 rounded bg-[#caa24c] text-[10px] font-black uppercase text-white hover:bg-[#dfbd68] transition-all cursor-pointer"
                            >
                              {savingSummary ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Venue</span>
                            <span className="text-xs font-bold text-white">{summaryVenue || 'Not captured'}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Time</span>
                            <span className="text-xs font-bold text-white">
                              {summaryStartTime && summaryEndTime ? `${formatTimeString(summaryStartTime)} – ${formatTimeString(summaryEndTime)}` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Duration</span>
                            <span className="text-xs font-bold text-white">{formatEventDuration(summaryStartTime, summaryEndTime)}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Setup Time</span>
                            <span className="text-xs font-bold text-white">{summarySetupTime || 'Not set'}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Breakdown Time</span>
                            <span className="text-xs font-bold text-white">{summaryBreakdownTime || 'Not set'}</span>
                          </div>
                        </div>
                      )}
                    </section>
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
                    lead={lead}
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

                  {/* NEXT STEP */}
                  <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Next Step</p>
                    </div>
                    <div className="flex items-start gap-4 text-left">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/10 text-[#a8792f] border border-[#caa24c]/20">
                        <Calendar size={18} />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-white leading-tight">{nextStepTitle}</h4>
                        <p className="mt-1 text-[10px] text-zinc-500 leading-relaxed">{nextStepDetail}</p>
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
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Recent Activity</p>
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
                        <p className="text-xs text-zinc-500">No recent activity logged yet.</p>
                      )}
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-100/5 dark:border-zinc-850/30 text-center">
                      <button
                        type="button"
                        onClick={() => setActiveLeadTab('activity')}
                        className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer"
                      >
                        View All Activity &rarr;
                      </button>
                    </div>
                  </section>
                </>
              )
            })()}
          </div>
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
                    <button type="button" onClick={openTourScheduleModal} disabled={!lead.email} className="rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#caa24c] disabled:opacity-40">
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
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Luxor Browser Phone</span>
                            <div className="flex items-center gap-3">
                              <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${call.direction === 'inbound' ? 'border-blue-500/20 bg-blue-500/10 text-blue-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>{call.direction}</span>
                              <span className="text-[9px] font-mono text-zinc-600">{formatTimelineDate(entry.createdAt)}</span>
                            </div>
                          </div>
                          <p className="text-xs font-bold text-zinc-200">{describeActivityEntry(entry)}</p>
                          <p className="mt-1 font-mono text-[10px] text-zinc-600">{otherNumber} · {call.duration_seconds === null ? call.status : formatCallDuration(call.duration_seconds)}</p>
                          {call.is_voicemail && call.recording_sid ? (
                            <audio controls preload="none" className="mt-3 w-full" src={`/api/twilio/recordings/${call.recording_sid}`}>Your browser does not support audio playback.</audio>
                          ) : null}
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
          <div className={`space-y-6 ${
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

          {activeLeadTab === 'documents' ? (
          <div id="lead-documents" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2.5 font-semibold text-[color:var(--portal-text)]"><FileText size={16} className="text-[#a8792f] dark:text-[#caa24c]" /> PDF library</h3>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-[color:var(--portal-muted)]">Preview the final proposal, agreement, and signed contract saved for this lead. These files are private to the owner portal.</p>
              </div>
              <span className="font-mono text-xs text-[color:var(--portal-muted)]">{documents.length + signatureRequests.length} files</span>
            </div>
            {documents.length === 0 && signatureRequests.length === 0 ? (
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

          {activeLeadTab === 'documents' ? (
          <div id="lead-booking" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <h3 className="mb-6 flex items-center justify-between font-semibold text-[color:var(--portal-text)]">
              <span className="flex items-center gap-2.5">
                <FileSignature size={16} className="text-[#a8792f] dark:text-[#caa24c]" />
                Booking & Contract
              </span>
              <span className="font-mono text-xs text-[color:var(--portal-muted)]">{sortedBookings.length} records</span>
            </h3>

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
          </div>
          ) : null}

          {activeLeadTab === 'documents' ? (
          <div id="lead-billing" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
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
                {sortedInvoices.map((inv, index) => (
                  <div key={inv.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm">
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
                      <button type="button" onClick={() => openPaymentRequest(inv)} disabled={sendingInvoiceId === inv.id || !lead.email || getInvoiceBalance(inv) <= 0 || (inv.invoice_kind !== 'deposit' && inv.invoice_kind !== 'final_balance') || latestBooking?.contract_status !== 'signed'} className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] disabled:opacity-40">
                        <Send size={12} /> {sendingInvoiceId === inv.id ? 'Sending...' : getInvoiceBalance(inv) <= 0 ? 'Paid in full' : 'Send payment request'}
                      </button>
                      <button type="button" onClick={() => handleSendAiInvoiceReminder(inv)} disabled={sendingReminderId === inv.id || !lead.email || getInvoiceBalance(inv) <= 0} className="inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-purple-300 transition-colors hover:bg-purple-500/20 disabled:opacity-40 cursor-pointer">
                        <Sparkles size={12} /> {sendingReminderId === inv.id ? 'Sending AI Email...' : 'Send AI Reminder'}
                      </button>
                      <button type="button" onClick={() => setInvoiceToDelete(inv)} disabled={getInvoicePaidTotal(inv.id) > 0 || inv.status === 'paid'} className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35 dark:text-red-300">
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          ) : null}
        </div>
      </div>
      )}

      <div className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-3 gap-2 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 p-2 shadow-2xl backdrop-blur-xl sm:hidden">
        <button type="button" onClick={() => lead.phone && startLuxorBrowserCall({ phoneNumber: lead.phone, contactName: lead.full_name, inquiryId: lead.id })} disabled={!lead.phone} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--portal-border)] text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] disabled:pointer-events-none disabled:opacity-40">
          <Phone size={14} /> Call
        </button>
        <button type="button" onClick={() => setTextPopupOpen(true)} disabled={!lead.phone} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-transparent text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] disabled:pointer-events-none disabled:opacity-40 cursor-pointer">
          <MessageSquare size={14} /> Text
        </button>
        <button type="button" onClick={recommendedActions[0]?.onClick} disabled={!recommendedActions[0] || recommendedActions[0].disabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-2 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-45">
          <ChevronRight size={14} /> Next
        </button>
      </div>

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
            title: leadLifecycleAction === 'deal-lost' ? 'Deal marked lost' : 'Tour cancelled',
            description: leadLifecycleAction === 'deal-lost'
              ? 'The active opportunity has been closed and its open work has been withdrawn.'
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

      <PortalModal isOpen={isTourScheduleModalOpen} onClose={() => setIsTourScheduleModalOpen(false)} maxWidth="max-w-2xl">
        <form onSubmit={handleScheduleTour} className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--portal-card)] text-[color:var(--portal-text)]">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 sm:px-6">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Schedule Tour & Send Invite</h3>
              <p className="mt-1 text-[11px] leading-4 text-[color:var(--portal-muted)]">This sends the calendar invitation, a branded confirmation, and the scheduled reminders.</p>
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
              This sends one calendar invite, one branded confirmation email, then reminder emails 24 hours and 2 hours before the tour when enough time remains.
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
        clientEmail={lead.email}
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
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Event type <span className="text-[#caa24c]">Required</span></label>
              <PortalSelect value={newEventType} onChange={setNewEventType} options={[{ value: '', label: 'Choose event type' }, ...LUXOR_EVENT_TYPES.map((type) => ({ value: type, label: type }))]} className="w-full" />
            </div>
            <div>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Date</label>
              <input value={newEventDate} onChange={(event) => setNewEventDate(event.target.value)} placeholder="Date TBD or 2027-08-11" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" />
            </div>
            <div>
              <label className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Guest count</label>
              <input type="number" min="0" value={newEventGuestCount} onChange={(event) => setNewEventGuestCount(event.target.value)} placeholder="150" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" />
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
            <button type="submit" disabled={submittingEvent || !newEventType} className="rounded-lg bg-[#caa24c] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#dfbd68] disabled:opacity-40">{submittingEvent ? 'Adding event...' : 'Add event'}</button>
          </div>
        </form>
      </PortalModal>

      <ProposalBuilderModal
        isOpen={isInvoiceModalOpen}
        isEditing={Boolean(editingInvoiceId)}
        onClose={() => {
          proposalEditorOpenRef.current = false
          setIsInvoiceModalOpen(false)
          setEditingInvoiceId(null)
        }}
        clientName={lead.full_name}
        clientEmail={lead.email}
        eventType={activeEventForDisplay?.event_type || lead.event_type}
        eventDate={activeEventForDisplay?.target_date || lead.target_date}
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
        notes={invoiceNotes}
        onNotesChange={setInvoiceNotes}
        taxRate={invoiceTaxRate}
        onTaxRateChange={setInvoiceTaxRate}
        submitting={submittingInvoice}
        onSubmit={(action) => void handleCreateInvoice(action)}
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
      <div className="sticky -top-4 z-30 -mt-px overflow-hidden rounded-b-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/50 backdrop-blur-xl px-4 py-3 sm:-top-6 lg:-top-10">
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
  const currentGuestCount = lead.guest_count ? String(lead.guest_count) : ''
  const guestCountOptions = Array.from(new Set([
    ...(currentGuestCount ? [currentGuestCount] : []),
    ...Array.from({ length: 20 }, (_, index) => String((index + 1) * 25)),
  ])).map((value) => ({ value, label: `${value} guests` }))
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
  }> = [
    { label: 'Email', icon: <Mail size={14} />, value: lead.email || 'No email captured', editValue: lead.email || '', copyValue: lead.email || '', field: 'email', inputType: 'email', placeholder: 'client@email.com', isMono: true, onCompose: lead.email ? () => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead } })) : undefined },
    { label: 'Phone', icon: <Phone size={14} />, value: lead.phone ? formatPhoneDisplay(lead.phone) : 'No phone captured', editValue: lead.phone || '', copyValue: lead.phone || '', field: 'phone', inputType: 'tel', placeholder: 'Phone number', isMono: true, onCall: lead.phone ? () => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id }) : undefined },
    { label: 'Address', icon: <MapPin size={14} />, value: lead.metadata?.address ? String(lead.metadata.address) : 'Address not captured', editValue: lead.metadata?.address ? String(lead.metadata.address) : '', copyValue: lead.metadata?.address ? String(lead.metadata.address) : '', field: 'address', placeholder: 'San Antonio, TX' },
    { label: 'Guest Count', icon: <Users size={14} />, value: lead.guest_count ? `${lead.guest_count} Expected Guests` : 'Guest count not captured', editValue: currentGuestCount, copyValue: currentGuestCount, field: 'guest_count', inputType: 'select', options: guestCountOptions },
    { label: 'Planning Budget', icon: <DollarSign size={14} />, value: lead.budget || 'Budget not provided', editValue: lead.budget || '', copyValue: lead.budget || '', field: 'budget', inputType: 'select', options: LEAD_BUDGET_OPTIONS },
    { label: 'Event Type', icon: <Star size={14} />, value: lead.event_type || 'Event type not captured', editValue: lead.event_type || '', copyValue: lead.event_type || '', field: 'event_type', inputType: 'select', options: LUXOR_EVENT_TYPES.map((value) => ({ value, label: value })) },
  ]

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
            <p className="mt-1 truncate text-sm font-bold text-[color:var(--portal-text)]">{lead.full_name}</p>
          </div>
        </div>
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-600">Hover to edit</span>
      </div>
      <div className="flex-1 space-y-0.5">
        {summaryRows.map((row) => (
          <DetailItem
            key={row.label}
            compact
            {...row}
            isSaving={isSaving}
            onCommit={(value) => onUpdate(row.field, value)}
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
          <button type="button" onClick={() => setRemoving(contact)} className="p-1 text-[color:var(--portal-muted)] opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${contact.full_name}`}><Trash2 size={12} /></button>
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

  const proposalSentDate = latestInvoice?.proposal_sent_at || (latestInvoice?.status === 'sent' ? latestInvoice.updated_at : null)
  const formattedProposalSentDate = proposalSentDate
    ? new Date(proposalSentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : lead.status === 'proposal_sent' || lead.status === 'booked'
      ? new Date(lead.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : ''

  const steps = getLeadLifecycleSteps(lead, latestBooking, latestInvoice).map((step) => {
    if (step.id === 'inquiry') {
      return { ...step, label: 'Inquiry', subtext: formattedInquiryDate }
    }
    if (step.id === 'tour') {
      const tourWasImplicitlyCompleted = step.isCompleted && lead.tour_attendance_status !== 'attended' && !formattedTourDate
      return { ...step, label: 'Tour', subtext: formattedTourDate || (tourWasImplicitlyCompleted ? 'Skipped' : '') }
    }
    if (step.id === 'proposal') {
      return {
        ...step,
        label: 'Proposal',
        subtext:
          latestInvoice?.proposal_accepted_at || lead.status === 'booked'
            ? 'Accepted'
            : hasPublishedFinalProposal(latestInvoice) || lead.status === 'proposal_sent'
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
              : latestInvoice?.proposal_accepted_at
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

  return (
    <div className="portal-scrollbar overflow-x-auto pb-2">
      <div className="relative flex min-w-[760px] items-center justify-between px-4 py-4 sm:min-w-[960px] sm:px-6">
        {/* Track Line */}
        <div className="absolute left-[5%] right-[5%] top-[34px] h-[2px] bg-zinc-200 dark:bg-zinc-800" />
        
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
              <div className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-300 ${
                isCurrent
                  ? 'border-2 border-[#caa24c] bg-[#caa24c] text-white ring-4 ring-[#caa24c]/25 shadow-lg shadow-[#caa24c]/20 font-bold'
                  : isDone
                  ? 'border-[#caa24c] bg-[#caa24c] text-white shadow-lg shadow-[#caa24c]/20 font-bold'
                  : 'border-zinc-200 dark:border-zinc-850 bg-white dark:bg-[#080706] text-zinc-400 dark:text-zinc-650 hover:border-[#caa24c]/40'
              }`}>
                {isDone || isCurrent ? (
                  <StageIcon
                    size={15}
                    color="#ffffff"
                    style={{ stroke: '#ffffff', color: '#ffffff' }}
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700 transition-colors group-hover/step:bg-[#caa24c]" />
                )}
              </div>

              <span className={`mt-3 text-[9px] font-black uppercase tracking-[0.15em] ${
                isCurrent
                  ? 'text-[#a8792f] dark:text-[#caa24c]'
                  : isDone
                  ? 'text-[color:var(--portal-text)]'
                  : 'text-zinc-550 dark:text-zinc-500 group-hover/step:text-zinc-400'
              }`}>
                {step.label}
              </span>
              <span className="mt-1 h-3 text-[9px] font-medium text-[color:var(--portal-muted)]">
                {step.subtext}
              </span>
            </button>
          )
        })}
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
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(editValue ?? value)
  const [copied, setCopied] = useState(false)
  const canEdit = Boolean(onCommit)
  const canCopy = Boolean(copyValue?.trim())
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
    if (onCompose) {
      onCompose()
      return
    }
    if (onCall) {
      onCall()
      return
    }
    if (!canEdit || isSaving) return
    setDraft(editValue ?? value)
    setIsEditing(true)
  }

  const commitDraft = async () => {
    if (!onCommit || isSaving) return

    const saved = await onCommit(draft)
    if (saved) {
      setIsEditing(false)
    }
  }

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
      aria-label={canEdit ? `Edit ${label}` : undefined}
      onClick={startEditing}
      onKeyDown={(event) => {
        if (!canEdit || isEditing) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          startEditing()
        }
      }}
      className={`group/card relative flex ${compact ? 'min-h-10 items-center gap-3 px-2 -mx-2 py-1' : 'min-h-[72px] items-start gap-3 px-3 -mx-3 py-3.5'} rounded-xl transition-all hover:bg-[#caa24c]/[0.025] ${
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

      {isEditing ? (
        inputType === 'date' ? (
          <div className={`${compact ? '' : 'mt-2'} w-full`} onClick={(event) => event.stopPropagation()}>
            <PortalDatePicker
              value={draft}
              onChange={async (val) => {
                setDraft(val)
                if (onCommit) {
                  const saved = await onCommit(val)
                  if (saved) {
                    setIsEditing(false)
                  }
                }
              }}
            />
          </div>
        ) : inputType === 'select' ? (
          <div className={`${compact ? '' : 'mt-2'} w-full`} onClick={(event) => event.stopPropagation()}>
            <PortalSelect
              value={draft}
              disabled={isSaving}
              options={options}
              onChange={async (val) => {
                setDraft(val)
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
            value={draft}
            disabled={isSaving}
            placeholder={placeholder}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(inputType === 'tel' || label === 'Phone' ? formatUsDialInput(event.target.value) : event.target.value)}
            onBlur={() => {
              void commitDraft()
            }}
            onKeyDown={(event) => {
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
              isMono ? 'font-mono' : ''
            }`}
          />
        )
      ) : (
        <div className={`group/value relative ${compact ? '' : 'mt-2'} flex w-full items-center ${canEdit || canCopy ? 'cursor-pointer' : ''}`}>
          <p
            className={`min-w-0 flex-1 truncate ${compact ? 'text-xs font-medium' : 'text-sm font-bold'} leading-normal text-[color:var(--portal-text)] transition-all duration-150 group-hover/value:pr-[5.5rem] ${
              isMono ? 'font-mono text-xs' : ''
            }`}
          >
            {isSaving ? 'Saving...' : value}
          </p>
          {canCopy || (canEdit && !isEditing) ? (
            <div className="pointer-events-none absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/value:pointer-events-auto group-hover/value:opacity-100">
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
              {canEdit ? (
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
        <p className="max-w-[70%] font-mono text-lg font-bold leading-tight text-[color:var(--portal-text)]">{value}</p>
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
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-white">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-zinc-500">{detail}</p>
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

type LeadLifecycleStepState = {
  id: 'inquiry' | 'tour' | 'proposal' | 'contract' | 'deposit' | 'planning' | 'final_payment' | 'event' | 'closing' | 'complete'
  isCompleted: boolean
  isActive: boolean
}

function getLeadLifecycleSteps(lead: LuxorInquiry, latestBooking: LuxorBooking | null, currentProposal: LuxorInvoice | null = null): LeadLifecycleStepState[] {
  const hasProposalOrContractWorkflow = Boolean(
    hasPublishedFinalProposal(currentProposal) ||
    currentProposal?.proposal_accepted_at ||
    latestBooking,
  )
  const hasTourStepBeenReached = ['tour_requested', 'tour_confirmed', 'proposal_sent', 'booked'].includes(lead.status) || hasProposalOrContractWorkflow
  // A proposal or agreement can be created for a client who has already toured
  // outside the portal. Keep the record untouched, but render the tour as
  // complete so the operational screen does not send the owner backwards.
  const hasTourBeenCompleted = lead.tour_attendance_status === 'attended' || hasProposalOrContractWorkflow || ['proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing'].includes(lead.pipeline_stage || '') || lead.status === 'proposal_sent' || lead.status === 'booked'
  const hasProposalStepBeenReached = hasProposalOrContractWorkflow || lead.status === 'booked' || ['contract', 'deposit', 'planning', 'final_payment', 'event', 'closing'].includes(lead.pipeline_stage || '')
  const proposalIsActive = !hasProposalOrContractWorkflow && (lead.pipeline_stage === 'proposal' || lead.status === 'proposal_sent')
  const bookingMetadata = latestBooking?.metadata || {}
  const isLegacyComplete = latestBooking?.status === 'completed'
  const bookingPaymentCollected = Boolean(bookingMetadata.deposit_paid_at) || Boolean(bookingMetadata.deposit_paid_before_booking)
  const leadCompleted = Boolean(bookingMetadata.lead_completed_at) || isLegacyComplete
  const planningCompleted = Boolean(bookingMetadata.planning_completed_at) || leadCompleted
  const finalPaymentCompleted = Boolean(bookingMetadata.final_payment_recorded_manually_at) || Boolean(bookingMetadata.final_payment_paid_at) || leadCompleted
  const eventCompleted = Boolean(bookingMetadata.event_completed_at) || leadCompleted
  const closeoutCompleted = Boolean(bookingMetadata.closeout_completed_at) || leadCompleted

  return [
    {
      id: 'inquiry',
      isCompleted: lead.status !== 'new',
      isActive: lead.status === 'new',
    },
    {
      id: 'tour',
      isCompleted: hasTourBeenCompleted || hasTourStepBeenReached && lead.tour_attendance_status === 'attended',
      isActive: !hasTourBeenCompleted && (lead.status === 'contacted' || lead.status === 'tour_requested' || lead.status === 'tour_confirmed'),
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
  ]
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

function formatSourceLabel(lead: LuxorInquiry) {
  return isGrandOpeningRsvp(lead) ? 'Grand Opening RSVP' : lead.source.replaceAll('_', ' ')
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

function parseLocalCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]), 12)
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
