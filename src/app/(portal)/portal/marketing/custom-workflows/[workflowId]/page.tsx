'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  Mail,
  MessageSquare,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Workflow,
  X,
  Zap,
} from '@/lib/icons/phosphor-compat'
import { PortalPageFrame, PortalSelect, PortalButton, PortalCloseButton, PortalModal, PortalAnimatedTabs, PortalTabTransition, PortalStaggerGroup, PortalStaggerCard } from '@/components/portal/PortalUI'
import {
  addCustomWorkflowStep,
  canEditCustomWorkflowStep,
  cloneCustomWorkflowDefinition,
  composeCustomWorkflowText,
  createNewContactFollowUpDefinition,
  CUSTOM_WORKFLOW_TEXT_MAX_LENGTH,
  CUSTOM_WORKFLOW_TEXT_OPT_OUT_FOOTER,
  CUSTOM_WORKFLOW_RUNTIME_TRIGGERS,
  CUSTOM_WORKFLOW_TRIGGER_LABELS,
  getCustomWorkflowTextBrand,
  getCustomWorkflowTextEditorContent,
  getCustomWorkflowTextEditorMaxLength,
  moveCustomWorkflowStep,
  removeCustomWorkflowStep,
  validateCustomWorkflowDefinition,
  type CustomWorkflowChannel,
  type CustomWorkflowDefinition,
  type CustomWorkflowStep,
  type CustomWorkflowTrigger,
} from '@/lib/luxorCustomWorkflowDefinition'
import { PREBUILT_WORKFLOWS } from '@/lib/luxorPrebuiltWorkflows'
import { ElenaWorkflowArchitectModal } from '@/components/portal/ElenaWorkflowArchitectModal'
import { WorkflowVariableChipsBar } from '@/components/portal/WorkflowVariableChipsBar'
import { WorkflowTokenEditor, WorkflowVariableText, type WorkflowTokenEditorHandle } from '@/components/portal/WorkflowTokenEditor'
import { WorkflowEmailPreview, WorkflowEmailTemplateControls } from '@/components/portal/WorkflowEmailEditor'
import { WorkflowContacts } from '@/components/portal/WorkflowContacts'
import { SystemWorkflowContacts } from '@/components/portal/SystemWorkflowContacts'
import { BrochureWorkflowContacts } from '@/components/portal/BrochureWorkflowContacts'
import { BrochureCanvasStep, type BrochureCanvasTemplate } from '@/components/portal/BrochureCanvasStep'
import { BrochureCanvasPreview } from '@/components/portal/BrochureCanvasPreview'
import { INQUIRY_CONFIRMATION_CHIP_TOKENS, renderEventReminder, renderInquiryConfirmation, renderInvoiceReminder, renderPaymentConfirmation, renderTourText } from '@/lib/luxorSystemMessageTemplates'
import { isPhoneTextWorkflow } from '@/lib/luxorPhoneTextWorkflow'
import { TOUR_EMAIL_NOTICE_KEYS, TOUR_EMAIL_STARTERS, renderTourEmailCopy, type TourEmailCopy, type TourEmailNoticeKey } from '@/lib/luxorTourEmailCopy'
import { INQUIRY_EMAIL_DEFAULT, RECEIPT_EMAIL_DEFAULTS, renderInquiryEmailCopy, type InquiryEmailCopy } from '@/lib/luxorInquiryEmailCopy'
import { INSTALLMENT_REMINDER_DEFAULTS, INSTALLMENT_REMINDER_KEYS, renderInstallmentReminderCopy, type InstallmentReminderCopy, type InstallmentReminderKey } from '@/lib/luxorInstallmentReminderCopy'
import { FINAL_PAYMENT_REMINDER_DEFAULT, FINAL_PAYMENT_REMINDER_KEYS, renderFinalPaymentReminderCopy, type FinalPaymentReminderCopy, type FinalPaymentReminderKey } from '@/lib/luxorFinalPaymentReminderCopy'
import { MANUAL_INVOICE_REMINDER_DEFAULTS, MANUAL_INVOICE_REMINDER_KEYS, type ManualInvoiceReminderKey } from '@/lib/luxorManualInvoiceReminderCopy'
import { EVENT_EMAIL_DEFAULTS, EVENT_EMAIL_KEYS, renderEventEmailCopy, type EventEmailCopy, type EventEmailKey } from '@/lib/luxorEventEmailCopy'
import { AGREEMENT_REMINDER_DEFAULTS, AGREEMENT_REMINDER_KEYS, renderAgreementReminderCopy, type AgreementReminderCopy, type AgreementReminderKey } from '@/lib/luxorAgreementReminderCopy'
import { OFFER_REMINDER_EDIT_STARTER, renderOfferReminderCopy, type OfferReminderCopy } from '@/lib/luxorOfferReminderCopy'
import { PAYMENT_REQUEST_REMINDER_EDIT_STARTER } from '@/lib/luxorPaymentRequestReminderCopy'
import { TOUR_NO_SHOW_DEFAULT, renderTourNoShowEmailCopy, type TourNoShowEmailCopy } from '@/lib/luxorTourNoShowEmailCopy'
import { PAID_INVOICE_EMAIL_STARTER, renderPaidInvoiceEmailCopy, type PaidInvoiceEmailCopy } from '@/lib/luxorPaidInvoiceEmailCopy'
import { ZELLE_INSTRUCTIONS_DEFAULT, renderZelleInstructionsCopy, type ZelleInstructionsCopy } from '@/lib/luxorZelleInstructionsCopy'
import { AGREEMENT_PACKAGE_DEFAULT, renderAgreementPackageCopy, type AgreementPackageCopy } from '@/lib/luxorAgreementPackageCopy'
import { PROPOSAL_BREAKDOWN_DEFAULT, renderProposalBreakdownCopy, type ProposalBreakdownCopy } from '@/lib/luxorProposalBreakdownCopy'
import { CALENDAR_CANCELLATION_DEFAULT, CALENDAR_MESSAGE_DEFAULTS, CALENDAR_MESSAGE_KEYS, CALENDAR_UPDATE_DEFAULT, type CalendarCancellationCopy, type CalendarMessageKey, type CalendarUpdateCopy } from '@/lib/luxorCalendarMessageCopy'
import { PLANNER_INVITATION_DEFAULT, renderPlannerInvitationCopy, type PlannerInvitationCopy } from '@/lib/luxorPlannerInvitationCopy'
import { PLANNER_VERIFICATION_DEFAULT, renderPlannerVerificationCopy, type PlannerVerificationCopy } from '@/lib/luxorPlannerVerificationCopy'
import { AGREEMENT_OWNER_DEFAULT, renderAgreementOwnerCopy, type AgreementOwnerCopy } from '@/lib/luxorAgreementOwnerCopy'
import { LAYOUT_REVIEW_EMAIL_DEFAULT, renderLayoutReviewEmailCopy, type LayoutReviewEmailCopy } from '@/lib/luxorLayoutReviewEmailCopy'
import type { LuxorEmailDocument } from '@/app/(portal)/portal/marketing/emailTemplates'

type WorkflowRow = {
  id: string
  name: string
  trigger_type: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  draft_definition: CustomWorkflowDefinition
  draft_revision: number
  created_at: string
  updated_at: string
  archived_at: string | null
}

type ActivityRow = {
  id: string
  event_type: string
  actor_email: string | null
  created_at: string
  details: Record<string, unknown>
}

type WorkflowCapabilities = {
  canPause: boolean
  canResume: boolean
  canArchive: boolean
  canActivate: boolean
  activationMessage: string
}

type WorkflowPayload = {
  workflow: WorkflowRow
  definition?: CustomWorkflowDefinition
  activity: ActivityRow[]
  capabilities?: WorkflowCapabilities
  error?: string
}

type WorkflowEmailOptions = {
  senders: string[]
  operator: { displayName: string; email: string; roleTitle?: string }
  venue: { address: string; phone: string; email: string }
}

const ADDABLE_STEPS: Array<{ type: Exclude<CustomWorkflowChannel, 'end'>; label: string; icon: React.ReactNode }> = [
  { type: 'call_task', label: 'Call Task', icon: <Phone size={14} className="text-emerald-500" /> },
  { type: 'email', label: 'Email', icon: <Mail size={14} className="text-[#a8792f]" /> },
  { type: 'text', label: 'Text (SMS)', icon: <MessageSquare size={14} className="text-sky-500" /> },
  { type: 'wait', label: 'Wait / Delay', icon: <Clock size={14} className="text-amber-500" /> },
  { type: 'condition', label: 'Condition', icon: <Workflow size={14} className="text-purple-500" /> },
]

const WORKFLOW_DESKTOP_QUERY = '(min-width: 1024px)'

function subscribeToWorkflowDesktopViewport(callback: () => void) {
  const query = window.matchMedia(WORKFLOW_DESKTOP_QUERY)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function getWorkflowDesktopViewportSnapshot() {
  return window.matchMedia(WORKFLOW_DESKTOP_QUERY).matches
}

export default function CustomWorkflowEditorPage() {
  const params = useParams<{ workflowId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const workflowId = String(params.workflowId || '')
  const isNew = workflowId === 'new'
  const isInquirySystem = workflowId === 'system-inquiry-confirmation'
  const isPaymentSystem = workflowId === 'system-payment-confirmation'
  const isEventSystem = workflowId === 'system-event-reminder'
  const isInvoiceSystem = ['system-invoice-reminders', 'system-invoice-due', 'system-invoice-overdue'].includes(workflowId)
  const isTourTextSystem = workflowId === 'system-tour-texts'
  const isTourEmailSystem = workflowId === 'system-tour-emails'
  const isInstallmentSystem = workflowId === 'system-installment-emails'
  const isFinalPaymentSystem = workflowId === 'system-final-payment-emails'
  const isManualInvoiceReminderSystem = workflowId === 'system-manual-invoice-reminder'
  const isCalendarMessageSystem = workflowId === 'system-calendar-messages'
  const isEventEmailSystem = workflowId === 'system-event-emails'
  const isAgreementSystem = workflowId === 'system-agreement-emails'
  const isPaymentRequestEmail = workflowId === 'system-payment-request-email'
  const isTourNoShowEmail = workflowId === 'system-tour-no-show-email'
  const isLayoutReviewEmail = workflowId === 'system-layout-review-email'
  const isPlannerInvitation = workflowId === 'system-planner-invitation'
  const isPlannerVerification = workflowId === 'system-planner-verification'
  const isZelleInstructions = workflowId === 'system-zelle-instructions'
  const isAgreementPackage = workflowId === 'system-agreement-package'
  const isProposalBreakdown = workflowId === 'system-proposal-breakdown'
  const isAgreementClient = workflowId === 'system-agreement-client'
  const isAgreementOwner = workflowId === 'system-agreement-owner'
  const isPaymentReceipt = workflowId === 'system-payment-receipt'
  const isPaidInvoiceEmail = workflowId === 'system-paid-invoice-email' || isPaymentReceipt || isAgreementClient
  const paymentReceiptEndpoint = isAgreementClient ? '/api/marketing/system-messages/agreement-client' : isPaymentReceipt ? '/api/marketing/system-messages/payment-receipt' : '/api/marketing/system-messages/paid-invoice-email'
  const paymentReceiptStarter = isAgreementClient ? { subject: 'Your Luxor agreement is complete', greeting: 'Hi {{first_name}},', closing: 'Thank you for choosing Luxor at Las Palmas Events.' } : isPaymentReceipt ? { subject: 'Your Luxor payment receipt', greeting: 'Hi {{first_name}},', closing: 'Thank you for choosing Luxor at Las Palmas Events. We’re looking forward to helping make your event special.' } : PAID_INVOICE_EMAIL_STARTER
  const isOfferSystem = workflowId === 'system-offer-email' || isPaymentRequestEmail
  const offerEndpoint = isPaymentRequestEmail ? '/api/marketing/system-messages/payment-request-email' : '/api/marketing/system-messages/offer-email'
  const offerWorkflowName = isPaymentRequestEmail ? 'Payment request reminder' : 'Proposal offer reminders'
  const offerStepName = isPaymentRequestEmail ? 'Payment request reminder' : 'Proposal offer reminder'
  const receiptKey = workflowId === 'system-tour-request-email' ? 'tour_request_received' : workflowId === 'system-newsletter-email' ? 'newsletter_confirmation' : null
  const isInquiryEmailSystem = workflowId === 'system-inquiry-email' || receiptKey !== null
  const receiptDefault = receiptKey ? RECEIPT_EMAIL_DEFAULTS[receiptKey] : INQUIRY_EMAIL_DEFAULT
  const receiptName = receiptKey === 'tour_request_received' ? 'Tour request received email' : receiptKey === 'newsletter_confirmation' ? 'Newsletter confirmation email' : 'Inquiry acknowledgment email'
  const inquiryEmailEndpoint = receiptKey ? `/api/marketing/system-messages/receipt-email?key=${receiptKey}` : '/api/marketing/system-messages/inquiry-email'
  const isBrochureSystem = workflowId === 'system-brochure'
  const isMultiSystem = isInvoiceSystem || isTourTextSystem
  const isTemplateSystem = isInquirySystem || isPaymentSystem || isEventSystem || isMultiSystem
  const templateEndpoint = `/api/marketing/system-messages/${isEventSystem ? 'event-reminder' : isPaymentSystem ? 'payment-confirmation' : 'inquiry-confirmation'}`
  const phoneKind = workflowId.startsWith('system-phone-') ? workflowId.slice('system-phone-'.length) : ''
  const isPhoneSystem = isPhoneTextWorkflow(phoneKind)
  const isSystem = isTemplateSystem || isPhoneSystem || isTourEmailSystem || isInquiryEmailSystem || isBrochureSystem || isInstallmentSystem || isFinalPaymentSystem || isManualInvoiceReminderSystem || isCalendarMessageSystem || isEventEmailSystem || isAgreementSystem || isOfferSystem || isTourNoShowEmail || isLayoutReviewEmail || isPlannerInvitation || isPlannerVerification || isAgreementOwner || isZelleInstructions || isAgreementPackage || isProposalBreakdown || isPaidInvoiceEmail
  const prebuiltTemplateId = searchParams.get('from')

  const [enabled, setEnabled] = React.useState<boolean | null>(null)
  const [connectedTriggers, setConnectedTriggers] = React.useState<readonly CustomWorkflowTrigger[]>(CUSTOM_WORKFLOW_RUNTIME_TRIGGERS)
  const [workflow, setWorkflow] = React.useState<WorkflowRow | null>(null)
  const [systemMessage, setSystemMessage] = React.useState<{ body: string; revision: number; defaultBody: string; installed: boolean; canEdit: boolean } | null>(null)
  const [invoiceMessages, setInvoiceMessages] = React.useState<Record<string, { body: string; revision: number; defaultBody: string; installed: boolean; canEdit: boolean }> | null>(null)
  const [tourNotificationsEnabled, setTourNotificationsEnabled] = React.useState<boolean | null>(null)
  const [tourEmailSettings, setTourEmailSettings] = React.useState<{ installed: boolean; canEdit: boolean; rows: Record<string, { copy: TourEmailCopy | null; revision: number }> } | null>(null)
  const [tourEmailDrafts, setTourEmailDrafts] = React.useState<Record<string, TourEmailCopy | null>>({})
  const [inquiryEmailSettings, setInquiryEmailSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: InquiryEmailCopy | null; revision: number } | null>(null)
  const [inquiryEmailDraft, setInquiryEmailDraft] = React.useState<InquiryEmailCopy | null>(null)
  const [installmentSettings, setInstallmentSettings] = React.useState<{ installed: boolean; canEdit: boolean; remindersEnabled: boolean | null; schedulingEnabled: boolean; rows: Record<string, { copy: InstallmentReminderCopy | null; revision: number }> } | null>(null)
  const [installmentDrafts, setInstallmentDrafts] = React.useState<Record<string, InstallmentReminderCopy | null>>({})
  const [finalPaymentSettings, setFinalPaymentSettings] = React.useState<{ installed: boolean; canEdit: boolean; remindersEnabled: boolean | null; rows: Record<string, { copy: FinalPaymentReminderCopy | null; revision: number }> } | null>(null)
  const [finalPaymentDrafts, setFinalPaymentDrafts] = React.useState<Record<string, FinalPaymentReminderCopy | null>>({})
  const [manualInvoiceSettings, setManualInvoiceSettings] = React.useState<{ installed: boolean; canEdit: boolean; rows: Record<string, { copy: FinalPaymentReminderCopy | null; revision: number }> } | null>(null)
  const [manualInvoiceDrafts, setManualInvoiceDrafts] = React.useState<Record<string, FinalPaymentReminderCopy | null>>({})
  const [calendarMessageSettings, setCalendarMessageSettings] = React.useState<{ installed: boolean; canEdit: boolean; rows: Record<string, { copy: CalendarCancellationCopy | CalendarUpdateCopy | null; revision: number }> } | null>(null)
  const [calendarMessageDrafts, setCalendarMessageDrafts] = React.useState<Record<string, CalendarCancellationCopy | CalendarUpdateCopy | null>>({})
  const [eventEmailSettings, setEventEmailSettings] = React.useState<{ installed: boolean; canEdit: boolean; rows: Record<string, { copy: EventEmailCopy | null; revision: number }> } | null>(null)
  const [eventEmailDrafts, setEventEmailDrafts] = React.useState<Record<string, EventEmailCopy | null>>({})
  const [agreementSettings, setAgreementSettings] = React.useState<{ installed: boolean; canEdit: boolean; rows: Record<string, { copy: AgreementReminderCopy | null; revision: number }> } | null>(null)
  const [agreementDrafts, setAgreementDrafts] = React.useState<Record<string, AgreementReminderCopy | null>>({})
  const [offerSettings, setOfferSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: OfferReminderCopy | null; revision: number } | null>(null)
  const [offerDraft, setOfferDraft] = React.useState<OfferReminderCopy | null>(null)
  const [noShowSettings, setNoShowSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: TourNoShowEmailCopy | null; revision: number } | null>(null)
  const [noShowDraft, setNoShowDraft] = React.useState<TourNoShowEmailCopy | null>(null)
  const [layoutSettings, setLayoutSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: LayoutReviewEmailCopy | null; revision: number } | null>(null)
  const [layoutDraft, setLayoutDraft] = React.useState<LayoutReviewEmailCopy | null>(null)
  const [plannerSettings, setPlannerSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: PlannerInvitationCopy | null; revision: number } | null>(null)
  const [plannerDraft, setPlannerDraft] = React.useState<PlannerInvitationCopy | null>(null)
  const [verificationSettings, setVerificationSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: PlannerVerificationCopy | null; revision: number } | null>(null)
  const [verificationDraft, setVerificationDraft] = React.useState<PlannerVerificationCopy | null>(null)
  const [ownerSettings, setOwnerSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: AgreementOwnerCopy | null; revision: number } | null>(null)
  const [ownerDraft, setOwnerDraft] = React.useState<AgreementOwnerCopy | null>(null)
  const [zelleSettings, setZelleSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: ZelleInstructionsCopy | null; revision: number } | null>(null)
  const [breakdownSettings, setBreakdownSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: ProposalBreakdownCopy | null; revision: number } | null>(null)
  const [breakdownDraft, setBreakdownDraft] = React.useState<ProposalBreakdownCopy | null>(null)
  const [zelleDraft, setZelleDraft] = React.useState<ZelleInstructionsCopy | null>(null)
  const [agreementPackageSettings, setAgreementPackageSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: AgreementPackageCopy | null; revision: number } | null>(null)
  const [agreementPackageDraft, setAgreementPackageDraft] = React.useState<AgreementPackageCopy | null>(null)
  const [paidInvoiceSettings, setPaidInvoiceSettings] = React.useState<{ installed: boolean; canEdit: boolean; copy: PaidInvoiceEmailCopy | null; revision: number } | null>(null)
  const [paidInvoiceDraft, setPaidInvoiceDraft] = React.useState<PaidInvoiceEmailCopy | null>(null)
  const [brochure, setBrochure] = React.useState<{ templates: BrochureCanvasTemplate[]; canEdit: boolean; enabled: boolean; status: string; delivery: { subject: string; bodyHtml: string; note: string } } | null>(null)
  const [brochureDirty, setBrochureDirty] = React.useState(false)
  const [phoneMessage, setPhoneMessage] = React.useState<{ body: string; revision: string; defaultBody: string; canEdit: boolean; enabled: boolean; cooldownHours: number } | null>(null)
  const [phoneEnabled, setPhoneEnabled] = React.useState(false)
  const [phoneCooldown, setPhoneCooldown] = React.useState(12)
  const [confirmSystemLeave, setConfirmSystemLeave] = React.useState(false)
  const [capabilities, setCapabilities] = React.useState<WorkflowCapabilities | null>(null)

  // Initialize definition draft
  const [nameDraft, setNameDraft] = React.useState(() => {
    if (prebuiltTemplateId) {
      const match = PREBUILT_WORKFLOWS.find((p) => p.id === prebuiltTemplateId)
      if (match) return `${match.name} (Customized)`
    }
    return 'New Custom Workflow'
  })

  const [definitionDraft, setDefinitionDraft] = React.useState<CustomWorkflowDefinition>(() => {
    if (prebuiltTemplateId) {
      const match = PREBUILT_WORKFLOWS.find((p) => p.id === prebuiltTemplateId)
      if (match) return cloneCustomWorkflowDefinition(match.definition)
    }
    return createNewContactFollowUpDefinition()
  })

  const [selectedStepId, setSelectedStepId] = React.useState<string>(() => {
    return definitionDraft.steps[0]?.id || ''
  })

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [activating, setActivating] = React.useState(false)
  const [generatingAiCopy, setGeneratingAiCopy] = React.useState(false)
  const [isArchitectOpen, setIsArchitectOpen] = React.useState(false)
  const [inspectorTab, setInspectorTab] = React.useState<'edit' | 'preview'>('edit')
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [mobileInspectorOpen, setMobileInspectorOpen] = React.useState(false)
  const [inspectorBodyHeight, setInspectorBodyHeight] = React.useState<number | null>(null)
  const [emailOptions, setEmailOptions] = React.useState<WorkflowEmailOptions | null>(null)
  const [emailOptionsError, setEmailOptionsError] = React.useState<string | null>(null)
  const [emailOptionsRetry, setEmailOptionsRetry] = React.useState(0)
  const [duplicating, setDuplicating] = React.useState(false)
  const isDesktopViewport = React.useSyncExternalStore(
    subscribeToWorkflowDesktopViewport,
    getWorkflowDesktopViewportSnapshot,
    () => true,
  )
  const workspaceRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLDivElement>(null)
  const inspectorRef = React.useRef<HTMLDivElement>(null)
  const inspectorContentRef = React.useRef<HTMLDivElement>(null)
  const callScriptEditorRef = React.useRef<WorkflowTokenEditorHandle>(null)
  const inquiryTextRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (!isNew || prebuiltTemplateId) return
    const savedDraft = sessionStorage.getItem('luxor_architect_draft')
    if (!savedDraft) return
    try {
      const draft = JSON.parse(savedDraft) as { name?: unknown; definition?: unknown }
      if (typeof draft.name !== 'string' || validateCustomWorkflowDefinition(draft.definition, { allowIncompleteDraft: true }).length) throw new Error('The Elena workflow draft could not be opened. Generate it again from the workflow builder.')
      const definition = cloneCustomWorkflowDefinition(draft.definition as CustomWorkflowDefinition)
      setNameDraft(draft.name)
      setDefinitionDraft(definition)
      setSelectedStepId(definition.steps[0]?.id || '')
      setFeedback('Elena draft loaded. Review the sender, content, and timing before saving.')
      sessionStorage.removeItem('luxor_architect_draft')
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'The Elena workflow draft could not be opened.')
    }
  }, [isNew, prebuiltTemplateId])

  React.useEffect(() => {
    const scrollport = workspaceRef.current?.closest<HTMLElement>('.portal-scrollbar')
    const columns = [canvasRef.current, inspectorRef.current].filter((column): column is HTMLDivElement => Boolean(column))
    if (!scrollport || columns.length !== 2) return

    // Each column follows the page until its last field reaches the viewport bottom.
    const updateStickyOffsets = () => {
      const bottomPadding = Number.parseFloat(getComputedStyle(scrollport).paddingBottom) || 0
      for (const column of columns) {
        const top = Math.min(0, scrollport.clientHeight - bottomPadding - column.offsetHeight)
        column.style.setProperty('--workflow-sticky-top', `${top}px`)
      }
    }
    const observer = new ResizeObserver(updateStickyOffsets)
    observer.observe(scrollport)
    columns.forEach((column) => observer.observe(column))
    updateStickyOffsets()
    return () => observer.disconnect()
  }, [loading])

  const invoiceKey = selectedStepId === 'invoice_payment_request' ? 'invoice_payment_request' : selectedStepId === 'invoice_overdue_reminder' ? 'invoice_overdue_reminder' : 'invoice_due_reminder'
  const tourKey = selectedStepId === 'tour_reminder' ? 'tour_reminder' : 'tour_confirmation'
  const multiKey = isTourTextSystem ? tourKey : invoiceKey
  const systemStep = isMultiSystem ? definitionDraft.steps.find((step) => step.id === selectedStepId) : definitionDraft.steps[0]
  const systemBody = systemStep?.type === 'text' ? systemStep.body : ''
  const activeSystemMessage = isMultiSystem ? invoiceMessages?.[multiKey] : systemMessage
  const invoiceDirty = Boolean(invoiceMessages && definitionDraft.steps.some((step) => step.type === 'text' && invoiceMessages[step.id] && step.body !== invoiceMessages[step.id].body))
  const tourEmailKey = TOUR_EMAIL_NOTICE_KEYS.includes(selectedStepId as TourEmailNoticeKey) ? selectedStepId as TourEmailNoticeKey : 'confirmation'
  const tourEmailDirty = Boolean(tourEmailSettings && TOUR_EMAIL_NOTICE_KEYS.some((key) => JSON.stringify(tourEmailDrafts[key]) !== JSON.stringify(tourEmailSettings.rows[key]?.copy)))
  const activeTourEmailDirty = Boolean(tourEmailSettings && JSON.stringify(tourEmailDrafts[tourEmailKey]) !== JSON.stringify(tourEmailSettings.rows[tourEmailKey]?.copy))
  const installmentKey = INSTALLMENT_REMINDER_KEYS.includes(selectedStepId as InstallmentReminderKey) ? selectedStepId as InstallmentReminderKey : 'installment_7_days_before'
  const installmentDirty = Boolean(installmentSettings && INSTALLMENT_REMINDER_KEYS.some((key) => JSON.stringify(installmentDrafts[key]) !== JSON.stringify(installmentSettings.rows[key]?.copy)))
  const activeInstallmentDirty = Boolean(installmentSettings && JSON.stringify(installmentDrafts[installmentKey]) !== JSON.stringify(installmentSettings.rows[installmentKey]?.copy))
  const finalPaymentKey = FINAL_PAYMENT_REMINDER_KEYS.includes(selectedStepId as FinalPaymentReminderKey) ? selectedStepId as FinalPaymentReminderKey : 'payment_request'
  const finalPaymentDirty = Boolean(finalPaymentSettings && FINAL_PAYMENT_REMINDER_KEYS.some((key) => JSON.stringify(finalPaymentDrafts[key]) !== JSON.stringify(finalPaymentSettings.rows[key]?.copy)))
  const activeFinalPaymentDirty = Boolean(finalPaymentSettings && JSON.stringify(finalPaymentDrafts[finalPaymentKey]) !== JSON.stringify(finalPaymentSettings.rows[finalPaymentKey]?.copy))
  const manualInvoiceKey = MANUAL_INVOICE_REMINDER_KEYS.includes(selectedStepId as ManualInvoiceReminderKey) ? selectedStepId as ManualInvoiceReminderKey : 'unpaid_invoice'
  const manualInvoiceDirty = Boolean(manualInvoiceSettings && MANUAL_INVOICE_REMINDER_KEYS.some((key) => JSON.stringify(manualInvoiceDrafts[key]) !== JSON.stringify(manualInvoiceSettings.rows[key]?.copy)))
  const activeManualInvoiceDirty = Boolean(manualInvoiceSettings && JSON.stringify(manualInvoiceDrafts[manualInvoiceKey]) !== JSON.stringify(manualInvoiceSettings.rows[manualInvoiceKey]?.copy))
  const calendarMessageKey = CALENDAR_MESSAGE_KEYS.includes(selectedStepId as CalendarMessageKey) ? selectedStepId as CalendarMessageKey : 'cancellation'
  const calendarMessageDirty = Boolean(calendarMessageSettings && CALENDAR_MESSAGE_KEYS.some((key) => JSON.stringify(calendarMessageDrafts[key]) !== JSON.stringify(calendarMessageSettings.rows[key]?.copy)))
  const activeCalendarMessageDirty = Boolean(calendarMessageSettings && JSON.stringify(calendarMessageDrafts[calendarMessageKey]) !== JSON.stringify(calendarMessageSettings.rows[calendarMessageKey]?.copy))
  const eventEmailKey = EVENT_EMAIL_KEYS.includes(selectedStepId as EventEmailKey) ? selectedStepId as EventEmailKey : 'details'
  const eventEmailDirty = Boolean(eventEmailSettings && EVENT_EMAIL_KEYS.some((key) => JSON.stringify(eventEmailDrafts[key]) !== JSON.stringify(eventEmailSettings.rows[key]?.copy)))
  const activeEventEmailDirty = Boolean(eventEmailSettings && JSON.stringify(eventEmailDrafts[eventEmailKey]) !== JSON.stringify(eventEmailSettings.rows[eventEmailKey]?.copy))
  const agreementKey = AGREEMENT_REMINDER_KEYS.includes(selectedStepId as AgreementReminderKey) ? selectedStepId as AgreementReminderKey : 'view'
  const agreementDirty = Boolean(agreementSettings && AGREEMENT_REMINDER_KEYS.some((key) => JSON.stringify(agreementDrafts[key]) !== JSON.stringify(agreementSettings.rows[key]?.copy)))
  const activeAgreementDirty = Boolean(agreementSettings && JSON.stringify(agreementDrafts[agreementKey]) !== JSON.stringify(agreementSettings.rows[agreementKey]?.copy))
  const offerDirty = Boolean(offerSettings && JSON.stringify(offerDraft) !== JSON.stringify(offerSettings.copy))
  const noShowDirty = Boolean(noShowSettings && JSON.stringify(noShowDraft) !== JSON.stringify(noShowSettings.copy))
  const paidInvoiceDirty = Boolean(paidInvoiceSettings && JSON.stringify(paidInvoiceDraft) !== JSON.stringify(paidInvoiceSettings.copy))
  const zelleDirty = Boolean(zelleSettings && JSON.stringify(zelleDraft) !== JSON.stringify(zelleSettings.copy))
  const agreementPackageDirty = Boolean(agreementPackageSettings && JSON.stringify(agreementPackageDraft) !== JSON.stringify(agreementPackageSettings.copy))
  const breakdownDirty = Boolean(breakdownSettings && JSON.stringify(breakdownDraft) !== JSON.stringify(breakdownSettings.copy))
  const plannerDirty = Boolean(plannerSettings && JSON.stringify(plannerDraft) !== JSON.stringify(plannerSettings.copy))
  const verificationDirty = Boolean(verificationSettings && JSON.stringify(verificationDraft) !== JSON.stringify(verificationSettings.copy))
  const ownerDirty = Boolean(ownerSettings && JSON.stringify(ownerDraft) !== JSON.stringify(ownerSettings.copy))
  const layoutDirty = Boolean(layoutSettings && JSON.stringify(layoutDraft) !== JSON.stringify(layoutSettings.copy))
  const inquiryEmailDirty = Boolean(inquiryEmailSettings && JSON.stringify(inquiryEmailDraft) !== JSON.stringify(inquiryEmailSettings.copy))
  const dirty = isBrochureSystem ? brochureDirty : isPaidInvoiceEmail ? paidInvoiceDirty : isZelleInstructions ? zelleDirty : isAgreementPackage ? agreementPackageDirty : isProposalBreakdown ? breakdownDirty : isPlannerInvitation ? plannerDirty : isPlannerVerification ? verificationDirty : isAgreementOwner ? ownerDirty : isLayoutReviewEmail ? layoutDirty : isTourNoShowEmail ? noShowDirty : isOfferSystem ? offerDirty : isInquiryEmailSystem ? inquiryEmailDirty : isTourEmailSystem ? tourEmailDirty : isInstallmentSystem ? installmentDirty : isFinalPaymentSystem ? finalPaymentDirty : isManualInvoiceReminderSystem ? manualInvoiceDirty : isCalendarMessageSystem ? calendarMessageDirty : isEventEmailSystem ? eventEmailDirty : isAgreementSystem ? agreementDirty : isMultiSystem ? invoiceDirty : isPhoneSystem ? Boolean(phoneMessage && (systemBody !== phoneMessage.body || phoneEnabled !== phoneMessage.enabled || (phoneKind === 'inbound_acknowledgment' && phoneCooldown !== phoneMessage.cooldownHours))) : isTemplateSystem ? Boolean(systemMessage && systemBody !== systemMessage.body) : isNew
    ? Boolean(nameDraft.trim() !== 'New Custom Workflow' || definitionDraft.steps.length > 0)
    : Boolean(
        workflow &&
          workflow.status === 'draft' &&
          (nameDraft !== workflow.name ||
            JSON.stringify(definitionDraft) !== JSON.stringify(workflow.draft_definition)),
      )

  const selectedStep = definitionDraft.steps.find((s) => s.id === selectedStepId) || null
  const validationErrors = React.useMemo(() => validateCustomWorkflowDefinition(definitionDraft), [definitionDraft])
  const editable = isBrochureSystem ? brochure?.canEdit === true : isPaidInvoiceEmail ? paidInvoiceSettings?.canEdit === true : isZelleInstructions ? zelleSettings?.canEdit === true : isAgreementPackage ? agreementPackageSettings?.canEdit === true : isProposalBreakdown ? breakdownSettings?.canEdit === true : isPlannerInvitation ? plannerSettings?.canEdit === true : isPlannerVerification ? verificationSettings?.canEdit === true : isAgreementOwner ? ownerSettings?.canEdit === true : isLayoutReviewEmail ? layoutSettings?.canEdit === true : isTourNoShowEmail ? noShowSettings?.canEdit === true : isOfferSystem ? offerSettings?.canEdit === true : isInquiryEmailSystem ? inquiryEmailSettings?.canEdit === true : isTourEmailSystem ? tourEmailSettings?.canEdit === true : isInstallmentSystem ? installmentSettings?.canEdit === true : isFinalPaymentSystem ? finalPaymentSettings?.canEdit === true : isManualInvoiceReminderSystem ? manualInvoiceSettings?.canEdit === true : isCalendarMessageSystem ? calendarMessageSettings?.canEdit === true : isEventEmailSystem ? eventEmailSettings?.canEdit === true : isAgreementSystem ? agreementSettings?.canEdit === true : isPhoneSystem ? phoneMessage?.canEdit === true : isTemplateSystem ? activeSystemMessage?.canEdit === true : enabled === true && (isNew || workflow?.status === 'draft')
  const readOnlyVersion = Boolean(workflow && workflow.status !== 'draft')
  const canChangeLifecycle = workflow?.status === 'active' ? capabilities?.canPause : workflow?.status === 'paused' ? capabilities?.canResume : capabilities?.canActivate
  const triggerConnected = connectedTriggers.includes(definitionDraft.trigger)
  let systemPreview = ''
  if (isTemplateSystem) {
    try { systemPreview = isTourTextSystem ? renderTourText(systemBody, tourKey, { name: 'Sarah Jenkins', date: 'October 24, 2026', time: '11:00 AM' }) : isInvoiceSystem ? renderInvoiceReminder(systemBody, { name: 'Sarah Jenkins', amount: '$100.00', dueDate: 'October 24, 2026', paymentUrl: 'https://example.invalid/payment' }, invoiceKey) : isEventSystem ? renderEventReminder(systemBody, { name: 'Sarah Jenkins', eventType: 'Wedding Reception', timeUntil: 'one week', eventDate: 'October 24, 2026' }) : isPaymentSystem ? renderPaymentConfirmation(systemBody, { name: 'Sarah Jenkins', amount: '$100.00' }) : renderInquiryConfirmation(systemBody, { fullName: 'Sarah Jenkins', eventType: 'Wedding Reception', guestCount: 150, targetDate: '2026-10-24' }) } catch { /* An incomplete draft can be edited before saving. */ }
  }

  React.useEffect(() => {
    if (!isSystem || !dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, isSystem])

  React.useEffect(() => {
    if (isSystem) return
    const controller = new AbortController()
    fetch('/api/marketing/custom-workflows/email-options', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as WorkflowEmailOptions & { error?: string }
        if (!response.ok || !Array.isArray(payload.senders)) throw new Error(payload.error || 'Approved email senders could not load.')
        setEmailOptions(payload)
        setEmailOptionsError(null)
      })
      .catch((requestError: unknown) => { if (!controller.signal.aborted) setEmailOptionsError(requestError instanceof Error ? requestError.message : 'Approved email senders could not load.') })
    return () => controller.abort()
  }, [emailOptionsRetry, isSystem])

  function updateEmailSettings(patch: Partial<NonNullable<CustomWorkflowDefinition['emailSettings']>>) {
    if (!editable) return
    setDefinitionDraft((current) => ({ ...current, emailSettings: { senderMode: 'operator', senderEmail: emailOptions?.senders[0] || '', ...current.emailSettings, ...patch } }))
    setFeedback(null)
  }

  React.useLayoutEffect(() => {
    const content = inspectorContentRef.current
    const body = content?.parentElement
    if (!content || !body) return

    const updateHeight = () => {
      const style = window.getComputedStyle(body)
      const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      setInspectorBodyHeight(Math.ceil(content.scrollHeight + verticalPadding))
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(content)
    updateHeight()
    return () => observer.disconnect()
  }, [inspectorTab, isDesktopViewport, selectedStepId])

  // Check authoring status
  React.useEffect(() => {
    if (isSystem) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch('/api/marketing/custom-workflows', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          enabled?: boolean
          connectedTriggers?: CustomWorkflowTrigger[]
          error?: string
        }
        if (!response.ok) throw new Error(payload.error || 'Custom workflow storage could not be checked.')
        setEnabled(payload.enabled === true)
        setConnectedTriggers(Array.isArray(payload.connectedTriggers) ? payload.connectedTriggers : CUSTOM_WORKFLOW_RUNTIME_TRIGGERS)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Could not check workflow authorization.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [isSystem])

  React.useEffect(() => {
    if (!isPhoneSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setPhoneMessage(null)
    fetch(`/api/marketing/system-messages/phone-text?kind=${encodeURIComponent(phoneKind)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { body?: string; revision?: string; defaultBody?: string; enabled?: boolean; cooldownHours?: number; canEdit?: boolean; error?: string }
        if (!response.ok || typeof payload.body !== 'string' || typeof payload.revision !== 'string' || typeof payload.defaultBody !== 'string' || typeof payload.enabled !== 'boolean' || typeof payload.cooldownHours !== 'number') throw new Error(payload.error || 'Phone automation could not load.')
        const name = phoneKind === 'missed_call' ? 'Missed-call reply' : 'Incoming-text acknowledgment'
        const step: CustomWorkflowStep = { id: 'phone-system-text', type: 'text', name, body: payload.body, requiredConsentScope: 'marketing' }
        setPhoneMessage({ body: payload.body, revision: payload.revision, defaultBody: payload.defaultBody, enabled: payload.enabled, cooldownHours: payload.cooldownHours, canEdit: payload.canEdit === true })
        setPhoneEnabled(payload.enabled); setPhoneCooldown(payload.cooldownHours); setNameDraft(name)
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [step] }); setSelectedStepId(step.id)
      })
      .catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Phone automation could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isPhoneSystem, phoneKind, refreshKey])

  React.useEffect(() => {
    if (!isTemplateSystem || isMultiSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setSystemMessage(null)
    fetch(templateEndpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { template?: { body_template: string; revision: number }; defaultBody?: string; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.template || typeof payload.defaultBody !== 'string') throw new Error(payload.error || 'System workflow could not load.')
        const name = isEventSystem ? 'Event reminder text' : isPaymentSystem ? 'Payment confirmation text' : 'Inquiry confirmation text'
        const step: CustomWorkflowStep = { id: 'system-template-text', type: 'text', name, body: payload.template.body_template, requiredConsentScope: 'marketing' }
        setSystemMessage({ body: payload.template.body_template, revision: payload.template.revision, defaultBody: payload.defaultBody, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setNameDraft(name)
        setDefinitionDraft({ schemaVersion: 1, trigger: 'contact_form_inquiry_created', steps: [step] })
        setSelectedStepId(step.id)
      })
      .catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'System workflow could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isTemplateSystem, isPaymentSystem, isEventSystem, isMultiSystem, templateEndpoint, refreshKey])

  React.useEffect(() => {
    if (!isBrochureSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setBrochure(null)
    Promise.all(['/api/marketing/automation-detail?id=brochure_lead', '/api/marketing/automations'].map(async (url) => {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Brochure workflow could not load.')
      return payload
    })).then((payloads) => {
      const [detail, library] = payloads as [{ kind?: string; name?: string; templates?: BrochureCanvasTemplate[]; automation?: { enabled?: boolean }; status?: string; brochureDelivery?: { subject: string; bodyHtml: string; note: string } }, { workflows?: Array<{ id: string; canToggle: boolean }> }]
      if (detail.kind !== 'saved' || !Array.isArray(detail.templates) || !detail.brochureDelivery?.bodyHtml) throw new Error('Brochure workflow could not load.')
      const templates = [...detail.templates].sort((a, b) => a.sort_order - b.sort_order)
      const steps: CustomWorkflowStep[] = templates.map((template) => template.channel === 'phone' ? { id: template.id, type: 'call_task', name: template.name, scriptNotes: template.body || '', dueWithinHours: 24, priority: 'medium' } : { id: template.id, type: 'email', mode: 'marketing', name: template.name, subject: template.uses_existing_delivery ? detail.brochureDelivery!.subject : template.subject || '', previewText: '', body: template.body || '', ctaText: template.cta_text || '', ctaUrl: template.cta_url || '' })
      setBrochure({ templates, canEdit: library.workflows?.find((item) => item.id === 'brochure_lead')?.canToggle === true, enabled: detail.automation?.enabled === true, status: detail.status || 'unknown', delivery: detail.brochureDelivery })
      setNameDraft(detail.name || 'Brochure Lead Follow-Up'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps }); setSelectedStepId((current) => steps.some((step) => step.id === current) ? current : steps[0]?.id || '')
    }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Brochure workflow could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isBrochureSystem, refreshKey])

  React.useEffect(() => {
    if (!isInquiryEmailSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setInquiryEmailSettings(null)
    fetch(inquiryEmailEndpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: InquiryEmailCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Inquiry email could not load.')
        setInquiryEmailSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setInquiryEmailDraft(payload.setting.copy_override)
        setNameDraft(receiptName)
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'inquiry-email', type: 'email', mode: 'marketing', name: receiptName, subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('inquiry-email')
      })
      .catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Inquiry email could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isInquiryEmailSystem, inquiryEmailEndpoint, receiptName, refreshKey])

  React.useEffect(() => {
    if (!isPaidInvoiceEmail) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setPaidInvoiceSettings(null)
    fetch(paymentReceiptEndpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: PaidInvoiceEmailCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Paid-invoice email could not load.')
        setPaidInvoiceSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setPaidInvoiceDraft(payload.setting.copy_override)
        setNameDraft(isAgreementClient ? 'Executed agreement email' : isPaymentReceipt ? 'Staff-requested payment receipt' : 'Paid-invoice confirmation email')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'receipt', type: 'email', mode: 'marketing', name: isAgreementClient ? 'Executed agreement email' : isPaymentReceipt ? 'Payment receipt' : 'Paid-invoice confirmation', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('receipt')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Paid-invoice email could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isPaidInvoiceEmail, isAgreementClient, isPaymentReceipt, paymentReceiptEndpoint, refreshKey])

  React.useEffect(() => {
    if (!isZelleInstructions) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setZelleSettings(null)
    fetch('/api/marketing/system-messages/zelle-instructions', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: ZelleInstructionsCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Zelle instructions could not load.')
        setZelleSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setZelleDraft(payload.setting.copy_override)
        setNameDraft('Zelle payment instructions')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'instructions', type: 'email', mode: 'marketing', name: 'Zelle payment instructions', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('instructions')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Zelle instructions could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isZelleInstructions, refreshKey])

  React.useEffect(() => {
    if (!isAgreementPackage) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setAgreementPackageSettings(null)
    fetch('/api/marketing/system-messages/agreement-package', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: AgreementPackageCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Agreement package could not load.')
        setAgreementPackageSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setAgreementPackageDraft(payload.setting.copy_override)
        setNameDraft('Event Agreement package')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'package', type: 'email', mode: 'marketing', name: 'Event Agreement package', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('package')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Agreement package could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isAgreementPackage, refreshKey])

  React.useEffect(() => {
    if (!isProposalBreakdown) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setBreakdownSettings(null)
    fetch('/api/marketing/system-messages/proposal-breakdown', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: ProposalBreakdownCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Proposal breakdown email could not load.')
        setBreakdownSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setBreakdownDraft(payload.setting.copy_override)
        setNameDraft('Staff-requested proposal breakdown')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'breakdown', type: 'email', mode: 'marketing', name: 'Package comparison email', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('breakdown')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Proposal breakdown email could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isProposalBreakdown, refreshKey])

  React.useEffect(() => {
    if (!isPlannerInvitation) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setPlannerSettings(null)
    fetch('/api/marketing/system-messages/planner-invitation', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: PlannerInvitationCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Planner invitation could not load.')
        setPlannerSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setPlannerDraft(payload.setting.copy_override)
        setNameDraft('Planner presentation invitation')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'invitation', type: 'email', mode: 'marketing', name: 'Planner presentation invitation', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('invitation')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Planner invitation could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isPlannerInvitation, refreshKey])

  React.useEffect(() => {
    if (!isPlannerVerification) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setVerificationSettings(null)
    fetch('/api/marketing/system-messages/planner-verification', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: PlannerVerificationCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Planner verification email could not load.')
        setVerificationSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setVerificationDraft(payload.setting.copy_override)
        setNameDraft('Planner verification code')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'verification', type: 'email', mode: 'marketing', name: 'Verification code', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('verification')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Planner verification email could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isPlannerVerification, refreshKey])

  React.useEffect(() => {
    if (!isAgreementOwner) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setOwnerSettings(null)
    fetch('/api/marketing/system-messages/agreement-owner', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: AgreementOwnerCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Agreement owner audit could not load.')
        setOwnerSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setOwnerDraft(payload.setting.copy_override)
        setNameDraft('Executed agreement owner audit')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'owner_audit', type: 'email', mode: 'marketing', name: 'Owner audit copy', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('owner_audit')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Agreement owner audit could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isAgreementOwner, refreshKey])

  React.useEffect(() => {
    if (!isLayoutReviewEmail) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setLayoutSettings(null)
    fetch('/api/marketing/system-messages/layout-review-email', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: LayoutReviewEmailCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Layout review email could not load.')
        setLayoutSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setLayoutDraft(payload.setting.copy_override)
        setNameDraft('Layout review email')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'layout', type: 'email', mode: 'marketing', name: 'Layout review invitation', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('layout')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Layout review email could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isLayoutReviewEmail, refreshKey])

  React.useEffect(() => {
    if (!isTourNoShowEmail) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setNoShowSettings(null)
    fetch('/api/marketing/system-messages/tour-no-show-email', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: TourNoShowEmailCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Tour no-show email could not load.')
        setNoShowSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setNoShowDraft(payload.setting.copy_override)
        setNameDraft('Tour no-show email')
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'no-show', type: 'email', mode: 'marketing', name: 'Reschedule email', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('no-show')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Tour no-show email could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isTourNoShowEmail, refreshKey])

  React.useEffect(() => {
    if (!isOfferSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setOfferSettings(null)
    fetch(offerEndpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setting?: { copy_override: OfferReminderCopy | null; revision: number }; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Offer reminder could not load.')
        setOfferSettings({ copy: payload.setting.copy_override, revision: payload.setting.revision, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setOfferDraft(payload.setting.copy_override)
        setNameDraft(offerWorkflowName)
        setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps: [{ id: 'offer', type: 'email', mode: 'marketing', name: offerStepName, subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }] })
        setSelectedStepId('offer')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Offer reminder could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isOfferSystem, offerEndpoint, offerWorkflowName, offerStepName, refreshKey])

  React.useEffect(() => {
    if (!isAgreementSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setAgreementSettings(null)
    fetch('/api/marketing/system-messages/agreement-email', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { settings?: Array<{ key: AgreementReminderKey; copy_override: AgreementReminderCopy | null; revision: number }>; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !Array.isArray(payload.settings) || AGREEMENT_REMINDER_KEYS.some((key) => !payload.settings!.some((row) => row.key === key))) throw new Error(payload.error || 'Agreement reminders could not load.')
        setAgreementSettings({ rows: Object.fromEntries(payload.settings.map((row) => [row.key, { copy: row.copy_override, revision: row.revision }])), installed: payload.installed === true, canEdit: payload.canEdit === true })
        setAgreementDrafts(Object.fromEntries(payload.settings.map((row) => [row.key, row.copy_override])))
        const steps: CustomWorkflowStep[] = AGREEMENT_REMINDER_KEYS.map((key) => ({ id: key, type: 'email', mode: 'marketing', name: key === 'view' ? 'Agreement review reminder' : 'Agreement signature reminder', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }))
        setNameDraft('Agreement reminders'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps })
        setSelectedStepId(searchParams.get('step') === 'sign' ? 'sign' : 'view')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Agreement reminders could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isAgreementSystem, searchParams, refreshKey])

  React.useEffect(() => {
    if (!isEventEmailSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setEventEmailSettings(null)
    fetch('/api/marketing/system-messages/event-email', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { settings?: Array<{ key: EventEmailKey; copy_override: EventEmailCopy | null; revision: number }>; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !Array.isArray(payload.settings) || EVENT_EMAIL_KEYS.some((key) => !payload.settings!.some((row) => row.key === key))) throw new Error(payload.error || 'Event emails could not load.')
        setEventEmailSettings({ rows: Object.fromEntries(payload.settings.map((row) => [row.key, { copy: row.copy_override, revision: row.revision }])), installed: payload.installed === true, canEdit: payload.canEdit === true })
        setEventEmailDrafts(Object.fromEntries(payload.settings.map((row) => [row.key, row.copy_override])))
        const names: Record<EventEmailKey, string> = { details: 'Final event details', day: 'Event reminder', thanks: 'Post-event thank you' }
        const steps: CustomWorkflowStep[] = EVENT_EMAIL_KEYS.map((key) => ({ id: key, type: 'email', mode: 'marketing', name: names[key], subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }))
        setNameDraft('Event reminders and follow-up'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps })
        const requested = searchParams.get('step') as EventEmailKey | null
        setSelectedStepId(requested && EVENT_EMAIL_KEYS.includes(requested) ? requested : 'details')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Event emails could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isEventEmailSystem, searchParams, refreshKey])

  React.useEffect(() => {
    if (!isFinalPaymentSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setFinalPaymentSettings(null)
    fetch('/api/marketing/system-messages/final-payment-email', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { settings?: Array<{ key: FinalPaymentReminderKey; copy_override: FinalPaymentReminderCopy | null; revision: number }>; installed?: boolean; canEdit?: boolean; remindersEnabled?: boolean | null; error?: string }
        if (!response.ok || !Array.isArray(payload.settings) || FINAL_PAYMENT_REMINDER_KEYS.some((key) => !payload.settings!.some((row) => row.key === key))) throw new Error(payload.error || 'Final payment reminders could not load.')
        setFinalPaymentSettings({ rows: Object.fromEntries(payload.settings.map((row) => [row.key, { copy: row.copy_override, revision: row.revision }])), installed: payload.installed === true, canEdit: payload.canEdit === true, remindersEnabled: typeof payload.remindersEnabled === 'boolean' ? payload.remindersEnabled : null })
        setFinalPaymentDrafts(Object.fromEntries(payload.settings.map((row) => [row.key, row.copy_override])))
        const names: Record<FinalPaymentReminderKey, string> = { payment_request: 'Initial payment request window', '14_days': 'Two-week reminder window', '7_days': 'One-week reminder window', due_date: 'Due-date follow-up window' }
        const steps: CustomWorkflowStep[] = FINAL_PAYMENT_REMINDER_KEYS.map((key) => ({ id: key, type: 'email', mode: 'marketing', name: names[key], subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }))
        setNameDraft('Final payment reminders'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps })
        const requested = searchParams.get('step') as FinalPaymentReminderKey | null
        setSelectedStepId(requested && FINAL_PAYMENT_REMINDER_KEYS.includes(requested) ? requested : 'payment_request')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Final payment reminders could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isFinalPaymentSystem, searchParams, refreshKey])

  React.useEffect(() => {
    if (!isManualInvoiceReminderSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setManualInvoiceSettings(null)
    fetch('/api/marketing/system-messages/manual-invoice-reminder', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { settings?: Array<{ key: ManualInvoiceReminderKey; copy_override: FinalPaymentReminderCopy | null; revision: number }>; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !Array.isArray(payload.settings) || MANUAL_INVOICE_REMINDER_KEYS.some((key) => !payload.settings!.some((row) => row.key === key))) throw new Error(payload.error || 'Manual invoice reminders could not load.')
        setManualInvoiceSettings({ rows: Object.fromEntries(payload.settings.map((row) => [row.key, { copy: row.copy_override, revision: row.revision }])), installed: payload.installed === true, canEdit: payload.canEdit === true })
        setManualInvoiceDrafts(Object.fromEntries(payload.settings.map((row) => [row.key, row.copy_override])))
        const names: Record<ManualInvoiceReminderKey, string> = { unpaid_invoice: 'Deposit or security reminder', final_payment: 'Final balance reminder' }
        const steps: CustomWorkflowStep[] = MANUAL_INVOICE_REMINDER_KEYS.map((key) => ({ id: key, type: 'email', mode: 'marketing', name: names[key], subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }))
        setNameDraft('Staff-requested invoice reminder'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps })
        const requested = searchParams.get('step') as ManualInvoiceReminderKey | null
        setSelectedStepId(requested && MANUAL_INVOICE_REMINDER_KEYS.includes(requested) ? requested : 'unpaid_invoice')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Manual invoice reminders could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isManualInvoiceReminderSystem, searchParams, refreshKey])

  React.useEffect(() => {
    if (!isCalendarMessageSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setCalendarMessageSettings(null)
    fetch('/api/marketing/system-messages/calendar-messages', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { settings?: Array<{ key: CalendarMessageKey; copy_override: CalendarCancellationCopy | CalendarUpdateCopy | null; revision: number }>; installed?: boolean; canEdit?: boolean; error?: string }
        if (!response.ok || !Array.isArray(payload.settings) || CALENDAR_MESSAGE_KEYS.some((key) => !payload.settings!.some((row) => row.key === key))) throw new Error(payload.error || 'Calendar messages could not load.')
        setCalendarMessageSettings({ rows: Object.fromEntries(payload.settings.map((row) => [row.key, { copy: row.copy_override, revision: row.revision }])), installed: payload.installed === true, canEdit: payload.canEdit === true })
        setCalendarMessageDrafts(Object.fromEntries(payload.settings.map((row) => [row.key, row.copy_override])))
        const names: Record<CalendarMessageKey, string> = { cancellation: 'Calendar cancellation', update: 'Calendar update' }
        const steps: CustomWorkflowStep[] = CALENDAR_MESSAGE_KEYS.map((key) => ({ id: key, type: 'email', mode: 'marketing', name: names[key], subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }))
        setNameDraft('Calendar cancellation and updates'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps })
        const requested = searchParams.get('step') as CalendarMessageKey | null
        setSelectedStepId(requested && CALENDAR_MESSAGE_KEYS.includes(requested) ? requested : 'cancellation')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Calendar messages could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isCalendarMessageSystem, searchParams, refreshKey])

  React.useEffect(() => {
    if (!isInstallmentSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setInstallmentSettings(null)
    fetch('/api/marketing/system-messages/installment-email', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { settings?: Array<{ key: InstallmentReminderKey; copy_override: InstallmentReminderCopy | null; revision: number }>; installed?: boolean; canEdit?: boolean; remindersEnabled?: boolean | null; schedulingEnabled?: boolean; error?: string }
        if (!response.ok || !Array.isArray(payload.settings) || INSTALLMENT_REMINDER_KEYS.some((key) => !payload.settings!.some((row) => row.key === key))) throw new Error(payload.error || 'Installment reminders could not load.')
        setInstallmentSettings({ rows: Object.fromEntries(payload.settings.map((row) => [row.key, { copy: row.copy_override, revision: row.revision }])), installed: payload.installed === true, canEdit: payload.canEdit === true, remindersEnabled: typeof payload.remindersEnabled === 'boolean' ? payload.remindersEnabled : null, schedulingEnabled: payload.schedulingEnabled === true })
        setInstallmentDrafts(Object.fromEntries(payload.settings.map((row) => [row.key, row.copy_override])))
        const steps: CustomWorkflowStep[] = INSTALLMENT_REMINDER_KEYS.map((key) => ({ id: key, type: 'email', mode: 'marketing', name: key === 'installment_7_days_before' ? 'Seven days before due' : 'One day overdue', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }))
        setNameDraft('Installment payment reminders'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps })
        setSelectedStepId(searchParams.get('step') === 'overdue' ? 'installment_1_day_overdue' : 'installment_7_days_before')
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Installment reminders could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isInstallmentSystem, searchParams, refreshKey])

  React.useEffect(() => {
    if (!isTourEmailSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setTourEmailSettings(null)
    fetch('/api/marketing/system-messages/tour-email', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { settings?: Array<{ notice_key: TourEmailNoticeKey; copy_override: TourEmailCopy | null; revision: number }>; installed?: boolean; canEdit?: boolean; enabled?: boolean; error?: string }
        if (!response.ok || !Array.isArray(payload.settings) || TOUR_EMAIL_NOTICE_KEYS.some((key) => !payload.settings!.some((row) => row.notice_key === key))) throw new Error(payload.error || 'Tour emails could not load.')
        const rows = Object.fromEntries(payload.settings.map((row) => [row.notice_key, { copy: row.copy_override, revision: row.revision }]))
        setTourEmailSettings({ rows, installed: payload.installed === true, canEdit: payload.canEdit === true })
        setTourEmailDrafts(Object.fromEntries(payload.settings.map((row) => [row.notice_key, row.copy_override])))
        setTourNotificationsEnabled(typeof payload.enabled === 'boolean' ? payload.enabled : null)
        const steps: CustomWorkflowStep[] = TOUR_EMAIL_NOTICE_KEYS.map((key) => ({ id: key, type: 'email', mode: 'marketing', name: key === 'confirmation' ? 'Confirmation and calendar invitation' : key === 'reminder_24' ? '24-hour reminder' : '2-hour reminder', subject: '', previewText: '', body: '', ctaText: '', ctaUrl: '' }))
        setNameDraft('Tour confirmation and reminder emails'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps })
        const requested = searchParams.get('step')
        setSelectedStepId(TOUR_EMAIL_NOTICE_KEYS.includes(requested as TourEmailNoticeKey) ? requested! : 'confirmation')
      })
      .catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Tour emails could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isTourEmailSystem, searchParams, refreshKey])

  React.useEffect(() => {
    if (!isMultiSystem) return
    const controller = new AbortController()
    setLoading(true); setError(null); setWorkflow(null); setInvoiceMessages(null)
    const keys = isTourTextSystem ? ['tour_confirmation', 'tour_reminder'] : ['invoice_payment_request', 'invoice_due_reminder', 'invoice_overdue_reminder']
    Promise.all(keys.map(async (key) => {
      const response = await fetch(`/api/marketing/system-messages/${isTourTextSystem ? 'tour-text' : 'invoice-reminder'}?key=${key}`, { cache: 'no-store', signal: controller.signal })
      const payload = await response.json() as { template?: { body_template: string; revision: number }; defaultBody?: string; installed?: boolean; canEdit?: boolean; enabled?: boolean; error?: string }
      if (!response.ok || !payload.template || typeof payload.defaultBody !== 'string') throw new Error(payload.error || 'System messages could not load.')
      return { key, body: payload.template.body_template, revision: payload.template.revision, defaultBody: payload.defaultBody, installed: payload.installed === true, canEdit: payload.canEdit === true, enabled: typeof payload.enabled === 'boolean' ? payload.enabled : null }
    })).then((items) => {
      setInvoiceMessages(Object.fromEntries(items.map(({ key, ...item }) => [key, item])))
      setTourNotificationsEnabled(isTourTextSystem && items.every((item) => item.enabled === items[0].enabled) ? items[0].enabled : null)
      const steps: CustomWorkflowStep[] = items.map((item) => ({ id: item.key, type: 'text', name: item.key === 'tour_confirmation' ? 'Tour confirmation text' : item.key === 'tour_reminder' ? 'Tour reminder text' : item.key === 'invoice_payment_request' ? 'Payment request follow-up' : item.key === 'invoice_due_reminder' ? 'Three days before due' : 'One day after due', body: item.body, requiredConsentScope: 'marketing' }))
      setNameDraft(isTourTextSystem ? 'Tour confirmation and reminder texts' : 'Invoice reminder texts'); setDefinitionDraft({ schemaVersion: 1, trigger: 'manual', steps })
      setSelectedStepId(isTourTextSystem ? (searchParams.get('step') === 'reminder' ? 'tour_reminder' : 'tour_confirmation') : searchParams.get('step') === 'payment-request' ? 'invoice_payment_request' : workflowId === 'system-invoice-overdue' || searchParams.get('step') === 'overdue' ? 'invoice_overdue_reminder' : 'invoice_due_reminder')
    }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'System messages could not load.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isMultiSystem, isTourTextSystem, workflowId, searchParams, refreshKey])

  // Load existing workflow if not new
  React.useEffect(() => {
    if (isNew || isSystem || enabled === null) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflowId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as WorkflowPayload
        if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Workflow could not load.')
        setWorkflow(payload.workflow)
        setCapabilities(payload.capabilities || null)
        setNameDraft(payload.workflow.name)
        const displayedDefinition = payload.definition || payload.workflow.draft_definition
        setDefinitionDraft(cloneCustomWorkflowDefinition(displayedDefinition))
        setSelectedStepId(displayedDefinition.steps[0]?.id || '')
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Workflow could not load.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [enabled, isNew, isSystem, refreshKey, workflowId])

  // Step operations
  function changeStep(stepId: string, update: (step: CustomWorkflowStep) => CustomWorkflowStep) {
    if (!editable) return
    setDefinitionDraft((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === stepId ? update(step) : step)),
    }))
    setFeedback(null)
  }

  function updateStepField(stepId: string, key: string, value: unknown) {
    changeStep(stepId, (step) => ({ ...step, [key]: value }) as CustomWorkflowStep)
  }

  function selectStep(stepId: string) {
    if (isBrochureSystem && brochureDirty && stepId !== selectedStepId) { setError('Save or discard the current step changes before choosing another step.'); return }
    setSelectedStepId(stepId)
    setMobileInspectorOpen(true)
  }

  function addStep(type: Exclude<CustomWorkflowChannel, 'end'>) {
    if (!editable) return
    const id = `${type}-${crypto.randomUUID().slice(0, 8)}`
    const next = addCustomWorkflowStep(definitionDraft, type, id)
    setDefinitionDraft(next)
    setSelectedStepId(id)
    setMobileInspectorOpen(true)
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    if (!editable) return
    setDefinitionDraft((current) => moveCustomWorkflowStep(current, stepId, direction))
  }

  function removeStep(stepId: string) {
    if (!editable) return
    const step = definitionDraft.steps.find((c) => c.id === stepId)
    if (!step || !canEditCustomWorkflowStep(step)) return
    if (!window.confirm(`Remove “${step.name}” from this workflow?`)) return
    const next = removeCustomWorkflowStep(definitionDraft, stepId)
    setDefinitionDraft(next)
    setSelectedStepId(next.steps.find((c) => c.id !== stepId)?.id || '')
  }

  function insertInquiryVariable(token: string) {
    const input = inquiryTextRef.current
    if (!input || !selectedStep || !editable || saving) return
    const start = input.selectionStart
    const end = input.selectionEnd
    const next = systemBody.slice(0, start) + token + systemBody.slice(end)
    if (next.length > 300) {
      setError('The message can be no longer than 300 characters.')
      input.focus()
      input.setSelectionRange(start, end)
      return
    }
    setError(null)
    updateStepField(selectedStep.id, 'body', next)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + token.length, start + token.length)
    })
  }

  function handleInsertChip(token: string) {
    if (!selectedStep) return
    if (selectedStep.type === 'email') {
      const current = selectedStep.body || ''
      updateStepField(selectedStep.id, 'body', `${current} ${token}`.trim())
    } else if (selectedStep.type === 'text') {
      const current = selectedStep.body || ''
      updateStepField(selectedStep.id, 'body', `${current} ${token}`.trim())
    } else if (selectedStep.type === 'call_task') {
      callScriptEditorRef.current?.insertToken(token)
    }
  }

  // AI Message Copilot
  async function handleGenerateAiCopy(channel: 'email' | 'text') {
    if (!selectedStep || (selectedStep.type !== 'email' && selectedStep.type !== 'text')) return
    setGeneratingAiCopy(true)
    setError(null)

    try {
      const prompt =
        channel === 'email'
          ? (selectedStep?.type === 'email' ? selectedStep.aiPrompt : null) || 'Warm invitation email for a Luxor tour regarding their event.'
          : (selectedStep?.type === 'text' ? selectedStep.aiPrompt : null) || 'Friendly check-in text from Arianna asking if they want to schedule a tour.'

      const response = await fetch('/api/marketing/custom-workflows/ai-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          prompt,
          step: selectedStep,
          senderMode: definitionDraft.emailSettings?.senderMode || 'operator',
          senderEmail: definitionDraft.emailSettings?.senderEmail || emailOptions?.senders[0],
          leadContext: {
            eventType: '{{event_type}}',
            firstName: '{{first_name}}',
          },
        }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        subject?: string
        previewText?: string
        body?: string
        ctaText?: string
        ctaUrl?: string
        emailDocument?: LuxorEmailDocument
        error?: string
      }

      if (!response.ok || (!data.body && !data.emailDocument)) {
        throw new Error(data.error || 'Elena could not generate copy.')
      }

      if (channel === 'email') {
        changeStep(selectedStep.id, (step) => {
          if (step.type !== 'email') return step
          return {
            ...step,
            subject: data.subject || step.subject,
            previewText: data.previewText || step.previewText,
            body: data.body || step.body,
            ctaText: data.ctaText || step.ctaText,
            ctaUrl: data.ctaUrl || step.ctaUrl,
            ...(data.emailDocument ? { emailDocument: data.emailDocument } : {}),
          }
        })
      } else {
        changeStep(selectedStep.id, (step) => {
          if (step.type !== 'text') return step
          return {
            ...step,
            body: data.body || step.body,
          }
        })
      }
      setFeedback('Sample generated with Elena. Each eligible client receives a fresh version when the workflow runs.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI generation failed.')
    } finally {
      setGeneratingAiCopy(false)
    }
  }

  // Save draft
  async function saveDraft() {
    setSaving(true)
    setError(null)
    setFeedback(null)

    try {
      if (isInquiryEmailSystem) {
        if (!inquiryEmailSettings || !inquiryEmailDirty) return
        const response = await fetch(inquiryEmailEndpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: inquiryEmailDraft, revision: inquiryEmailSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: InquiryEmailCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Inquiry email could not be saved.')
        setInquiryEmailSettings({ ...inquiryEmailSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setInquiryEmailDraft(payload.setting.copy_override)
        setFeedback('Saved for future receipts. Already queued emails keep their existing content.')
      } else if (isPaidInvoiceEmail) {
        if (!paidInvoiceSettings || !paidInvoiceDirty) return
        const response = await fetch(paymentReceiptEndpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: paidInvoiceDraft, revision: paidInvoiceSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: PaidInvoiceEmailCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Paid-invoice email could not save.')
        setPaidInvoiceSettings({ ...paidInvoiceSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setPaidInvoiceDraft(payload.setting.copy_override)
        setFeedback(isAgreementClient ? 'Saved for future agreement emails. Previously queued notices keep their wording and signed attachment.' : isPaymentReceipt ? 'Saved for future receipt previews. Previously queued receipts keep their wording.' : 'Saved for future paid-invoice emails. Previously queued notices keep their wording.')
      } else if (isZelleInstructions) {
        if (!zelleSettings || !zelleDirty) return
        const response = await fetch('/api/marketing/system-messages/zelle-instructions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: zelleDraft, revision: zelleSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: ZelleInstructionsCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Zelle instructions could not save.')
        setZelleSettings({ ...zelleSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setZelleDraft(payload.setting.copy_override)
        setFeedback('Saved for future Zelle instructions. Previously queued emails keep their wording.')
      } else if (isAgreementPackage) {
        if (!agreementPackageSettings || !agreementPackageDirty) return
        const response = await fetch('/api/marketing/system-messages/agreement-package', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: agreementPackageDraft, revision: agreementPackageSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: AgreementPackageCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Agreement package could not save.')
        setAgreementPackageSettings({ ...agreementPackageSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setAgreementPackageDraft(payload.setting.copy_override)
        setFeedback('Saved for future agreement deliveries. Queued jobs keep their snapshot; the worker rebuilds HTML at delivery unless a snapshot is recorded.')
      } else if (isProposalBreakdown) {
        if (!breakdownSettings || !breakdownDirty) return
        const response = await fetch('/api/marketing/system-messages/proposal-breakdown', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: breakdownDraft, revision: breakdownSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: ProposalBreakdownCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Proposal breakdown could not save.')
        setBreakdownSettings({ ...breakdownSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setBreakdownDraft(payload.setting.copy_override)
        setFeedback('Saved for future breakdown emails. Already sent snapshots keep their saved HTML and pricing.')
      } else if (isPlannerInvitation) {
        if (!plannerSettings || !plannerDirty) return
        const response = await fetch('/api/marketing/system-messages/planner-invitation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: plannerDraft, revision: plannerSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: PlannerInvitationCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Planner invitation could not save.')
        setPlannerSettings({ ...plannerSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setPlannerDraft(payload.setting.copy_override)
        setFeedback('Saved for future invitations. Already queued emails keep their wording.')
      } else if (isPlannerVerification) {
        if (!verificationSettings || !verificationDirty) return
        const response = await fetch('/api/marketing/system-messages/planner-verification', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: verificationDraft, revision: verificationSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: PlannerVerificationCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Planner verification email could not save.')
        setVerificationSettings({ ...verificationSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setVerificationDraft(payload.setting.copy_override)
        setFeedback('Saved for future verification emails. Already queued emails keep their wording; the worker still inserts the current code at delivery.')
      } else if (isAgreementOwner) {
        if (!ownerSettings || !ownerDirty) return
        const response = await fetch('/api/marketing/system-messages/agreement-owner', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: ownerDraft, revision: ownerSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: AgreementOwnerCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Agreement owner audit could not save.')
        setOwnerSettings({ ...ownerSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setOwnerDraft(payload.setting.copy_override)
        setFeedback('Saved for future owner audit copies. Previously queued notices keep their wording and audit attachment.')
      } else if (isLayoutReviewEmail) {
        if (!layoutSettings || !layoutDirty) return
        const response = await fetch('/api/marketing/system-messages/layout-review-email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: layoutDraft, revision: layoutSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: LayoutReviewEmailCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Layout review email could not save.')
        setLayoutSettings({ ...layoutSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setLayoutDraft(payload.setting.copy_override)
        setFeedback('Layout review email saved for future messages.')
      } else if (isTourNoShowEmail) {
        if (!noShowSettings || !noShowDirty) return
        const response = await fetch('/api/marketing/system-messages/tour-no-show-email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: noShowDraft, revision: noShowSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: TourNoShowEmailCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Tour no-show email could not save.')
        setNoShowSettings({ ...noShowSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setNoShowDraft(payload.setting.copy_override)
        setFeedback('Tour no-show email saved for future messages.')
      } else if (isOfferSystem) {
        if (!offerSettings || !offerDirty) return
        const response = await fetch(offerEndpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copy: offerDraft, revision: offerSettings.revision }) })
        const payload = await response.json() as { setting?: { copy_override: OfferReminderCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Offer reminder could not save.')
        setOfferSettings({ ...offerSettings, copy: payload.setting.copy_override, revision: payload.setting.revision })
        setOfferDraft(payload.setting.copy_override)
        setFeedback('Reminder saved for future messages.')
      } else if (isCalendarMessageSystem) {
        if (!calendarMessageSettings || !activeCalendarMessageDirty) return
        const response = await fetch('/api/marketing/system-messages/calendar-messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: calendarMessageKey, copy: calendarMessageDrafts[calendarMessageKey], revision: calendarMessageSettings.rows[calendarMessageKey].revision }) })
        const payload = await response.json() as { setting?: { copy_override: CalendarCancellationCopy | CalendarUpdateCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Calendar message could not be saved.')
        setCalendarMessageSettings({ ...calendarMessageSettings, rows: { ...calendarMessageSettings.rows, [calendarMessageKey]: { copy: payload.setting.copy_override, revision: payload.setting.revision } } })
        setCalendarMessageDrafts((current) => ({ ...current, [calendarMessageKey]: payload.setting!.copy_override }))
        setFeedback('Saved for future calendar deliveries. Queued jobs keep their snapshot; wrapper copy is applied when the worker builds the unbranded message.')
      } else if (isManualInvoiceReminderSystem) {
        if (!manualInvoiceSettings || !activeManualInvoiceDirty) return
        const response = await fetch('/api/marketing/system-messages/manual-invoice-reminder', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: manualInvoiceKey, copy: manualInvoiceDrafts[manualInvoiceKey], revision: manualInvoiceSettings.rows[manualInvoiceKey].revision }) })
        const payload = await response.json() as { setting?: { copy_override: FinalPaymentReminderCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Manual invoice reminder could not be saved.')
        setManualInvoiceSettings({ ...manualInvoiceSettings, rows: { ...manualInvoiceSettings.rows, [manualInvoiceKey]: { copy: payload.setting.copy_override, revision: payload.setting.revision } } })
        setManualInvoiceDrafts((current) => ({ ...current, [manualInvoiceKey]: payload.setting!.copy_override }))
        setFeedback('Saved for future staff-requested reminders. Fresh balance, due date and secure payment link are still checked at send time.')
      } else if (isAgreementSystem) {
        if (!agreementSettings || !activeAgreementDirty) return
        const response = await fetch('/api/marketing/system-messages/agreement-email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: agreementKey, copy: agreementDrafts[agreementKey], revision: agreementSettings.rows[agreementKey].revision }) })
        const payload = await response.json() as { setting?: { copy_override: AgreementReminderCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Agreement reminder could not be saved.')
        setAgreementSettings({ ...agreementSettings, rows: { ...agreementSettings.rows, [agreementKey]: { copy: payload.setting.copy_override, revision: payload.setting.revision } } })
        setAgreementDrafts((current) => ({ ...current, [agreementKey]: payload.setting!.copy_override }))
        setFeedback('Saved for future agreement reminders. Already queued emails keep their existing content.')
      } else if (isEventEmailSystem) {
        if (!eventEmailSettings || !activeEventEmailDirty) return
        const response = await fetch('/api/marketing/system-messages/event-email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: eventEmailKey, copy: eventEmailDrafts[eventEmailKey], revision: eventEmailSettings.rows[eventEmailKey].revision }) })
        const payload = await response.json() as { setting?: { copy_override: EventEmailCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Event email could not be saved.')
        setEventEmailSettings({ ...eventEmailSettings, rows: { ...eventEmailSettings.rows, [eventEmailKey]: { copy: payload.setting.copy_override, revision: payload.setting.revision } } })
        setEventEmailDrafts((current) => ({ ...current, [eventEmailKey]: payload.setting!.copy_override }))
        setFeedback('Saved for future event messages. Already queued emails keep their existing content.')
      } else if (isFinalPaymentSystem) {
        if (!finalPaymentSettings || !activeFinalPaymentDirty) return
        const response = await fetch('/api/marketing/system-messages/final-payment-email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: finalPaymentKey, copy: finalPaymentDrafts[finalPaymentKey], revision: finalPaymentSettings.rows[finalPaymentKey].revision }) })
        const payload = await response.json() as { setting?: { copy_override: FinalPaymentReminderCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Reminder could not be saved.')
        setFinalPaymentSettings({ ...finalPaymentSettings, rows: { ...finalPaymentSettings.rows, [finalPaymentKey]: { copy: payload.setting.copy_override, revision: payload.setting.revision } } })
        setFinalPaymentDrafts((current) => ({ ...current, [finalPaymentKey]: payload.setting!.copy_override }))
        setFeedback('Saved for future reminders. Queued custom wording is retained; payment details and links are refreshed before sending.')
      } else if (isInstallmentSystem) {
        if (!installmentSettings || !activeInstallmentDirty) return
        const response = await fetch('/api/marketing/system-messages/installment-email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: installmentKey, copy: installmentDrafts[installmentKey], revision: installmentSettings.rows[installmentKey].revision }) })
        const payload = await response.json() as { setting?: { copy_override: InstallmentReminderCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Reminder could not be saved.')
        setInstallmentSettings({ ...installmentSettings, rows: { ...installmentSettings.rows, [installmentKey]: { copy: payload.setting.copy_override, revision: payload.setting.revision } } })
        setInstallmentDrafts((current) => ({ ...current, [installmentKey]: payload.setting!.copy_override }))
        setFeedback('Saved for future reminders. Already queued messages retain their wording; amounts and due dates are checked again before sending.')
      } else if (isTourEmailSystem) {
        if (!tourEmailSettings || !activeTourEmailDirty) return
        const response = await fetch('/api/marketing/system-messages/tour-email', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: tourEmailKey, copy: tourEmailDrafts[tourEmailKey], revision: tourEmailSettings.rows[tourEmailKey].revision }) })
        const payload = await response.json() as { setting?: { copy_override: TourEmailCopy | null; revision: number }; error?: string }
        if (!response.ok || !payload.setting) throw new Error(payload.error || 'Tour email could not be saved.')
        setTourEmailSettings({ ...tourEmailSettings, rows: { ...tourEmailSettings.rows, [tourEmailKey]: { copy: payload.setting.copy_override, revision: payload.setting.revision } } })
        setTourEmailDrafts((current) => ({ ...current, [tourEmailKey]: payload.setting!.copy_override }))
        setFeedback('Saved this step for future tour schedules. Already queued emails keep their existing content.')
      } else if (isPhoneSystem) {
        if (!phoneMessage) return
        const response = await fetch('/api/marketing/system-messages/phone-text', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: phoneKind, body: systemBody, enabled: phoneEnabled, cooldownHours: phoneCooldown, revision: phoneMessage.revision }) })
        const payload = await response.json() as { body?: string; revision?: string; enabled?: boolean; cooldownHours?: number; error?: string }
        if (!response.ok || typeof payload.body !== 'string' || typeof payload.revision !== 'string' || typeof payload.enabled !== 'boolean' || typeof payload.cooldownHours !== 'number') throw new Error(payload.error || 'Phone automation could not be saved.')
        setPhoneMessage({ ...phoneMessage, body: payload.body, revision: payload.revision, enabled: payload.enabled, cooldownHours: payload.cooldownHours })
        setPhoneEnabled(payload.enabled); setPhoneCooldown(payload.cooldownHours)
        setDefinitionDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id === 'phone-system-text' && step.type === 'text' ? { ...step, body: payload.body! } : step) }))
        setFeedback('Saved for future replies. Previously sent messages are unchanged.')
      } else if (isMultiSystem) {
        if (!activeSystemMessage || !invoiceMessages || systemBody === activeSystemMessage.body) return
        const response = await fetch(`/api/marketing/system-messages/${isTourTextSystem ? 'tour-text' : 'invoice-reminder'}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: multiKey, body: systemBody, revision: activeSystemMessage.revision }) })
        const payload = await response.json() as { template?: { body_template: string; revision: number }; error?: string }
        if (!response.ok || !payload.template) throw new Error(payload.error || 'Message could not be saved.')
        setInvoiceMessages({ ...invoiceMessages, [multiKey]: { ...activeSystemMessage, body: payload.template.body_template, revision: payload.template.revision } })
        setDefinitionDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id === multiKey && step.type === 'text' ? { ...step, body: payload.template!.body_template } : step) }))
        setFeedback('Saved this step for future texts. Already queued messages keep their existing content.')
      } else if (isTemplateSystem) {
        if (!systemMessage) return
        const response = await fetch(templateEndpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: systemBody, revision: systemMessage.revision }) })
        const payload = await response.json() as { template?: { body_template: string; revision: number }; error?: string }
        if (!response.ok || !payload.template) throw new Error(payload.error || 'Message could not be saved.')
        setSystemMessage({ ...systemMessage, body: payload.template.body_template, revision: payload.template.revision })
        setDefinitionDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id === 'system-template-text' && step.type === 'text' ? { ...step, body: payload.template!.body_template } : step) }))
        setFeedback('Saved for future texts. Already queued messages keep their existing content.')
      } else if (isNew) {
        const response = await fetch('/api/marketing/custom-workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nameDraft, definition: definitionDraft }),
        })
        const payload = (await response.json().catch(() => ({}))) as {
          workflow?: WorkflowRow
          error?: string
        }
        if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Could not save workflow draft.')
        router.replace(`/portal/marketing/custom-workflows/${encodeURIComponent(payload.workflow.id)}`)
      } else {
        if (!workflow) return
        const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nameDraft,
            definition: definitionDraft,
            expectedRevision: workflow.draft_revision,
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as {
          workflow?: WorkflowRow
          error?: string
        }
        if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Could not save workflow draft.')
        setWorkflow(payload.workflow)
        setDefinitionDraft(cloneCustomWorkflowDefinition(payload.workflow.draft_definition))
        setNameDraft(payload.workflow.name)
        setFeedback('Saved successfully.')
        setRefreshKey((v) => v + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save draft.')
    } finally {
      setSaving(false)
    }
  }

  // Activate workflow
  async function handleToggleActivate() {
    if (!workflow) return
    const nextAction = workflow.status === 'active' ? 'pause' : workflow.status === 'paused' ? 'resume' : 'activate'
    setActivating(true)
    setError(null)

    try {
      const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextAction }),
      })
      const payload = (await response.json().catch(() => ({}))) as WorkflowPayload
      if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Lifecycle update failed.')
      setWorkflow(payload.workflow)
      setFeedback(`Workflow is now ${payload.workflow.status}.`)
      setRefreshKey((v) => v + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lifecycle change failed.')
    } finally {
      setActivating(false)
    }
  }

  async function duplicateToEdit() {
    if (!workflow || duplicating) return
    setDuplicating(true)
    setError(null)
    try {
      const response = await fetch(`/api/marketing/custom-workflows/${encodeURIComponent(workflow.id)}/duplicate`, { method: 'POST' })
      const payload = await response.json() as { workflow?: WorkflowRow; error?: string }
      if (!response.ok || !payload.workflow) throw new Error(payload.error || 'Could not duplicate this workflow.')
      router.push(`/portal/marketing/custom-workflows/${encodeURIComponent(payload.workflow.id)}`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not duplicate this workflow.')
    } finally { setDuplicating(false) }
  }

  if (loading && !isNew && (isBrochureSystem ? !brochure : isPaidInvoiceEmail ? !paidInvoiceSettings : isZelleInstructions ? !zelleSettings : isAgreementPackage ? !agreementPackageSettings : isProposalBreakdown ? !breakdownSettings : isPlannerInvitation ? !plannerSettings : isPlannerVerification ? !verificationSettings : isAgreementOwner ? !ownerSettings : isLayoutReviewEmail ? !layoutSettings : isTourNoShowEmail ? !noShowSettings : isOfferSystem ? !offerSettings : isInquiryEmailSystem ? !inquiryEmailSettings : isTourEmailSystem ? !tourEmailSettings : isInstallmentSystem ? !installmentSettings : isFinalPaymentSystem ? !finalPaymentSettings : isManualInvoiceReminderSystem ? !manualInvoiceSettings : isCalendarMessageSystem ? !calendarMessageSettings : isEventEmailSystem ? !eventEmailSettings : isAgreementSystem ? !agreementSettings : isMultiSystem ? !invoiceMessages : isPhoneSystem ? !phoneMessage : isTemplateSystem ? !systemMessage : !workflow)) {
    return (
      <PortalPageFrame>
        <div className="flex h-96 items-center justify-center">
          <RefreshCw className="animate-spin text-[#caa24c]" size={28} />
        </div>
      </PortalPageFrame>
    )
  }
  if ((isBrochureSystem && !brochure) || (isLayoutReviewEmail && !layoutSettings) || (isPlannerInvitation && !plannerSettings) || (isZelleInstructions && !zelleSettings) || (isAgreementPackage && !agreementPackageSettings) || (isProposalBreakdown && !breakdownSettings) || (isPaidInvoiceEmail && !paidInvoiceSettings) || (isTourNoShowEmail && !noShowSettings) || (isOfferSystem && !offerSettings) || (isInquiryEmailSystem && !inquiryEmailSettings) || (isTourEmailSystem && !tourEmailSettings) || (isInstallmentSystem && !installmentSettings) || (isFinalPaymentSystem && !finalPaymentSettings) || (isManualInvoiceReminderSystem && !manualInvoiceSettings) || (isCalendarMessageSystem && !calendarMessageSettings) || (isEventEmailSystem && !eventEmailSettings) || (isAgreementSystem && !agreementSettings) || (isMultiSystem && !invoiceMessages) || (isTemplateSystem && !isMultiSystem && !systemMessage) || (isPhoneSystem && !phoneMessage)) return <PortalPageFrame><div role="alert" className="p-5 text-sm text-[color:var(--portal-text)]">{error || 'System workflow could not load.'} <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="underline">Retry</button></div></PortalPageFrame>

  return (
    <PortalPageFrame className="flex h-full !min-h-0 flex-1 flex-col !gap-0 overflow-visible lg:h-auto lg:flex-none lg:!gap-6 lg:overflow-visible">
      {/* Elena Architect Modal */}
      <ElenaWorkflowArchitectModal
        isOpen={isArchitectOpen}
        onClose={() => setIsArchitectOpen(false)}
        definition={definitionDraft}
        workflowName={nameDraft}
        onApplyWorkflow={({ name, definition }) => {
          setNameDraft(name)
          setDefinitionDraft(definition)
          setSelectedStepId(definition.steps[0]?.id || '')
          setFeedback('Elena architected workflow applied.')
        }}
      />
      <PortalModal isOpen={confirmSystemLeave} onClose={() => setConfirmSystemLeave(false)} title="Discard message changes?" maxWidth="max-w-md" footer={<div className="flex justify-end gap-2"><PortalButton type="button" variant="ghost" onClick={() => setConfirmSystemLeave(false)}>Keep editing</PortalButton><PortalButton type="button" variant="primary" onClick={() => router.push('/portal/marketing?tab=automations')}>Discard changes</PortalButton></div>}><p className="text-sm text-[color:var(--portal-muted)]">Your changes have not been saved.</p></PortalModal>

      {/* Top Navigation & Status Bar */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:rounded-xl lg:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/portal/marketing?tab=automations"
            onClick={(event) => { if (isSystem && dirty) { event.preventDefault(); setConfirmSystemLeave(true) } }}
            aria-label="Go back"
            title="Go back"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          >
            <ArrowLeft size={14} />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isSystem ? <h1 className="text-base font-bold text-[color:var(--portal-text)]">{nameDraft}</h1> : <input
                type="text"
                value={nameDraft}
                readOnly={!editable || isInquirySystem}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Workflow name"
                aria-label="Workflow name"
                className={`min-h-10 min-w-0 truncate rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-base font-bold text-[color:var(--portal-text)] outline-none focus:ring-2 focus:ring-[#caa24c]/45 ${isInquirySystem ? 'w-64 max-w-full' : ''}`}
              />}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  workflow?.status === 'active'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}
              >
                {isSystem ? 'System-managed' : workflow?.status || 'Draft'}
              </span>
            </div>
            <p className="text-[11px] text-[color:var(--portal-muted)]">
              {definitionDraft.steps.length} {definitionDraft.steps.length === 1 ? 'step' : 'steps'} configured · {dirty ? 'Unsaved changes' : 'All changes saved'}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-nowrap items-center gap-2 lg:w-auto">
          {/* Elena Architect Button */}
          {!isSystem ? <button
            type="button"
            onClick={() => setIsArchitectOpen(true)}
            disabled={!editable}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-[color:var(--portal-border)] px-2 text-xs font-semibold text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 lg:min-h-9 lg:flex-none lg:border-0 lg:px-2"
          >
            <Image src="/luxor-concierge.png" alt="" width={24} height={24} className="h-6 w-6 rounded-full object-cover" />
            <span>Build with Elena</span>
          </button> : null}

          {/* Save Draft Button */}
          {!isBrochureSystem ? <PortalButton
            variant="primary"
            onClick={saveDraft}
            disabled={!editable || saving || (isTourEmailSystem ? !activeTourEmailDirty : isInstallmentSystem ? !activeInstallmentDirty : isFinalPaymentSystem ? !activeFinalPaymentDirty : isManualInvoiceReminderSystem ? !activeManualInvoiceDirty : isCalendarMessageSystem ? !activeCalendarMessageDirty : isEventEmailSystem ? !activeEventEmailDirty : isAgreementSystem ? !activeAgreementDirty : isMultiSystem ? systemBody === activeSystemMessage?.body : (!dirty && !isNew))}
            className="min-h-9 min-w-0 flex-1 px-2 text-xs lg:flex-none lg:px-4"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{isMultiSystem || isTourEmailSystem || isInstallmentSystem || isFinalPaymentSystem || isManualInvoiceReminderSystem || isCalendarMessageSystem || isEventEmailSystem || isAgreementSystem ? 'Save selected step' : isSystem ? 'Save changes' : 'Save Draft'}</span>
          </PortalButton> : null}

          {/* Activate / Pause Toggle (for saved workflows) */}
          {!isNew && workflow && workflow.status !== 'archived' ? (
            <PortalButton
              variant="secondary"
              onClick={handleToggleActivate}
              disabled={activating || !canChangeLifecycle || (workflow.status !== 'active' && !triggerConnected) || (workflow.status === 'draft' && (dirty || validationErrors.length > 0))}
              className="min-h-9 min-w-0 flex-1 text-xs lg:flex-none"
            >
              {activating ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : workflow.status === 'active' ? (
                'Pause Workflow'
              ) : workflow.status === 'paused' ? (
                'Resume Workflow'
              ) : (
                'Activate Workflow'
              )}
            </PortalButton>
          ) : null}
        </div>
      </div>

      {/* Banner / Feedback Alerts */}
      {feedback ? (
        <div className="flex items-center justify-between border-b border-emerald-500/25 bg-emerald-500/10 px-6 py-2 text-xs text-emerald-600 dark:text-emerald-400">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            ✕
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center justify-between border-b border-rose-500/25 bg-rose-500/10 px-6 py-2 text-xs text-rose-500">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      ) : null}

      {readOnlyVersion ? <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4"><p className="text-xs leading-5 text-[color:var(--portal-muted)]">This {workflow?.status} version is read-only. Duplicate it to make changes in a new draft.</p><button type="button" onClick={() => void duplicateToEdit()} disabled={duplicating || enabled !== true} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50">{duplicating ? <RefreshCw size={14} className="animate-spin" /> : <Copy size={14} />} Duplicate to edit</button></div> : null}
      {!isSystem ? <section aria-label="Workflow email sender" className="shrink-0 space-y-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-4 lg:rounded-xl lg:border lg:px-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-center lg:gap-5">
        <div><h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Email sender</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Applies to the email steps in this workflow. Replies return to the selected approved mailbox.</p></div>
        {emailOptions && !(readOnlyVersion && !definitionDraft.emailSettings) ? <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Send as</label><PortalSelect disabled={!editable} value={definitionDraft.emailSettings?.senderMode || 'operator'} onChange={(value) => updateEmailSettings({ senderMode: value as 'operator' | 'elena' })} options={[{ value: 'operator', label: readOnlyVersion && definitionDraft.emailSettings?.senderActorEmail ? `Saved user · ${definitionDraft.emailSettings.senderActorEmail}` : `${emailOptions.operator.displayName} · signed-in user` }, { value: 'elena', label: 'Elena · Luxor concierge' }]} /></div>
          <div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">From email address</label><PortalSelect disabled={!editable} value={definitionDraft.emailSettings?.senderEmail || emailOptions.senders[0] || ''} onChange={(value) => updateEmailSettings({ senderEmail: value })} placeholder="No approved sender available" options={emailOptions.senders.map((email) => ({ value: email, label: email }))} /></div>
        </div> : readOnlyVersion && !definitionDraft.emailSettings ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Uses the existing Luxor business sender. Duplicate this workflow to choose a user or Elena and a sending address.</p> : <p role="status" className="text-xs text-[color:var(--portal-muted)]">{emailOptionsError ? 'Sender options unavailable.' : 'Loading approved sender options…'}</p>}
        </div>
        {emailOptionsError ? <p role="alert" className="text-xs leading-5 text-rose-600 dark:text-rose-400">{emailOptionsError} <button type="button" onClick={() => setEmailOptionsRetry((value) => value + 1)} className="underline">Retry</button></p> : null}
        {emailOptions && !emailOptions.senders.length ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">Configure an approved sending address in Settings before activating email steps.</p> : null}
      </section> : <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-xs leading-5 text-[color:var(--portal-muted)]">{isBrochureSystem ? <>Status: {brochure?.status || 'unknown'}. <Link href="/portal/marketing/automations/brochure_lead" target="_blank" rel="noopener noreferrer" className="underline">Review workflow controls and queued emails</Link>.</> : isPhoneSystem ? `${phoneMessage?.enabled ? 'Enabled' : 'Disabled'} in phone settings. ${phoneMessage?.canEdit ? 'Changes apply to future replies; previously sent texts do not change.' : 'Live editing is unavailable in this preview.'}` : <>{!(isPaidInvoiceEmail ? paidInvoiceSettings?.installed : isZelleInstructions ? zelleSettings?.installed : isAgreementPackage ? agreementPackageSettings?.installed : isProposalBreakdown ? breakdownSettings?.installed : isPlannerInvitation ? plannerSettings?.installed : isPlannerVerification ? verificationSettings?.installed : isAgreementOwner ? ownerSettings?.installed : isLayoutReviewEmail ? layoutSettings?.installed : isTourNoShowEmail ? noShowSettings?.installed : isOfferSystem ? offerSettings?.installed : isInquiryEmailSystem ? inquiryEmailSettings?.installed : isTourEmailSystem ? tourEmailSettings?.installed : isInstallmentSystem ? installmentSettings?.installed : isFinalPaymentSystem ? finalPaymentSettings?.installed : isManualInvoiceReminderSystem ? manualInvoiceSettings?.installed : isCalendarMessageSystem ? calendarMessageSettings?.installed : isEventEmailSystem ? eventEmailSettings?.installed : isAgreementSystem ? agreementSettings?.installed : activeSystemMessage?.installed) ? 'The message editor is not installed yet; the original message remains in use.' : !editable ? 'Live editing is unavailable in this preview.' : isPaidInvoiceEmail ? (isAgreementClient ? 'Changes apply to future executed-agreement emails. Existing queued notices retain their wording and attachment.' : isPaymentReceipt ? 'Changes apply to future receipt previews. Existing queued receipts retain their wording and attachment; changed previews cannot retry a different saved receipt.' : 'Changes apply to future paid-invoice notices. Existing queued or sent notices keep their wording and attachment.') : isZelleInstructions ? 'Changes apply to newly queued instructions. Existing jobs retain their wording and are reused for the same booking and payment choice.' : isAgreementPackage ? 'Changes apply when the worker builds the next agreement delivery. Queued jobs can keep a copy snapshot; package PDFs, the signing URL, delivery claim and attachment manifest stay system-controlled. Without customization, the introduction may still be tailored by Elena.' : isProposalBreakdown ? 'Changes apply when staff prepare the next breakdown. Sent snapshots keep their saved HTML, pricing signature and delivery record.' : isPlannerInvitation ? 'Changes apply to future planner invitations. Already queued or sent emails keep their wording.' : isPlannerVerification ? 'Changes apply to future verification emails. The worker still claims and inserts the current six-digit code at delivery; sent bodies are removed for privacy.' : isAgreementOwner ? 'Changes apply to future owner audit copies. Already queued notices keep their wording and audit attachment.' : isLayoutReviewEmail ? 'Changes apply to future layout review emails. Already queued or sent emails keep their wording; a failed email may be updated when retried.' : isTourNoShowEmail ? 'Changes apply to future manually queued emails. Previously queued emails keep their wording.' : isOfferSystem ? (isPaymentRequestEmail ? 'Custom wording applies to newly queued reminders. Existing custom snapshots stay with their jobs. Original wording may be regenerated when sending; payment details and links can be refreshed.' : 'Changes apply to future offer reminders. Already queued custom emails keep their wording; restoring the original returns to AI-tailored copy with a fallback.') : isInquiryEmailSystem ? 'Changes apply to future receipts. Already queued emails retain their existing content.' : isAgreementSystem ? 'Changes apply to future agreement reminders. Already queued emails retain their existing content.' : isEventEmailSystem ? 'Changes apply to future event messages. Already queued emails retain their existing content.' : isFinalPaymentSystem ? 'Custom wording applies to newly queued reminders. Existing custom snapshots stay with their jobs. Original wording may be regenerated at sending; balance and payment link are refreshed.' : isManualInvoiceReminderSystem ? 'Custom wording applies to the next staff-requested reminder. Already queued or sent jobs keep their snapshot. Without customization, the reminder may still be tailored by Elena; balance, due date and payment link are refreshed at send time.' : isCalendarMessageSystem ? 'Changes apply when the worker builds the next unbranded calendar email. Queued calendar jobs keep their revision snapshot; the footer and cancellation subject prefix are rendered at delivery unless the message uses branded tour HTML.' : isInstallmentSystem ? 'Changes apply to newly queued reminders. Existing jobs keep their wording; amounts and due dates are refreshed before sending.' : isTourEmailSystem ? 'Changes apply to future tour schedules. Already queued emails retain their existing content.' : 'Changes apply to future messages. Already queued texts retain their existing content.'} {isMultiSystem || isTourEmailSystem || isInstallmentSystem || isFinalPaymentSystem || isManualInvoiceReminderSystem || isCalendarMessageSystem || isEventEmailSystem || isAgreementSystem ? 'Select and save each changed step separately.' : isInstallmentSystem ? 'Sending also depends on payment reminder controls and installment feature gates.' : isPaidInvoiceEmail ? 'This email has no separate on/off switch.' : isZelleInstructions ? 'This email has no separate on/off switch.' : isPaidInvoiceEmail ? (isAgreementClient ? 'After the agreement is signed and countersigned, the client receives the executed agreement. A secure payment link is included when available; closed-lost inquiries do not receive the customer notice.' : isPaymentReceipt ? 'Staff review and send a receipt for a confirmed payment. The customer needs an email address; the payment details and attached receipt PDF come from the recorded transaction.' : 'After an eligible Stripe payment is recorded, the client receives a paid-invoice email. The recorded amount, reservation status and attached invoice are generated from that payment.') : isZelleInstructions ? 'When a client selects Zelle in a proposal, this email is queued with the selected payment amount and recipient. One job is created per booking and payment choice.' : isPlannerInvitation ? 'The owner sends this invitation from Planner.' : isPlannerVerification ? 'The viewer requests this code from the private presentation page.' : isAgreementOwner ? 'This notice is sent only to the owner mailbox after countersignature.' : isLayoutReviewEmail ? 'Staff request this email from a layout review.' : isTourNoShowEmail ? 'This email is queued only when staff request it from Calendar.' : isManualInvoiceReminderSystem ? 'Staff send this from Finances when reviewing an invoice or final-balance reminder.' : isOfferSystem ? 'This reminder has no separate on/off switch.' : isInquiryEmailSystem ? 'This receipt has no separate on/off switch.' : 'This system-managed text has no separate on/off switch.'} {isTourTextSystem || isTourEmailSystem ? <> Tour notifications: {tourNotificationsEnabled === null ? 'status unavailable' : tourNotificationsEnabled ? 'on' : 'off'}. <Link href="/portal/marketing/automations/tour-notifications" className="underline">Review tour notification control</Link>.</> : null}</>}</div>}

      {isInstallmentSystem && installmentSettings ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Payment reminder control: {installmentSettings.remindersEnabled === null ? 'unavailable' : installmentSettings.remindersEnabled ? 'on' : 'paused'}. Installment scheduling in this environment: {installmentSettings.schedulingEnabled ? 'enabled' : 'not enabled'}. <Link href="/portal/marketing/automations/payment-reminders" className="font-semibold underline underline-offset-2">Review reminder controls</Link>.</p> : null}
      {isFinalPaymentSystem && finalPaymentSettings ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Payment reminder control: {finalPaymentSettings.remindersEnabled === null ? 'unavailable' : finalPaymentSettings.remindersEnabled ? 'on' : 'paused'}. <Link href="/portal/marketing/automations/payment-reminders" className="font-semibold underline underline-offset-2">Review reminder controls</Link>.</p> : null}
      {isEventEmailSystem ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Before sending, event reminders are checked against the booking date and status. Replacement reminders after a date change require the updated event scheduler; check message history after rescheduling.</p> : null}
      {!isNew && workflow ? <WorkflowContacts workflowId={workflow.id} /> : null}
      {isBrochureSystem ? <BrochureWorkflowContacts /> : null}
      {isPhoneSystem || isLayoutReviewEmail || isPlannerInvitation || isPlannerVerification || isAgreementOwner || isZelleInstructions || isAgreementPackage || isProposalBreakdown || isPaidInvoiceEmail || isTourNoShowEmail || isOfferSystem || isInquirySystem || isInquiryEmailSystem || isPaymentSystem || isEventSystem || isTourTextSystem || isTourEmailSystem || isInstallmentSystem || isFinalPaymentSystem || isManualInvoiceReminderSystem || isCalendarMessageSystem || isEventEmailSystem || isAgreementSystem || workflowId === 'system-invoice-reminders' ? <SystemWorkflowContacts workflowId={workflowId} /> : null}

      {/* Main Workspace Frame: Two Columns (Canvas + Inspector) */}
      <div ref={workspaceRef} className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-none lg:flex-row lg:items-start lg:overflow-visible">
        {/* Left Column: Visual Sequencer Canvas */}
        <div ref={canvasRef} className="min-h-0 flex-1 overflow-y-auto portal-scrollbar p-4 lg:sticky lg:top-[var(--workflow-sticky-top,0px)] lg:self-start lg:overflow-visible lg:py-8 lg:pr-8 lg:pl-0 space-y-4">
          {/* Trigger Header Card */}
          <div className="rounded-2xl border-2 border-[#caa24c]/60 bg-[color:var(--portal-card)] p-4 lg:p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="luxor-gold-raised flex h-10 w-10 shrink-0 items-center justify-center rounded-xl !text-white">
                  <Workflow size={20} aria-hidden="true" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f]">
                    Workflow Trigger
                  </span>
                  <h3 className="text-base font-bold text-[color:var(--portal-text)]">
                    {isBrochureSystem ? 'Brochure request with marketing consent' : isPhoneSystem ? (phoneKind === 'missed_call' ? 'Incoming call not completed' : 'Incoming text received') : isPaidInvoiceEmail ? (isAgreementClient ? 'Agreement completed' : isPaymentReceipt ? 'Staff request a receipt' : 'Stripe payment recorded') : isZelleInstructions ? 'Client chooses Zelle' : isAgreementPackage ? 'Accepted proposal queued for agreement delivery' : isProposalBreakdown ? 'Staff send a package comparison' : isPlannerInvitation ? 'Owner shares a planner presentation' : isPlannerVerification ? 'Viewer requests presentation access' : isAgreementOwner ? 'Agreement countersigned' : isLayoutReviewEmail ? 'Staff send a layout review' : isTourNoShowEmail ? 'Staff request a reschedule email' : isOfferSystem ? (isPaymentRequestEmail ? 'Payment request or booking package sent' : 'Proposal or package sent with an expiration') : isAgreementSystem ? 'Agreement sent' : isEventEmailSystem ? (eventEmailKey === 'thanks' ? 'Event marked complete' : 'Planning marked complete') : isCalendarMessageSystem ? 'Calendar event revised or cancelled' : isManualInvoiceReminderSystem ? 'Staff request a payment reminder' : isFinalPaymentSystem ? 'Signed booking with unpaid final balance' : isInstallmentSystem ? 'Eligible installment payment' : receiptKey === 'tour_request_received' ? 'Tour request received' : receiptKey === 'newsletter_confirmation' ? 'Newsletter signup' : isTourTextSystem || isTourEmailSystem ? 'Tour scheduled or rescheduled' : isInvoiceSystem ? 'Invoice or payment request' : isEventSystem ? 'Event booked or updated' : isPaymentSystem ? 'Payment marked paid' : isInquiryEmailSystem || isInquirySystem ? 'Inquiry received' : CUSTOM_WORKFLOW_TRIGGER_LABELS[definitionDraft.trigger]?.label || 'Trigger Event'}
                  </h3>
                </div>
              </div>

              {/* Trigger Dropdown */}
              {!isSystem ? <div className="w-full lg:w-64">
                <PortalSelect
                  value={definitionDraft.trigger}
                  disabled={!editable}
                  onChange={(val) => {
                    if (val === 'contact_form_inquiry_created' && definitionDraft.steps.some((step) => step.id === 'inquiry-acknowledgment' && (step.type !== 'email' || step.mode !== 'existing_inquiry_acknowledgment'))) {
                      setError('A step is using the reserved inquiry acknowledgment ID. Rename that step before choosing the contact form trigger.')
                      return
                    }
                    setDefinitionDraft((curr) => ({
                      ...curr,
                      trigger: val as CustomWorkflowTrigger,
                      steps: val === 'tour_attended' ? curr.steps.filter((step) => step.type !== 'email' || step.mode !== 'existing_inquiry_acknowledgment') : val === 'contact_form_inquiry_created' && !curr.steps.some((step) => step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment') ? [createNewContactFollowUpDefinition().steps[0], ...curr.steps] : curr.steps,
                    }))
                    if (val === 'tour_attended' && definitionDraft.steps.some((step) => step.type === 'email' && step.mode === 'existing_inquiry_acknowledgment')) setFeedback('The inquiry acknowledgment step was removed because it only applies to new contact-form inquiries.')
                  }}
                  options={[...connectedTriggers, ...(triggerConnected ? [] : [definitionDraft.trigger])].map((t) => ({
                    value: t,
                    label: `${CUSTOM_WORKFLOW_TRIGGER_LABELS[t]?.label || t}${connectedTriggers.includes(t) ? '' : ' · automatic enrollment not connected'}`,
                  }))}
                />
              </div> : null}
            </div>
            <p className="mt-2 text-xs text-[color:var(--portal-muted)]">
              {isBrochureSystem ? 'Eligible brochure requests with an email address and marketing opt-in enter this sequence. Steps are scheduled from the original request; past-due steps are skipped. A response, tour, booking, or consent change can stop follow-up.' : isPhoneSystem ? (phoneKind === 'missed_call' ? 'When an incoming call is not completed, the caller can receive this reply if the automation is enabled and customer-care text consent is recorded. Each call is processed once; STOP blocks sending.' : 'An incoming non-keyword text can receive this reply when enabled and customer-care text consent is recorded. STOP, START, HELP and consent confirmations follow their existing separate handling. The cooldown limits repeat replies.') : isPaidInvoiceEmail ? (isAgreementClient ? 'After the agreement is signed and countersigned, the client receives the executed agreement. A secure payment link is included when available; closed-lost inquiries do not receive the customer notice.' : isPaymentReceipt ? 'Staff review and send a receipt for a confirmed payment. The customer needs an email address; the payment details and attached receipt PDF come from the recorded transaction.' : 'After an eligible Stripe payment is recorded, the client receives a paid-invoice email. The recorded amount, reservation status and attached invoice are generated from that payment.') : isZelleInstructions ? 'When a client selects Zelle in a proposal, this email is queued with the selected payment amount and recipient. One job is created per booking and payment choice.' : isAgreementPackage ? 'After the client accepts a price-locked final proposal, the agreement queue creates one delivery job per signing record. The worker validates the booking, claims the delivery, attaches the proposal, agreement and Guest Guide PDFs, and records provider acceptance before updating portal stage.' : isProposalBreakdown ? 'From the lead proposal builder, staff review package prices and send a comparison email. The saved HTML snapshot, pricing signature and delivery claim stay with that breakdown record; duplicate sends are blocked while delivery is in progress.' : isPlannerInvitation ? 'The owner sends this invitation to the selected recipient for a prepared private presentation. The link and expiry are generated for that presentation; the recipient requests a separate verification code.' : isPlannerVerification ? 'When a viewer requests access on the private presentation page, a one-time code email is queued. Rate limits, code validity, claim semantics and the six-digit code remain system-controlled.' : isAgreementOwner ? 'After the agreement is countersigned, the owner receives an internal audit copy with the full timeline PDF. This notice is owner-only and independent of lead closure.' : isLayoutReviewEmail ? 'Staff send this email for an open layout review. The client must have an email address; the private link and expiry are generated for that review.' : isTourNoShowEmail ? 'Staff can queue this email from Calendar. The contact needs an email address; queued tour messages may be cancelled when the tour changes, and signed bookings stop follow-up before delivery.' : isOfferSystem ? (isPaymentRequestEmail ? 'A reminder is queued 72 hours after the booking package or eligible payment request is sent. For deposit and other supported payment invoices, a signed agreement and unpaid balance are required before delivery; payment details and the secure link are refreshed.' : 'For a proposal or package with an expiration, reminders are scheduled about 24 hours after sending and four hours before expiry when those times are eligible. The saved offer and payment status are checked before delivery. Deposit-related reminders also require a signed agreement and refresh the balance and payment link.') : isAgreementSystem ? (agreementKey === 'view' ? 'Queued 48 hours after the agreement package is sent. Signing the agreement cancels queued reminders; offer eligibility is checked before sending when an expiration is recorded.' : 'Queued five days after the agreement package is sent. Signing the agreement cancels queued reminders; offer eligibility is checked before sending when an expiration is recorded.') : isEventEmailSystem ? (eventEmailKey === 'thanks' ? 'When the event is marked complete, a thank-you is queued for 24 hours later.' : eventEmailKey === 'details' ? 'When planning is marked complete, the final-details email is queued for 14 days before the event if that time is still future.' : 'When planning is marked complete, the event reminder is queued for two days before the event if that time is still future.') : isCalendarMessageSystem ? 'When a calendar event is cancelled or an attendee receives an unbranded update, the email worker builds the wrapper from the saved revision and attaches the iCalendar file. Branded tour invitations with queued HTML stay on the tour-email workflow. Title, date, location and description come from the revision snapshot.' : isManualInvoiceReminderSystem ? 'From Finances, staff review an invoice or final-balance reminder and send it immediately. The job is recorded with manual origin metadata so it is not confused with scheduled final-payment milestones. Balance, due date, secure payment link and invoice eligibility are refreshed at send time.' : isFinalPaymentSystem ? 'The worker checks eligible signed bookings with a deposit and unpaid final balance. It selects a reminder window from the due date and checks the balance and payment link again before delivery.' : isInstallmentSystem ? 'For eligible unpaid installments, reminders are scheduled seven days before and one day after the due date at 10 a.m. Chicago time. The booking, balance, recipient, and approved sending window are checked again before delivery.' : receiptKey === 'tour_request_received' ? 'An inquiry with an email address and a requested tour date receives this immediately when it is not automatically scheduled. This is a request receipt, not a confirmed appointment.' : receiptKey === 'newsletter_confirmation' ? 'A newsletter signup with an email address receives this confirmation immediately. Hard-bounce and complaint blocks still apply.' : isInquiryEmailSystem ? 'An inquiry with an email address receives this receipt when it is not a newsletter signup or an automatically scheduled tour. Tour requests use their own acknowledgment. The receipt is queued immediately; hard-bounce and complaint blocks still apply.' : isTourEmailSystem ? 'The confirmation and calendar invitation are queued when a tour is scheduled. Reminder emails are queued 24 hours and 2 hours before the tour when those times are still in the future. Each email is tied to the saved calendar revision; cancellation or rescheduling can stop outdated notices.' : isTourTextSystem ? `${tourKey === 'tour_confirmation' ? 'Queued when the tour is scheduled or rescheduled.' : 'Queued for 15:00 UTC on the preceding calendar day, if still in the future.'} Requires tour text consent and the existing tour notification control. Consent and STOP status are checked again before delivery; cancelled or changed tours are skipped.` : isInvoiceSystem ? `${invoiceKey === 'invoice_payment_request' ? 'Scheduled 72 hours after an eligible payment request is delivered. Its timing is separate from the due-date reminders.' : invoiceKey === 'invoice_due_reminder' ? 'Scheduled three days before the due date when that time is in the future.' : 'Scheduled one day after the due date.'} Requires a phone number and invoice text consent. Before delivery, the invoice and due date are checked again; STOP blocks sending.` : isEventSystem ? 'For a non-cancelled booking with an event date and phone number, reminders are queued seven days and one day before the event when those times are still in the future. Event text consent is required and checked again before delivery; STOP blocks sending.' : isPaymentSystem ? 'When a payment is marked paid, a confirmation can be queued for the contact if a phone number and payment text consent are recorded. One job is created per payment. Consent and STOP status are checked again before delivery.' : isInquirySystem ? 'An inquiry without a tour date can receive this text when it has a phone number and recorded customer-care consent. One job is created per inquiry; consent and STOP status are checked again before delivery.' : CUSTOM_WORKFLOW_TRIGGER_LABELS[definitionDraft.trigger]?.description}
            </p>
            {!isSystem && definitionDraft.trigger === 'tour_attended' && triggerConnected ? <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Only newly recorded completed visits enroll. Each contact enters once per workflow version. A corrected or replaced visit stops later steps; marketing messages require the relevant consent at delivery.</p> : null}
            {isFinalPaymentSystem ? <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{finalPaymentKey === 'payment_request' ? 'Initial request: 15–30 days before the due date.' : finalPaymentKey === '14_days' ? 'Two-week window: 8–14 days before the due date.' : finalPaymentKey === '7_days' ? 'One-week window: 3–7 days before the due date.' : 'Due-date window: 2 days before through 7 days after the due date.'} Each milestone is queued at most once per booking.</p> : null}
            {!triggerConnected ? <p role="alert" className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Automatic enrollment for this trigger is not connected yet. {readOnlyVersion ? 'Duplicate this workflow and choose Manual enrollment or Contact form inquiry before activating a revised draft.' : 'Choose Manual enrollment or Contact form inquiry before activating this draft.'}</p> : null}
          </div>

          {/* Step Timeline Nodes */}
          <div className="relative my-4 ml-0 space-y-3 border-l-0 border-[#caa24c]/30 pl-0 lg:ml-6 lg:border-l-2 lg:pl-4">
            {definitionDraft.steps.map((step, idx) => {
              const isSelected = selectedStepId === step.id
              const isEnd = step.type === 'end'
              const canEdit = canEditCustomWorkflowStep(step)

              return (
                <div key={step.id || idx} className="relative group">
                  {/* Step Card */}
                  <div
                    onClick={() => selectStep(step.id)}
                    role="button"
                    aria-pressed={isSelected}
                    tabIndex={0}
                    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectStep(step.id) } }}
                    className={`relative cursor-pointer rounded-2xl border p-4 transition ${
                      isSelected
                        ? 'border-[#caa24c] bg-[#caa24c]/10 shadow-sm ring-2 ring-[#caa24c]/30'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-soft)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Step Type Icon */}
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-linear-to-b from-white/20 to-black/10 !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-1px_0_rgba(0,0,0,0.22),0_1px_3px_rgba(36,24,6,0.18)] ${
                            step.type === 'call_task'
                              ? 'bg-emerald-500'
                              : step.type === 'email'
                              ? 'bg-[#a8792f]'
                              : step.type === 'text'
                              ? 'bg-sky-500'
                              : step.type === 'wait'
                              ? 'bg-amber-500'
                              : step.type === 'condition'
                              ? 'bg-purple-500'
                              : 'bg-stone-500'
                          }`}
                        >
                          {step.type === 'call_task' ? (
                            <Phone size={16} />
                          ) : step.type === 'email' ? (
                            <Mail size={16} />
                          ) : step.type === 'text' ? (
                            <MessageSquare size={16} />
                          ) : step.type === 'wait' ? (
                            <Clock size={16} />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-[color:var(--portal-text)] truncate">
                              {step.name}
                            </span>
                            <span className="rounded bg-[color:var(--portal-soft)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[color:var(--portal-muted)]">
                              {step.type === 'call_task'
                                ? `Call (${step.priority})`
                                : step.type}
                            </span>
                            {isMultiSystem && step.type === 'text' && invoiceMessages?.[step.id] && step.body !== invoiceMessages[step.id].body ? <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unsaved</span> : null}
                            {isAgreementSystem && agreementSettings && JSON.stringify(agreementDrafts[step.id]) !== JSON.stringify(agreementSettings.rows[step.id]?.copy) ? <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unsaved</span> : null}
                            {isEventEmailSystem && eventEmailSettings && JSON.stringify(eventEmailDrafts[step.id]) !== JSON.stringify(eventEmailSettings.rows[step.id]?.copy) ? <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unsaved</span> : null}
                            {isFinalPaymentSystem && finalPaymentSettings && JSON.stringify(finalPaymentDrafts[step.id]) !== JSON.stringify(finalPaymentSettings.rows[step.id]?.copy) ? <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unsaved</span> : null}
                            {isManualInvoiceReminderSystem && manualInvoiceSettings && JSON.stringify(manualInvoiceDrafts[step.id]) !== JSON.stringify(manualInvoiceSettings.rows[step.id]?.copy) ? <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unsaved</span> : null}
                            {isCalendarMessageSystem && calendarMessageSettings && JSON.stringify(calendarMessageDrafts[step.id]) !== JSON.stringify(calendarMessageSettings.rows[step.id]?.copy) ? <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unsaved</span> : null}
                            {isInstallmentSystem && installmentSettings && JSON.stringify(installmentDrafts[step.id]) !== JSON.stringify(installmentSettings.rows[step.id]?.copy) ? <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unsaved</span> : null}
                            {isTourEmailSystem && tourEmailSettings && JSON.stringify(tourEmailDrafts[step.id]) !== JSON.stringify(tourEmailSettings.rows[step.id]?.copy) ? <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Unsaved</span> : null}
                            {((step.type === 'email' || step.type === 'text') && step.generationMode === 'ai') ? (
                              <span className="rounded-full bg-[#caa24c]/20 px-2 py-0.5 text-[10px] font-bold text-[#8c6424] dark:text-[#f1d27a]">
                                AI Powered
                              </span>
                            ) : null}
                          </div>

                          {/* Snippet preview */}
                          <div className="mt-1 text-xs text-[color:var(--portal-muted)] line-clamp-2">
                            {isPaidInvoiceEmail ? <span>{paidInvoiceDraft?.subject || (isAgreementClient ? "Original subject depends on payment link availability." : isPaymentReceipt ? "Original subject includes the event or receipt number." : "Original subject depends on payment and reservation status.")}</span> : isZelleInstructions ? <span>{(zelleDraft || ZELLE_INSTRUCTIONS_DEFAULT).subject}</span> : isAgreementPackage ? <span>{(agreementPackageDraft || AGREEMENT_PACKAGE_DEFAULT).subject}</span> : isProposalBreakdown ? <span>{(breakdownDraft || PROPOSAL_BREAKDOWN_DEFAULT).subject}</span> : isPlannerInvitation ? <span>{(plannerDraft || PLANNER_INVITATION_DEFAULT).subject}</span> : isPlannerVerification ? <span>{(verificationDraft || PLANNER_VERIFICATION_DEFAULT).subject}</span> : isLayoutReviewEmail ? <span>{(layoutDraft || LAYOUT_REVIEW_EMAIL_DEFAULT).subject}</span> : isTourNoShowEmail ? <span>{(noShowDraft || TOUR_NO_SHOW_DEFAULT).subject}</span> : isOfferSystem ? <span>{offerDraft?.subject || 'Original copy may be tailored by Elena.'}</span> : isInquiryEmailSystem ? <span>{(inquiryEmailDraft || receiptDefault).subject}</span> : isAgreementSystem ? <span>{(agreementDrafts[step.id] || AGREEMENT_REMINDER_DEFAULTS[step.id as AgreementReminderKey])?.subject}</span> : isEventEmailSystem ? <span>{(eventEmailDrafts[step.id] || EVENT_EMAIL_DEFAULTS[step.id as EventEmailKey])?.subject}</span> : isFinalPaymentSystem ? <span>{finalPaymentDrafts[step.id]?.subject || 'Original copy may be tailored by Elena.'}</span> : isManualInvoiceReminderSystem ? <span>{manualInvoiceDrafts[step.id]?.subject || (MANUAL_INVOICE_REMINDER_DEFAULTS[step.id as ManualInvoiceReminderKey]?.subject ?? 'Original copy may be tailored by Elena.')}</span> : isCalendarMessageSystem ? <span>{step.id === 'cancellation' ? (calendarMessageDrafts.cancellation as CalendarCancellationCopy | null)?.subjectPrefix || CALENDAR_CANCELLATION_DEFAULT.subjectPrefix : 'Event title from calendar snapshot'}</span> : isInstallmentSystem ? <span>{(installmentDrafts[step.id] || INSTALLMENT_REMINDER_DEFAULTS[step.id as InstallmentReminderKey])?.subject}</span> : isTourEmailSystem ? <span>{tourEmailDrafts[step.id] ? tourEmailDrafts[step.id]?.subject : step.id === 'confirmation' ? 'Default confirmation may be tailored by Elena.' : 'Default tour reminder copy.'}</span> : step.type === 'call_task' && step.scriptNotes ? (
                              <span>Script: <WorkflowVariableText value={step.scriptNotes} /></span>
                            ) : step.type === 'email' && step.subject ? (
                              <span>Subject: {step.subject}</span>
                            ) : step.type === 'text' && step.body ? (
                              <span>{step.body}</span>
                            ) : step.type === 'wait' ? (
                              <span>Wait {step.amount} {step.unit}</span>
                            ) : step.type === 'condition' ? (
                              <span>Condition: {step.condition}</span>
                            ) : isEnd ? (
                              <span>Sequence ends cleanly.</span>
                            ) : (
                              <span className="italic">Click to configure step details...</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Step Action Buttons (move, delete) */}
                      {!isSystem && editable && canEdit && !isEnd ? (
                        <div
                          className="flex items-center gap-1 opacity-80 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => moveStep(step.id, -1)}
                            aria-label={`Move ${step.name} up`}
                            disabled={idx <= (definitionDraft.steps[0]?.type === 'email' && definitionDraft.steps[0].mode === 'existing_inquiry_acknowledgment' ? 1 : 0)}
                            className="grid size-10 place-items-center rounded text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStep(step.id, 1)}
                            aria-label={`Move ${step.name} down`}
                            disabled={idx >= definitionDraft.steps.length - 2}
                            className="grid size-10 place-items-center rounded text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStep(step.id)}
                            aria-label={`Remove ${step.name}`}
                            className="grid size-10 place-items-center rounded text-rose-500 hover:bg-rose-500/10"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Add Step Connector between nodes */}
                  {!isMultiSystem && !isTourEmailSystem && !isInstallmentSystem && !isFinalPaymentSystem && !isManualInvoiceReminderSystem && !isCalendarMessageSystem && !isEventEmailSystem && !isAgreementSystem && !isOfferSystem && !isTourNoShowEmail && !isLayoutReviewEmail && !isPlannerInvitation && !isZelleInstructions && !isAgreementPackage && !isProposalBreakdown && !isPaidInvoiceEmail && !isEnd && idx < definitionDraft.steps.length - 1 ? (
                    <div className="my-2 flex items-center justify-center">
                      <div className="h-4 w-0.5 bg-[#caa24c]/40" />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* Add Step Button Bar */}
          {!isSystem ? <div className="rounded-2xl border border-dashed border-[#caa24c]/50 bg-[color:var(--portal-card)] p-4">
            <p className="text-center text-xs font-bold text-[color:var(--portal-text)] mb-3">
              + Insert Step Into Sequence
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {ADDABLE_STEPS.map((addable) => (
                <button
                  key={addable.type}
                  type="button"
                  onClick={() => addStep(addable.type)}
                  disabled={!editable}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)] transition hover:border-[#caa24c] hover:bg-[#caa24c]/10"
                >
                  {addable.icon}
                  <span>{addable.label}</span>
                </button>
              ))}
            </div>
          </div> : null}
        </div>

        {/* Right Column: Step Inspector & Live Preview */}
        <motion.div
          ref={inspectorRef}
          initial={false}
          animate={{
            x: mobileInspectorOpen || isDesktopViewport ? '0%' : '100%',
            visibility: mobileInspectorOpen || isDesktopViewport ? 'visible' : 'hidden',
          }}
          transition={{
            x: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
            visibility: { delay: mobileInspectorOpen || isDesktopViewport ? 0 : 0.28 },
          }}
          aria-hidden={!mobileInspectorOpen && !isDesktopViewport}
          inert={!mobileInspectorOpen && !isDesktopViewport}
          className={`portal-inspector-surface flex min-h-0 flex-col shrink-0 lg:sticky lg:top-[var(--workflow-sticky-top,0px)] lg:self-start lg:overflow-visible lg:rounded-2xl lg:border lg:border-[color:var(--portal-border)] ${
            mobileInspectorOpen
              ? 'fixed inset-0 z-50 max-h-none overflow-hidden max-lg:!bg-[color:var(--portal-card)] lg:inset-x-auto lg:bottom-auto lg:max-h-none lg:w-[460px] xl:w-[500px] lg:shadow-none'
              : 'fixed inset-0 z-10 max-lg:pointer-events-none lg:static lg:flex lg:w-[460px] xl:w-[500px] border-t border-[color:var(--portal-border)]'
          }`}
        >
          {/* Inspector Header */}
          <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] px-5 py-3.5 portal-inspector-surface lg:!static lg:z-auto lg:rounded-t-[15px]">
            <PortalAnimatedTabs
              variant="slider"
              tabs={[
                { id: 'edit', label: 'Step Configuration' },
                { id: 'preview', label: 'Live Preview' },
              ]}
              activeTab={inspectorTab}
              onTabChange={(tab) => { if (isBrochureSystem && brochureDirty && tab !== inspectorTab) { setError('Save or discard the current step changes before switching views.'); return } setInspectorTab(tab) }}
              buttonClassName="normal-case tracking-normal text-xs font-bold"
              ariaLabel="Step inspector views"
            />

            <PortalCloseButton
              onClick={() => setMobileInspectorOpen(false)}
              className="lg:hidden"
              aria-label="Close configuration panel"
            />
          </div>

          {/* Inspector Body */}
          <motion.div
            initial={false}
            animate={{ height: isDesktopViewport && inspectorBodyHeight ? `${inspectorBodyHeight}px` : 'auto' }}
            transition={{ height: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain portal-scrollbar p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:flex-none lg:overflow-hidden"
          >
            <div ref={inspectorContentRef}>
            <PortalTabTransition activeKey={`${inspectorTab}:${selectedStep?.id || 'none'}`} className="space-y-5" mode="popLayout">
            {!selectedStep ? (
              <PortalStaggerCard className="py-12 text-center text-xs text-[color:var(--portal-muted)]">
                Select a step on the canvas to configure its properties.
              </PortalStaggerCard>
            ) : isBrochureSystem ? (() => {
              const template = brochure?.templates.find((item) => item.id === selectedStep.id)
              if (!template) return <p className="text-xs text-[color:var(--portal-muted)]">This step is unavailable. Reload the workflow.</p>
              if (inspectorTab === 'preview' && brochure) return <BrochureCanvasPreview key={`${template.id}:${template.updated_at}`} step={template} delivery={brochure.delivery} />
              return <BrochureCanvasStep key={`${template.id}:${template.updated_at}`} step={template} available={editable} onDirtyChange={setBrochureDirty} onReload={(message) => { setBrochureDirty(false); setFeedback(message); setRefreshKey((value) => value + 1) }} onSaved={(saved, message) => { setBrochureDirty(false); setBrochure((current) => current ? { ...current, templates: current.templates.map((item) => item.id === saved.id ? saved : item) } : current); setDefinitionDraft((current) => ({ ...current, steps: current.steps.map((step) => step.id !== saved.id ? step : step.type === 'email' ? { ...step, name: saved.name, subject: saved.subject || '', body: saved.body || '' } : step.type === 'call_task' ? { ...step, name: saved.name, scriptNotes: saved.body || '' } : step) })); setFeedback(message || 'Step saved for future enrollments.') }} />
            })() : isInquiryEmailSystem ? (
              inspectorTab === 'preview' ? (() => {
                let preview: InquiryEmailCopy | null = null
                try { preview = renderInquiryEmailCopy(inquiryEmailDraft || receiptDefault, { first_name: 'Sarah', event_type: 'Wedding Reception', guest_count: '150' }) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p>{preview.body}</p>{receiptKey !== 'newsletter_confirmation' || inquiryEmailDraft ? <p>{preview.note}</p> : null}{receiptKey === 'newsletter_confirmation' ? <p>You can unsubscribe from any marketing email at any time.</p> : null}<p className="text-[color:var(--portal-muted)]">{receiptKey === 'newsletter_confirmation' ? 'The email also includes links to explore Luxor and schedule a visit.' : receiptKey === 'tour_request_received' ? 'The email also includes the requested tour details, reference and venue links.' : 'The email also includes event details and the visit link.'}</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{receiptName}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The original receipt is used unless you customize it. Its links and required details remain in the email.</p>{inquiryEmailDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{event_type}}'}, {'{{guest_count}}'}.</p>{(['subject', 'preview', 'title', 'greeting', 'body', 'note'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={inquiryEmailDraft[field]} onChange={(event) => setInquiryEmailDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'body' || field === 'note' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setInquiryEmailDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to apply the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setInquiryEmailDraft({ ...receiptDefault })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45">Customize copy</button>}</div>
            ) : isPaidInvoiceEmail ? (
              inspectorTab === 'preview' ? (() => {
                let preview: PaidInvoiceEmailCopy | null = null
                try { preview = renderPaidInvoiceEmailCopy(paidInvoiceDraft || paymentReceiptStarter, 'Sarah') } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{paidInvoiceDraft ? preview.subject : isAgreementClient ? 'Original subject depends on payment link availability.' : isPaymentReceipt ? 'Original subject includes the event or receipt number.' : 'Original subject varies with payment and reservation status.'}</p><p>{preview.greeting}</p><p className="text-[color:var(--portal-muted)]">{isAgreementClient ? 'The actual email includes the signed agreement, document details, and secure payment instructions when available.' : isPaymentReceipt ? 'The actual email includes the recorded amount, receipt details and attached receipt PDF.' : 'The actual email includes the recorded payment amount, reservation status and the paid invoice attachment. Offer or tax details appear when applicable.'}</p>{paidInvoiceDraft ? <p className="whitespace-pre-line">{preview.closing}</p> : <p className="text-[color:var(--portal-muted)]">{isAgreementClient ? 'The original message has no additional closing.' : isPaymentReceipt ? paymentReceiptStarter.closing : 'The original closing varies by payment path.'}</p>}</> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{isAgreementClient ? 'Executed agreement email' : isPaymentReceipt ? 'Staff-requested payment receipt' : 'Paid-invoice confirmation'}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{isAgreementClient ? 'The signed agreement, document details and secure payment instructions are generated from the completed agreement.' : isPaymentReceipt ? 'The amount, payment details and receipt PDF are generated from the actual transaction. Staff review the message and attachment before sending.' : 'The payment amount, reservation status, offer and tax details, and invoice attachment are generated from the actual transaction.'}</p>{paidInvoiceDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variable: {'{{first_name}}'}. {isAgreementClient ? 'The signed document and payment instructions remain unchanged.' : isPaymentReceipt ? 'A copy change requires a new receipt preview.' : 'This copy applies to both Stripe payment paths.'}</p>{(['subject', 'greeting', 'closing'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={paidInvoiceDraft[field]} onChange={(event) => setPaidInvoiceDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'closing' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setPaidInvoiceDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original messages.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setPaidInvoiceDraft({ ...paymentReceiptStarter })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isZelleInstructions ? (
              inspectorTab === 'preview' ? (() => {
                let preview: ZelleInstructionsCopy | null = null
                try { preview = renderZelleInstructionsCopy(zelleDraft || ZELLE_INSTRUCTIONS_DEFAULT, { first_name: 'Sarah', payment_type: 'reservation deposit' }) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p className="whitespace-pre-line">{preview.body}</p><p className="text-[color:var(--portal-muted)]">The actual payment amount and Zelle recipient are inserted from the booking.</p><p>Choosing Zelle does not mean a transfer was sent or received. Your date is reserved only after Luxor confirms receipt. If you have already sent the transfer, reply to this email so Luxor can verify it.</p></> : <p>Complete the copy fields and include the payment type to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Zelle payment instructions</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The payment amount, recipient and payment-status warning are added automatically.</p>{zelleDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{payment_type}}'}. Include payment type in the body.</p>{(['subject', 'greeting', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={zelleDraft[field]} onChange={(event) => setZelleDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'body' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setZelleDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setZelleDraft({ ...ZELLE_INSTRUCTIONS_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isAgreementPackage ? (
              inspectorTab === 'preview' ? (() => {
                let preview: AgreementPackageCopy | null = null
                try { preview = renderAgreementPackageCopy(agreementPackageDraft || AGREEMENT_PACKAGE_DEFAULT, { first_name: 'Sarah', final_balance_schedule: ', with the final event balance due October 24, 2026' }) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p className="text-sm font-bold">{preview.title}</p><p>{preview.greeting} {preview.introduction}</p><p className="whitespace-pre-line">{preview.nextSteps}</p><p className="text-[color:var(--portal-muted)]">The actual email includes the accepted package breakdown, signing button, proposal PDF, agreement PDF and Guest Guide.</p>{!agreementPackageDraft ? <p className="text-[color:var(--portal-muted)]">Without saved customization, the introduction may still be tailored by Elena.</p> : null}</> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Event Agreement package</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Pricing, the secure signing URL, PDF attachments and delivery claim stay system-controlled.</p>{agreementPackageDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{final_balance_schedule}}'} in nextSteps.</p>{(['subject', 'title', 'greeting', 'introduction', 'nextSteps'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={agreementPackageDraft[field]} onChange={(event) => setAgreementPackageDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'introduction' || field === 'nextSteps' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setAgreementPackageDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original message and Elena tailoring.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setAgreementPackageDraft({ ...AGREEMENT_PACKAGE_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isProposalBreakdown ? (
              inspectorTab === 'preview' ? (() => {
                let preview: ProposalBreakdownCopy | null = null
                try { preview = renderProposalBreakdownCopy(breakdownDraft || PROPOSAL_BREAKDOWN_DEFAULT, { first_name: 'Sarah', event_type: 'Wedding Reception' }) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p className="text-[10px] font-bold uppercase tracking-wider text-[#9a712e]">{preview.eyebrow}</p><p className="text-sm font-bold">{preview.headline}</p><p>{preview.intro}</p><p className="text-[color:var(--portal-muted)]">{preview.packageNote}</p><p>{preview.closing}</p><p className="text-[color:var(--portal-muted)]">Package cards, line items, taxes and add-on tables are calculated at send time and saved in the snapshot.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Package comparison email</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Package prices, line items, taxes, add-ons and venue timing are generated from the builder and pricing engine.</p>{breakdownDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{event_type}}'}.</p>{(['subject', 'eyebrow', 'headline', 'intro', 'packageNote', 'closing', 'footer'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={breakdownDraft[field]} onChange={(event) => setBreakdownDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'intro' || field === 'packageNote' || field === 'closing' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setBreakdownDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setBreakdownDraft({ ...PROPOSAL_BREAKDOWN_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isPlannerInvitation ? (
              inspectorTab === 'preview' ? (() => {
                let preview: PlannerInvitationCopy | null = null
                try { preview = renderPlannerInvitationCopy(plannerDraft || PLANNER_INVITATION_DEFAULT, 'Sarah') } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p className="whitespace-pre-line">{plannerDraft ? preview.body : 'Luxor has prepared an event design for you. Open the private presentation to view the selected concept and images, then verify the email address this invitation was sent to with a one-time code.'}</p>{plannerDraft ? <p>Verify the email address this invitation was sent to with a one-time code.</p> : null}<p className="text-[color:var(--portal-muted)]">The email includes the private presentation link and its expiration date. The verification code is sent separately when requested.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Planner presentation invitation</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The private link, expiry and verification instructions are added automatically.</p>{plannerDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variable: {'{{first_name}}'}.</p>{(['subject', 'greeting', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={plannerDraft[field]} onChange={(event) => setPlannerDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'body' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setPlannerDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setPlannerDraft({ ...PLANNER_INVITATION_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isPlannerVerification ? (
              inspectorTab === 'preview' ? (() => {
                let preview: PlannerVerificationCopy | null = null
                try { preview = renderPlannerVerificationCopy(verificationDraft || PLANNER_VERIFICATION_DEFAULT) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p className="text-sm font-bold">{preview.title}</p><p>{preview.greeting}</p><p className="whitespace-pre-line">{preview.intro}</p><p className="text-center text-lg font-bold tracking-[0.35em] text-[#9a712e]">123456</p><p className="whitespace-pre-line">{preview.closing}</p><p className="text-[color:var(--portal-muted)]">{preview.note}</p><p className="text-[color:var(--portal-muted)]">The actual six-digit code, claim behavior and 10-minute validity stay system-controlled and are never stored in message lookup results.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Planner verification code</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The six-digit code block, delivery claim, rate limits and validity window stay system-controlled.</p>{verificationDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">This email has no merge fields.</p>{(['subject', 'title', 'greeting', 'intro', 'closing', 'note'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={verificationDraft[field]} onChange={(event) => setVerificationDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'intro' || field === 'closing' || field === 'note' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setVerificationDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setVerificationDraft({ ...PLANNER_VERIFICATION_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isAgreementOwner ? (
              inspectorTab === 'preview' ? (() => {
                let preview: AgreementOwnerCopy | null = null
                try { preview = renderAgreementOwnerCopy(ownerDraft || AGREEMENT_OWNER_DEFAULT, 'Sarah Jenkins') } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p className="text-sm font-bold">{preview.heading}</p><p className="whitespace-pre-line">{preview.body}</p><p className="text-[color:var(--portal-muted)]">The actual email is sent only to the owner mailbox and includes the internal audit PDF attachment.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Owner audit copy</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The audit PDF and owner-only recipient stay system-controlled.</p>{ownerDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variable: {'{{client_name}}'}.</p>{(['subject', 'heading', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={ownerDraft[field]} onChange={(event) => setOwnerDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'body' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setOwnerDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setOwnerDraft({ ...AGREEMENT_OWNER_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isLayoutReviewEmail ? (
              inspectorTab === 'preview' ? (() => {
                let preview: LayoutReviewEmailCopy | null = null
                try { preview = renderLayoutReviewEmailCopy(layoutDraft || LAYOUT_REVIEW_EMAIL_DEFAULT, { first_name: 'Sarah', layout_name: 'Wedding reception' }) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p className="whitespace-pre-line">{preview.body}</p><p className="text-[color:var(--portal-muted)]">The actual email includes the private review link and its expiration date.</p><p className="whitespace-pre-line">{preview.closing}</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Layout review invitation</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The private link and expiry are added automatically for the selected review.</p>{layoutDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{layout_name}}'}.</p>{(['subject', 'greeting', 'body', 'closing'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={layoutDraft[field]} onChange={(event) => setLayoutDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'body' || field === 'closing' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setLayoutDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setLayoutDraft({ ...LAYOUT_REVIEW_EMAIL_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isTourNoShowEmail ? (
              inspectorTab === 'preview' ? (() => {
                let preview: TourNoShowEmailCopy | null = null
                try { preview = renderTourNoShowEmailCopy(noShowDraft || TOUR_NO_SHOW_DEFAULT, { full_name: 'Sarah Jenkins', first_name: 'Sarah', event_details: 'Wedding Reception for 150 guests' }) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p className="whitespace-pre-line">{preview.body}</p><p>If you still want to see the space, reply to this email and we will help find a better time.</p><p className="text-[color:var(--portal-muted)]">The email also includes any event notes the client shared.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">Reschedule email</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The email includes a request to reply for a new time and any event notes the client shared.</p>{noShowDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{full_name}}'}, {'{{first_name}}'}, {'{{event_details}}'}.</p>{(['subject', 'greeting', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={noShowDraft[field]} onChange={(event) => setNoShowDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'body' ? 4 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setNoShowDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setNoShowDraft({ ...TOUR_NO_SHOW_DEFAULT })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isOfferSystem ? (
              inspectorTab === 'preview' ? (() => {
                if (!offerDraft) return <p className="text-xs leading-5 text-[color:var(--portal-muted)]">{isPaymentRequestEmail ? 'The original reminder can be tailored by Elena when it is sent. The secure payment link and current balance are added where applicable.' : 'The original reminder may be tailored by Elena. Approved offer details and the secure review link are included in the email.'}</p>
                let preview: OfferReminderCopy | null = null
                try { preview = renderOfferReminderCopy(offerDraft, 'Sarah') } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p>{preview.body}</p><p className="text-[color:var(--portal-muted)]">{isPaymentRequestEmail ? 'The actual email includes payment details and the secure link.' : 'The actual email also includes approved offer details and the secure review link.'}</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{offerStepName}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{isPaymentRequestEmail ? 'The original message may be tailored by Elena. Payment details and the secure link remain system-generated.' : 'The original message may be tailored by Elena. Offer details and the secure link remain system-generated. Deposit reminders use refreshed payment details and a payment link.'}</p>{offerDraft ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variable: {'{{first_name}}'}.</p>{(['subject', 'title', 'greeting', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={offerDraft[field]} onChange={(event) => setOfferDraft((current) => current ? { ...current, [field]: event.target.value } : current)} disabled={!editable || saving} rows={field === 'body' ? 4 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setOfferDraft(null)} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save changes to restore the original behavior.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setOfferDraft({ ...(isPaymentRequestEmail ? PAYMENT_REQUEST_REMINDER_EDIT_STARTER : OFFER_REMINDER_EDIT_STARTER) })} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isAgreementSystem ? (
              inspectorTab === 'preview' ? (() => {
                let preview: AgreementReminderCopy | null = null
                try { preview = renderAgreementReminderCopy(agreementDrafts[agreementKey] || AGREEMENT_REMINDER_DEFAULTS[agreementKey], 'Sarah') } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p>{preview.body}</p><p className="text-[color:var(--portal-muted)]">The actual email also includes the secure agreement link.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{selectedStep.name}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The original message is used unless you customize it. The secure signing link stays system-generated.</p>{agreementDrafts[agreementKey] ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variable: {'{{first_name}}'}.</p>{(['subject', 'title', 'greeting', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={agreementDrafts[agreementKey]?.[field] || ''} onChange={(event) => setAgreementDrafts((current) => ({ ...current, [agreementKey]: { ...current[agreementKey]!, [field]: event.target.value } }))} disabled={!editable || saving} rows={field === 'body' ? 4 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setAgreementDrafts((current) => ({ ...current, [agreementKey]: null }))} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save the selected step to apply the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setAgreementDrafts((current) => ({ ...current, [agreementKey]: { ...AGREEMENT_REMINDER_DEFAULTS[agreementKey] } }))} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isEventEmailSystem ? (
              inspectorTab === 'preview' ? (() => {
                let preview: EventEmailCopy | null = null
                try { preview = renderEventEmailCopy(eventEmailDrafts[eventEmailKey] || EVENT_EMAIL_DEFAULTS[eventEmailKey], { first_name: 'Sarah', event_type: 'Wedding Reception' }) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p>{preview.body}</p>{eventEmailKey !== 'thanks' ? <p className="text-[color:var(--portal-muted)]">The actual email also includes the saved event date.</p> : null}</> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{selectedStep.name}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The original message is used unless you customize it. The event date remains system-generated where applicable.</p>{eventEmailDrafts[eventEmailKey] ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{event_type}}'}.</p>{(['subject', 'title', 'greeting', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={eventEmailDrafts[eventEmailKey]?.[field] || ''} onChange={(event) => setEventEmailDrafts((current) => ({ ...current, [eventEmailKey]: { ...current[eventEmailKey]!, [field]: event.target.value } }))} disabled={!editable || saving} rows={field === 'body' ? 4 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setEventEmailDrafts((current) => ({ ...current, [eventEmailKey]: null }))} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save the selected step to apply the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setEventEmailDrafts((current) => ({ ...current, [eventEmailKey]: { ...EVENT_EMAIL_DEFAULTS[eventEmailKey] } }))} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isFinalPaymentSystem ? (
              inspectorTab === 'preview' ? (() => {
                const draft = finalPaymentDrafts[finalPaymentKey]
                if (!draft) return <p className="text-xs leading-5 text-[color:var(--portal-muted)]">The original reminder may be tailored by Elena. The actual balance, due date and secure payment link are added when the email is prepared.</p>
                let preview: FinalPaymentReminderCopy | null = null
                try { preview = renderFinalPaymentReminderCopy(draft, 'Sarah') } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p>{preview.body}</p><p className="text-[color:var(--portal-muted)]">The actual email includes the current balance, due date, and secure payment link.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{selectedStep.name}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{finalPaymentDrafts[finalPaymentKey] ? 'Custom wording replaces the tailored copy. The current balance, due date and secure link remain system-generated.' : 'Original wording may be tailored by Elena. Customize to replace it with your own wording.'}</p>{finalPaymentDrafts[finalPaymentKey] ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variable: {'{{first_name}}'}.</p>{(['subject', 'title', 'greeting', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={finalPaymentDrafts[finalPaymentKey]?.[field] || ''} onChange={(event) => setFinalPaymentDrafts((current) => ({ ...current, [finalPaymentKey]: { ...current[finalPaymentKey]!, [field]: event.target.value } }))} disabled={!editable || saving} rows={field === 'body' ? 4 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setFinalPaymentDrafts((current) => ({ ...current, [finalPaymentKey]: null }))} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original behavior</button><p className="text-xs text-[color:var(--portal-muted)]">Save the selected step to apply the original behavior.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setFinalPaymentDrafts((current) => ({ ...current, [finalPaymentKey]: { ...FINAL_PAYMENT_REMINDER_DEFAULT } }))} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isCalendarMessageSystem ? (
              inspectorTab === 'preview' ? (
                <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">
                  <p className="font-bold">{calendarMessageKey === 'cancellation' ? `${(calendarMessageDrafts.cancellation as CalendarCancellationCopy | null)?.subjectPrefix || CALENDAR_CANCELLATION_DEFAULT.subjectPrefix}Venue tour` : 'Venue tour'}</p>
                  <p className="whitespace-pre-line">{calendarMessageKey === 'cancellation' ? (calendarMessageDrafts.cancellation as CalendarCancellationCopy | null)?.footer || CALENDAR_CANCELLATION_DEFAULT.footer : (calendarMessageDrafts.update as CalendarUpdateCopy | null)?.footer || CALENDAR_UPDATE_DEFAULT.footer}</p>
                  <p className="text-[color:var(--portal-muted)]">Event title, date, location, description and the iCalendar attachment come from the saved revision.</p>
                </div>
              ) : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{selectedStep.name}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Customize the email wrapper only. Calendar semantics, sequence numbers and attendee validation stay system-controlled.</p>{calendarMessageDrafts[calendarMessageKey] ? <>{calendarMessageKey === 'cancellation' ? (['subjectPrefix', 'footer'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={(calendarMessageDrafts.cancellation as CalendarCancellationCopy)?.[field] || ''} onChange={(event) => setCalendarMessageDrafts((current) => ({ ...current, cancellation: { ...(current.cancellation as CalendarCancellationCopy || CALENDAR_CANCELLATION_DEFAULT), [field]: event.target.value } }))} disabled={!editable || saving} rows={field === 'footer' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>) : <label className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">footer<textarea value={(calendarMessageDrafts.update as CalendarUpdateCopy)?.footer || ''} onChange={(event) => setCalendarMessageDrafts((current) => ({ ...current, update: { ...(current.update as CalendarUpdateCopy || CALENDAR_UPDATE_DEFAULT), footer: event.target.value } }))} disabled={!editable || saving} rows={3} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>}<button type="button" disabled={!editable || saving} onClick={() => setCalendarMessageDrafts((current) => ({ ...current, [calendarMessageKey]: null }))} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save the selected step to apply the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setCalendarMessageDrafts((current) => ({ ...current, [calendarMessageKey]: { ...CALENDAR_MESSAGE_DEFAULTS[calendarMessageKey] } }))} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isManualInvoiceReminderSystem ? (
              inspectorTab === 'preview' ? (() => {
                const draft = manualInvoiceDrafts[manualInvoiceKey]
                if (!draft) return <p className="text-xs leading-5 text-[color:var(--portal-muted)]">The original reminder may be tailored by Elena when staff send it. The actual balance, due date and secure payment link are added when the email is prepared.</p>
                let preview: FinalPaymentReminderCopy | null = null
                try { preview = renderFinalPaymentReminderCopy(draft, 'Sarah') } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p>{preview.body}</p><p className="text-[color:var(--portal-muted)]">The actual email includes the current balance, due date, and secure payment link.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{selectedStep.name}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{manualInvoiceDrafts[manualInvoiceKey] ? 'Custom wording replaces tailored copy for future staff sends. Balance, due date and secure link remain system-generated.' : 'Original wording may be tailored by Elena when staff request a reminder. Customize to replace it with your own wording.'}</p>{manualInvoiceDrafts[manualInvoiceKey] ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variable: {'{{first_name}}'}.</p>{(['subject', 'title', 'greeting', 'body'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={manualInvoiceDrafts[manualInvoiceKey]?.[field] || ''} onChange={(event) => setManualInvoiceDrafts((current) => ({ ...current, [manualInvoiceKey]: { ...current[manualInvoiceKey]!, [field]: event.target.value } }))} disabled={!editable || saving} rows={field === 'body' ? 4 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setManualInvoiceDrafts((current) => ({ ...current, [manualInvoiceKey]: null }))} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original behavior</button><p className="text-xs text-[color:var(--portal-muted)]">Save the selected step to apply the original behavior.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setManualInvoiceDrafts((current) => ({ ...current, [manualInvoiceKey]: { ...MANUAL_INVOICE_REMINDER_DEFAULTS[manualInvoiceKey] } }))} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-60">Customize copy</button>}</div>
            ) : isInstallmentSystem ? (
              inspectorTab === 'preview' ? (() => {
                let preview: InstallmentReminderCopy | null = null
                try { preview = renderInstallmentReminderCopy(installmentDrafts[installmentKey] || INSTALLMENT_REMINDER_DEFAULTS[installmentKey], { first_name: 'Sarah', payment_label: 'Scheduled payment' }) } catch { /* Incomplete drafts cannot yet be previewed. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p>{preview.body}</p><p>{preview.note}</p><p className="text-[color:var(--portal-muted)]">The actual email also includes the payment name, current remaining amount, and due date.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{selectedStep.name}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">The payment name, current balance, and due date are included separately and are checked again before sending.</p>{installmentDrafts[installmentKey] ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{payment_label}}'}.</p>{(['subject', 'title', 'greeting', 'body', 'note'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={installmentDrafts[installmentKey]?.[field] || ''} onChange={(event) => setInstallmentDrafts((current) => ({ ...current, [installmentKey]: { ...current[installmentKey]!, [field]: event.target.value } }))} disabled={!editable || saving} rows={field === 'body' || field === 'note' ? 3 : 1} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setInstallmentDrafts((current) => ({ ...current, [installmentKey]: null }))} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original message</button><p className="text-xs text-[color:var(--portal-muted)]">Save the selected step to apply the original message.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setInstallmentDrafts((current) => ({ ...current, [installmentKey]: { ...INSTALLMENT_REMINDER_DEFAULTS[installmentKey] } }))} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45">Customize copy</button>}</div>
            ) : isTourEmailSystem ? (
              inspectorTab === 'preview' ? (() => {
                const draft = tourEmailDrafts[tourEmailKey]
                if (!draft) return <p className="text-xs leading-5 text-[color:var(--portal-muted)]">This step uses its original {tourEmailKey === 'confirmation' ? 'confirmation copy, which may be tailored by Elena' : 'reminder copy'}. Review the default sample in tour notification details.</p>
                let preview: TourEmailCopy | null = null
                try { preview = renderTourEmailCopy(draft, { first_name: 'Sarah', event_type: 'Wedding Reception', guest_count: '150', tour_date: 'October 24, 2026', tour_time: '11:00 AM', meeting_type: 'Private venue tour', client_notes: 'Sample tour notes' }) } catch { /* Drafts can be incomplete. */ }
                return <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-text)]">{preview ? <><p className="font-bold">{preview.subject}</p><p>{preview.greeting}</p><p>{preview.introduction}</p><p>{preview.preparation}</p><p>{preview.closing}</p><p className="text-[color:var(--portal-muted)]">The actual email also includes the scheduled tour details and applicable reschedule and cancellation links.</p></> : <p>Complete the copy fields to preview this email.</p>}</div>
              })() : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{selectedStep.name}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">{tourEmailDrafts[tourEmailKey] ? 'Custom copy is used for future tour schedules. The calendar details and secure links remain system-generated.' : tourEmailKey === 'confirmation' ? 'Uses the original confirmation, which may be tailored by Elena. Customizing replaces that generated copy.' : 'Uses the original reminder copy.'}</p>{tourEmailDrafts[tourEmailKey] ? <><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Variables: {'{{first_name}}'}, {'{{event_type}}'}, {'{{guest_count}}'}, {'{{tour_date}}'}, {'{{tour_time}}'}, {'{{meeting_type}}'}, {'{{client_notes}}'}.</p>{(['subject', 'greeting', 'introduction', 'preparation', 'closing'] as const).map((field) => <label key={field} className="block text-xs font-semibold capitalize text-[color:var(--portal-text)]">{field}<textarea value={tourEmailDrafts[tourEmailKey]?.[field] || ''} onChange={(event) => setTourEmailDrafts((current) => ({ ...current, [tourEmailKey]: { ...current[tourEmailKey]!, [field]: event.target.value } }))} disabled={!editable || saving} rows={field === 'subject' || field === 'greeting' ? 1 : 3} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label>)}<button type="button" disabled={!editable || saving} onClick={() => setTourEmailDrafts((current) => ({ ...current, [tourEmailKey]: null }))} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Restore original behavior</button><p className="text-xs text-[color:var(--portal-muted)]">Save the selected step to apply the original behavior.</p></> : <button type="button" disabled={!editable || saving} onClick={() => setTourEmailDrafts((current) => ({ ...current, [tourEmailKey]: { ...TOUR_EMAIL_STARTERS[tourEmailKey] } }))} className="min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45">Customize copy</button>}</div>
            ) : isPhoneSystem ? (
              inspectorTab === 'preview' ? <div className="space-y-3"><p className="text-xs text-[color:var(--portal-muted)]">Message preview</p><p className="rounded-xl bg-[color:var(--portal-soft)] p-4 text-sm leading-6 text-[color:var(--portal-text)]">{systemBody || 'Enter a message to preview.'}</p></div> : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{nameDraft}</h3><label className="flex min-h-11 items-center gap-3 text-sm text-[color:var(--portal-text)]"><input type="checkbox" checked={phoneEnabled} onChange={(event) => setPhoneEnabled(event.target.checked)} disabled={!editable || saving} className="accent-[#caa24c]" /> Send this automatic reply</label><label className="block text-xs font-semibold text-[color:var(--portal-text)]">Message<textarea value={systemBody} onChange={(event) => updateStepField(selectedStep.id, 'body', event.target.value)} maxLength={480} rows={5} disabled={!editable || saving} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] outline-none focus:ring-2 focus:ring-[#caa24c]/45 disabled:opacity-60" /></label><p className="text-xs leading-5 text-[color:var(--portal-muted)]">When editing the message, start with “Luxor Event Space:” and end with “Reply STOP to opt out.” Existing wording can be kept when changing the settings.</p>{phoneKind === 'inbound_acknowledgment' ? <label className="block text-xs font-semibold text-[color:var(--portal-text)]">Minimum hours between replies to the same person<input type="number" min={1} max={168} value={phoneCooldown} onChange={(event) => setPhoneCooldown(Number(event.target.value))} disabled={!editable || saving} className="mt-2 block w-28 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] disabled:opacity-60" /></label> : null}<button type="button" onClick={() => updateStepField(selectedStep.id, 'body', phoneMessage?.defaultBody || '')} disabled={!editable || saving} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Load original message</button><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Review the original, then save to apply it to future replies.</p></div>
            ) : isTemplateSystem ? (
              inspectorTab === 'preview' ? <div className="space-y-3"><p className="text-xs text-[color:var(--portal-muted)]">Sample message</p><p className="rounded-xl bg-[color:var(--portal-soft)] p-4 text-sm leading-6 text-[color:var(--portal-text)]">{systemPreview || 'Enter a valid message to see the preview.'}</p></div> : <div className="space-y-4"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{isMultiSystem ? selectedStep.name : nameDraft}</h3><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Luxor identification and STOP instructions are added automatically. {isTourTextSystem ? <>Use {'{{first_name}}'}, {'{{tour_date}}'}, and {'{{tour_time_suffix}}'}. The confirmation requires the date; the time suffix adds “at” only when a time is available.</> : isInvoiceSystem ? (invoiceKey === 'invoice_payment_request' ? <>Use {'{{first_name}}'} and the required {'{{amount}}'} and {'{{payment_url}}'}. The payment link comes from the actual request.</> : <>Use {'{{first_name}}'} and the required {'{{amount}}'} and {'{{due_date}}'}.</>) : isEventSystem ? <>Use {'{{first_name}}'}, {'{{event_type}}'}, {'{{time_until}}'}, and the required {'{{event_date}}'}.</> : isPaymentSystem ? <>Use {'{{first_name}}'} and the required {'{{amount}}'}.</> : <>Use {'{{first_name}}'}, {'{{full_name}}'}, {'{{event_type}}'}, {'{{guest_count}}'}, and {'{{target_date}}'} from the inquiry.</>}</p><>{isInquirySystem ? <WorkflowVariableChipsBar tokens={INQUIRY_CONFIRMATION_CHIP_TOKENS} disabled={!editable || saving} onInsert={insertInquiryVariable} /> : null}</><label className="block text-xs font-semibold text-[color:var(--portal-text)]">Message<textarea ref={isInquirySystem ? inquiryTextRef : undefined} value={systemBody} onChange={(event) => updateStepField(selectedStep.id, 'body', event.target.value)} maxLength={300} rows={5} disabled={!editable || saving} className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] outline-none focus:ring-2 focus:ring-[#caa24c]/45 disabled:opacity-60" /></label><button type="button" onClick={() => updateStepField(selectedStep.id, 'body', activeSystemMessage?.defaultBody || '')} disabled={!editable || saving} className="min-h-11 text-xs font-semibold text-[#8c6424] underline underline-offset-2 disabled:opacity-45 dark:text-[#f1d27a]">Load original message</button><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Review the original, then save to apply it to future texts.</p></div>
            ) : inspectorTab === 'preview' ? (
              /* Live Preview with Real Lead Mock Context */
              <PortalStaggerGroup className="space-y-4" delayChildren={0.07} staggerDelay={0.05}>
                <PortalStaggerCard className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs text-[color:var(--portal-muted)]">
                  Previewing with sample lead: <span className="font-semibold text-[color:var(--portal-text)]">{selectedStep.type === 'email' ? 'Sample Guest · Private celebration (80 guests)' : 'Sarah Jenkins · Wedding Reception (150 guests)'}</span>
                </PortalStaggerCard>

                {selectedStep.type === 'call_task' ? (
                  <PortalStaggerCard className="rounded-2xl border-2 border-emerald-500/50 bg-[color:var(--portal-card)] p-5 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                      <Phone size={15} /> Arianna Call Task Card
                    </div>
                    <h4 className="text-base font-bold text-[color:var(--portal-text)]">
                      {selectedStep.name}
                    </h4>
                    <div className="space-y-1.5 text-xs text-[color:var(--portal-muted)]">
                      <p>Priority: <span className="font-bold uppercase text-[color:var(--portal-text)]">{selectedStep.priority}</span></p>
                      <p>Due Timeframe: <span className="font-bold text-[color:var(--portal-text)]">Within {selectedStep.dueWithinHours}h</span></p>
                    </div>
                    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3.5 text-xs text-[color:var(--portal-text)] whitespace-pre-wrap">
                      {selectedStep.scriptNotes
                        ?.replace(/\{\{\s*first_name\s*\}\}/g, 'Sarah')
                        ?.replace(/\{\{\s*full_name\s*\}\}/g, 'Sarah Jenkins')
                        ?.replace(/\{\{\s*event_type\s*\}\}/g, 'Wedding Reception')
                        ?.replace(/\{\{\s*guest_count\s*\}\}/g, '150 guests')
                        ?.replace(/\{\{\s*target_date\s*\}\}/g, 'October 24, 2026') || 'No script notes entered.'}
                    </div>
                  </PortalStaggerCard>
                ) : selectedStep.type === 'email' ? (
                  selectedStep.mode === 'existing_inquiry_acknowledgment' ? <div className="space-y-3 text-xs leading-5 text-[color:var(--portal-muted)]"><p>The inquiry form sends the acknowledgment once. Its content is shared across inquiries.</p><Link href="/portal/marketing/custom-workflows/system-inquiry-email" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-[#8c6424] underline underline-offset-2 dark:text-[#f1d27a]">Open inquiry email settings</Link></div> : <WorkflowEmailPreview step={selectedStep} emailSettings={definitionDraft.emailSettings || (editable && emailOptions?.senders[0] ? { senderMode: 'operator', senderEmail: emailOptions.senders[0] } : undefined)} />
                ) : selectedStep.type === 'text' ? (
                  <PortalStaggerCard className="rounded-2xl border border-sky-500/40 bg-[color:var(--portal-card)] p-5 space-y-3">
                    <div className="flex items-center gap-2 text-sky-500 font-bold text-xs">
                      <MessageSquare size={14} /> SMS Text Preview
                    </div>
                    <div className="rounded-2xl rounded-bl-sm bg-sky-500/10 border border-sky-500/20 p-4 text-xs text-[color:var(--portal-text)] leading-5">
                      {selectedStep.body
                        ?.replace(/\{\{\s*first_name\s*\}\}/g, 'Sarah')
                        ?.replace(/\{\{\s*event_type\s*\}\}/g, 'Wedding Reception') || 'SMS message text.'}
                    </div>
                  </PortalStaggerCard>
                ) : (
                  <PortalStaggerCard className="text-xs text-[color:var(--portal-muted)]">
                    Control step: {selectedStep.name}
                  </PortalStaggerCard>
                )}
              </PortalStaggerGroup>
            ) : readOnlyVersion ? (
              <div className="space-y-3 py-3 text-xs leading-5 text-[color:var(--portal-muted)]"><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Read-only workflow version</h3><p>Use Live Preview to review this step. Duplicate the workflow to edit its content or sender in a new draft.</p></div>
            ) : !canEditCustomWorkflowStep(selectedStep) ? (
              <div className="space-y-3 py-3 text-xs leading-5 text-[color:var(--portal-muted)]">
                <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Existing inquiry acknowledgment</h3>
                <p>The inquiry form already sends this acknowledgment. This step records that message without sending a second email.</p>
                <p>Its copy and sender follow the inquiry acknowledgment settings. Add a new email step to choose a template, sender, or client-specific instructions.</p>
                {selectedStep.type === 'email' && selectedStep.mode === 'existing_inquiry_acknowledgment' ? <Link href="/portal/marketing/custom-workflows/system-inquiry-email" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-[#8c6424] underline underline-offset-2 dark:text-[#f1d27a]">Open inquiry email settings</Link> : null}
              </div>
            ) : (
              /* Step Configuration Form */
              <PortalStaggerGroup className="space-y-4" delayChildren={0.06} staggerDelay={0.045}>
                {/* Step Name */}
                <PortalStaggerCard>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                      Step Name / Title
                    </label>
                    <input
                      type="text"
                      value={selectedStep.name}
                      onChange={(e) => updateStepField(selectedStep.id, 'name', e.target.value)}
                      className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]"
                    />
                  </div>
                </PortalStaggerCard>

                {/* CALL TASK SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'call_task' ? (
                  <PortalStaggerCard className="space-y-4 border-t border-[color:var(--portal-border)] pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                          Priority
                        </label>
                        <PortalSelect
                          value={selectedStep.type === 'call_task' ? selectedStep.priority : 'medium'}
                          onChange={(val) => updateStepField(selectedStep.id, 'priority', val)}
                          options={[
                            { value: 'low', label: 'Low' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'high', label: 'High' },
                            { value: 'urgent', label: 'Urgent (Immediate)' },
                          ]}
                        buttonClassName="!min-h-9"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                          Due Timeframe
                        </label>
                        <PortalSelect
                          value={String(selectedStep.type === 'call_task' ? selectedStep.dueWithinHours : 2)}
                          onChange={(val) => updateStepField(selectedStep.id, 'dueWithinHours', Number(val))}
                          options={[
                            { value: '1', label: 'Within 1 hour' },
                            { value: '2', label: 'Within 2 hours' },
                            { value: '4', label: 'Within 4 hours' },
                            { value: '24', label: 'Within 24 hours' },
                            { value: '48', label: 'Within 48 hours' },
                          ]}
                        buttonClassName="!min-h-9"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Assigned Operator
                      </label>
                      <input
                        type="text"
                        value={selectedStep.type === 'call_task' ? (selectedStep.assignee || 'Arianna Patterson') : 'Arianna Patterson'}
                        onChange={(e) => updateStepField(selectedStep.id, 'assignee', e.target.value)}
                        className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]"
                      />
                    </div>

                    {/* Dynamic Variable Chips */}
                    <WorkflowVariableChipsBar onInsert={handleInsertChip} />

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Talking Points & Script Notes
                      </label>
                      <WorkflowTokenEditor
                        key={selectedStep.id}
                        ref={callScriptEditorRef}
                        label="Talking points and script notes"
                        value={selectedStep.type === 'call_task' ? (selectedStep.scriptNotes || '') : ''}
                        onChange={(value) => updateStepField(selectedStep.id, 'scriptNotes', value)}
                        rows={4}
                        placeholder="e.g. Call {{first_name}} to discuss date availability for {{target_date}} with {{guest_count}}..."
                      />
                    </div>
                  </PortalStaggerCard>
                ) : null}

                {/* EMAIL SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'email' ? (
                  <PortalStaggerCard className="space-y-4 border-t border-[color:var(--portal-border)] pt-4">
                    <WorkflowEmailTemplateControls step={selectedStep} onChange={(next) => changeStep(selectedStep.id, () => next)} venueAddress={emailOptions?.venue.address} />
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Writing method</label>
                      <PortalSelect value={selectedStep.generationMode || 'manual'} onChange={(value) => updateStepField(selectedStep.id, 'generationMode', value)} options={[{ value: 'manual', label: 'Use this saved copy' }, { value: 'ai', label: 'Elena writes fresh for each client' }]} />
                    </div>
                    {selectedStep.generationMode === 'ai' ? (
                      <div className="space-y-3 rounded-xl border border-[color:var(--portal-border)] p-3.5">
                        <label htmlFor="workflow-email-ai-prompt" className="block text-xs font-semibold text-[color:var(--portal-text)]">Instructions for each client</label>
                        <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Elena uses the client&apos;s inquiry, event details, previous conversations, and current venue settings at this step. {selectedStep.emailStyle === 'template' ? 'She can rewrite and rearrange the HTML elements.' : 'She writes a personal email directly from your instructions.'} Review a sample before activating.</p>
                        <textarea id="workflow-email-ai-prompt" value={selectedStep.aiPrompt || ''} onChange={(event) => updateStepField(selectedStep.id, 'aiPrompt', event.target.value)} rows={4} placeholder="Write a warm, personal invitation to tour. Refer to what this client told us. Ask one easy question. Do not invent availability, pricing, or offers." className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" />
                        <button type="button" onClick={() => handleGenerateAiCopy('email')} disabled={generatingAiCopy || !selectedStep.aiPrompt?.trim() || (selectedStep.emailStyle === 'template' && !selectedStep.emailDocument)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:cursor-not-allowed disabled:opacity-50">
                          {generatingAiCopy ? <RefreshCw size={14} className="animate-spin" /> : <Bot size={14} />} Generate sample · no sending
                        </button>
                      </div>
                    ) : null}
                    {selectedStep.emailStyle !== 'template' ? <WorkflowVariableChipsBar onInsert={handleInsertChip} /> : null}
                    <div>
                      <label htmlFor="workflow-email-subject" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">{selectedStep.generationMode === 'ai' ? 'Sample subject line' : 'Subject line'}</label>
                      <input id="workflow-email-subject" value={selectedStep.subject || ''} onChange={(event) => updateStepField(selectedStep.id, 'subject', event.target.value)} placeholder="Planning your {{event_type}} at Luxor" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" />
                    </div>
                    <div>
                      <label htmlFor="workflow-email-preheader" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Inbox preview text</label>
                      <input id="workflow-email-preheader" value={selectedStep.previewText || ''} onChange={(event) => updateStepField(selectedStep.id, 'previewText', event.target.value)} placeholder="A short preview for the client's inbox" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" />
                    </div>
                    {selectedStep.emailStyle !== 'template' ? <>
                      <div>
                        <label htmlFor="workflow-email-body" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">{selectedStep.generationMode === 'ai' ? 'Sample email copy' : 'Email copy'}</label>
                        <textarea id="workflow-email-body" value={selectedStep.body || ''} onChange={(event) => updateStepField(selectedStep.id, 'body', event.target.value)} rows={7} placeholder="Hi {{first_name}}," className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs leading-5 text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" />
                        <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">The selected sender&apos;s signature is added automatically.</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><label htmlFor="workflow-email-button-label" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Optional button label</label><input id="workflow-email-button-label" value={selectedStep.ctaText || ''} onChange={(event) => updateStepField(selectedStep.id, 'ctaText', event.target.value)} placeholder="Schedule a tour" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" /></div>
                        <div><label htmlFor="workflow-email-button-url" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Destination</label><input id="workflow-email-button-url" value={selectedStep.ctaUrl || ''} onChange={(event) => updateStepField(selectedStep.id, 'ctaUrl', event.target.value)} placeholder="/tour" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" /></div>
                      </div>
                    </> : null}
                  </PortalStaggerCard>
                ) : null}

                {/* TEXT (SMS) SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'text' ? (
                  <PortalStaggerCard className="space-y-4 border-t border-[color:var(--portal-border)] pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
                        Authoring Mode
                      </span>
                      <div className="flex gap-1 rounded-lg border border-[color:var(--portal-border)] p-0.5 bg-[color:var(--portal-soft)]">
                        <button
                          type="button"
                          onClick={() => updateStepField(selectedStep.id, 'generationMode', 'manual')}
                          className={`rounded px-2 py-1 text-[10px] font-bold transition ${
                            selectedStep.type === 'text' && selectedStep.generationMode !== 'ai'
                              ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-xs'
                              : 'text-[color:var(--portal-muted)]'
                          }`}
                        >
                          Manual Draft
                        </button>
                        <button
                          type="button"
                          onClick={() => updateStepField(selectedStep.id, 'generationMode', 'ai')}
                          className={`rounded px-2 py-1 text-[10px] font-bold transition ${
                            selectedStep.type === 'text' && selectedStep.generationMode === 'ai'
                              ? 'bg-[#caa24c] text-white shadow-xs'
                              : 'text-[color:var(--portal-muted)]'
                          }`}
                        >
                          Elena AI
                        </button>
                      </div>
                    </div>

                    {selectedStep.type === 'text' && selectedStep.generationMode === 'ai' ? (
                      <div className="rounded-xl border border-[#caa24c]/40 bg-[#caa24c]/5 p-3.5 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#8c6424] dark:text-[#f1d27a]">
                          SMS Instructions for Elena
                        </span>
                        <textarea
                          value={selectedStep.aiPrompt || ''}
                          onChange={(e) => updateStepField(selectedStep.id, 'aiPrompt', e.target.value)}
                          rows={2}
                          placeholder="e.g. Ask {{first_name}} if they need special setup for their {{event_type}}..."
                          className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 text-xs text-[color:var(--portal-text)] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleGenerateAiCopy('text')}
                          disabled={generatingAiCopy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#caa24c] px-3 py-1.5 text-xs font-bold text-white hover:text-white"
                        >
                          {generatingAiCopy ? <RefreshCw size={12} className="animate-spin" /> : <Bot size={12} />}
                          <span>Generate SMS with Elena</span>
                        </button>
                      </div>
                    ) : null}

                    {/* Dynamic Variable Chips */}
                    <WorkflowVariableChipsBar onInsert={handleInsertChip} />

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
                          Message Body
                        </label>
                        <span className="text-[10px] font-mono text-[color:var(--portal-muted)]">
                          {(selectedStep.type === 'text' ? selectedStep.body : '').length}/{CUSTOM_WORKFLOW_TEXT_MAX_LENGTH}
                        </span>
                      </div>
                      <textarea
                        value={selectedStep.type === 'text' ? (selectedStep.body || '') : ''}
                        onChange={(e) => updateStepField(selectedStep.id, 'body', e.target.value)}
                        rows={4}
                        placeholder="Luxor Events: Hi {{first_name}}... Reply STOP to opt out."
                        className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]"
                      />
                      <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">
                        Must start with &ldquo;Luxor Events:&rdquo; and end with &ldquo;Reply STOP to opt out.&rdquo;
                      </p>
                    </div>
                  </PortalStaggerCard>
                ) : null}

                {/* WAIT DELAY SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'wait' ? (
                  <PortalStaggerCard className="grid grid-cols-2 gap-3 border-t border-[color:var(--portal-border)] pt-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Delay Amount
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={selectedStep.type === 'wait' ? (selectedStep.amount || 1) : 1}
                        onChange={(e) => updateStepField(selectedStep.id, 'amount', Number(e.target.value))}
                        className="h-9 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-xs text-[color:var(--portal-text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Unit
                      </label>
                      <PortalSelect
                        value={selectedStep.type === 'wait' ? selectedStep.unit : 'days'}
                        onChange={(val) => updateStepField(selectedStep.id, 'unit', val)}
                        options={[
                          { value: 'minutes', label: 'Minutes' },
                          { value: 'hours', label: 'Hours' },
                          { value: 'days', label: 'Days' },
                        ]}
                        buttonClassName="!min-h-9"
                      />
                    </div>
                  </PortalStaggerCard>
                ) : null}

                {/* CONDITION SPECIFIC CONFIGURATION */}
                {selectedStep.type === 'condition' ? (
                  <PortalStaggerCard className="space-y-3 border-t border-[color:var(--portal-border)] pt-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block mb-1">
                        Condition Rule
                      </label>
                      <PortalSelect
                        value={selectedStep.type === 'condition' ? selectedStep.condition : 'follow_up_eligible'}
                        onChange={(val) => updateStepField(selectedStep.id, 'condition', val)}
                        options={[
                          { value: 'follow_up_eligible', label: 'Lead remains eligible for follow-up' },
                          { value: 'marketing_sms_consent', label: 'SMS marketing consent confirmed' },
                          { value: 'marketing_email_consent', label: 'Email marketing consent confirmed' },
                          { value: 'tour_scheduled', label: 'Tour has been scheduled' },
                          { value: 'tour_attended', label: 'Tour was completed' },
                          { value: 'unresponsive', label: 'Lead has not yet scheduled a visit' },
                        ]}
                        buttonClassName="!min-h-9"
                      />
                    </div>
                    <p className="text-[11px] text-[color:var(--portal-muted)]">
                      If condition is not met, the workflow automatically halts execution cleanly.
                    </p>
                  </PortalStaggerCard>
                ) : null}
              </PortalStaggerGroup>
            )}
            </PortalTabTransition>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </PortalPageFrame>
  )
}
