'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Mail,
  Send,
  Maximize2,
  Eye,
  Pencil,
  Sparkles,
  ExternalLink,
  Minus,
  Plus,
  MoreVertical,
  ChevronDown,
  Check,
  CheckCircle
} from 'lucide-react'
import { PortalSelect, PortalCloseButton } from '@/components/portal/PortalUI'
import { EmailRichTextEditor } from '@/components/portal/EmailRichTextEditor'
import { LuxorInquiry, LuxorMarketingTemplate } from '@/lib/luxorInquiryTypes'
import { EMAIL_TEMPLATES, EmailBlock } from '@/app/(portal)/portal/marketing/emailTemplates'
import { renderEmailToHtml } from '@/app/(portal)/portal/marketing/EmailBuilder/emailRenderer'
import { BrandAssetPicker } from './BrandAssetPicker'
import { buildConversationalEmailHtml } from '@/lib/luxorConversationalEmailServer'
import { stripTrackingPixels } from '@/lib/luxorTextUtils'
import { publishLuxorEmailSent } from '@/lib/luxorLeadEmailNotice'

// These addresses are explicitly approved for Luxor's Resend domain.
const ALLOWED_SENDERS = [
  { value: 'booking@luxoratlaspalmas.com', label: 'Booking Email' },
  { value: 'hello@luxoratlaspalmas.com', label: 'Hello Email' },
  { value: 'a.patterson@luxoratlaspalmas.com', label: 'Arianna Patterson' },
]

function createManualEmailIdempotencyKey() {
  const random = window.crypto
  const uuid = typeof random.randomUUID === 'function'
    ? random.randomUUID()
    : (() => {
      const bytes = random.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    })()
  return `manual/${uuid}`
}

interface EmailComposeDrawerProps {
  isOpen: boolean
  onClose: () => void
  lead: LuxorInquiry | null
  onSuccess?: () => void
  initialTemplateId?: string | null
  composeContextKey: string
  initialDraft: EmailComposeDraft | null
  onDraftChange: (draft: EmailComposeDraft) => void
}

export interface EmailComposeDraft {
  contextKey: string
  fromAddress: string
  toAddress: string
  subject: string
  track: boolean
  selectedTemplateId: string
  bodyText: string
  templateBlocks: EmailBlock[]
}

export function EmailComposeDrawer({ isOpen, onClose, lead, onSuccess, initialTemplateId, composeContextKey, initialDraft, onDraftChange }: EmailComposeDrawerProps) {
  const reduceMotion = useReducedMotion()
  const [isMinimized, setIsMinimized] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')
  const [canSplitCompose, setCanSplitCompose] = useState(false)
  const [trackingMenuOpen, setTrackingMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const [visualViewportMetrics, setVisualViewportMetrics] = useState<{ height: number; top: number } | null>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    const updateViewport = () => setVisualViewportMetrics({
      height: viewport?.height || window.innerHeight,
      top: viewport?.offsetTop || 0,
    })
    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      viewport?.removeEventListener('resize', updateViewport)
      viewport?.removeEventListener('scroll', updateViewport)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const updateSplitLayout = () => setCanSplitCompose(mediaQuery.matches)
    updateSplitLayout()
    mediaQuery.addEventListener('change', updateSplitLayout)
    return () => mediaQuery.removeEventListener('change', updateSplitLayout)
  }, [])

  useEffect(() => {
    if (isOpen) setIsClosing(false)
  }, [isOpen])

  const requestClose = () => setIsClosing(true)

  // Preview Scaling & Zoom States & Ref
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [iframeHeight, setIframeHeight] = useState(800)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  const fitPreviewToContainer = useCallback(() => {
    const width = containerRef.current?.clientWidth
    if (width) setZoomLevel(Math.min(1, Math.max(0.2, width / 600)))
  }, [])

  useEffect(() => {
    if (zoomMode !== 'fit' || !containerRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) fitPreviewToContainer()
      }
    })
    resizeObserver.observe(containerRef.current)
    const animationFrame = requestAnimationFrame(fitPreviewToContainer)
    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
    }
  }, [zoomMode, activeTab, isExpanded, canSplitCompose, fitPreviewToContainer])

  // Form Fields
  const [fromAddress, setFromAddress] = useState(initialDraft?.fromAddress || 'booking@luxoratlaspalmas.com')
  const [fromName, setFromName] = useState('Luxor Event Space')
  const [senderRole, setSenderRole] = useState('Venue Team')
  const [senderAvatarUrl, setSenderAvatarUrl] = useState<string | null>(null)
  const [senderPhone, setSenderPhone] = useState<string | null>(null)
  const [toAddress, setToAddress] = useState(initialDraft?.toAddress || lead?.email || '')
  const [subject, setSubject] = useState(initialDraft?.subject || '')
  // Direct CRM messages should feel like a note from a person, not a campaign.
  // Tracking remains available when intentionally needed, but is off by default.
  const [track, setTrack] = useState(initialDraft?.track ?? false)

  // Message Types & Templates
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialDraft?.selectedTemplateId || 'regular')
  const [customTemplates, setCustomTemplates] = useState<LuxorMarketingTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Composed Body
  const [bodyText, setBodyText] = useState(initialDraft?.bodyText || '')
  const [templateBlocks, setTemplateBlocks] = useState<EmailBlock[]>(initialDraft?.templateBlocks || [])

  // Delivery states
  const [isSending, setIsSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [simulationMsg, setSimulationMsg] = useState<string | null>(null)
  const sendInFlightRef = useRef(false)
  const sendAttemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null)
  const closeAfterSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (closeAfterSendTimerRef.current) clearTimeout(closeAfterSendTimerRef.current)
  }, [])

  // Brand Asset Picker for saved marketing-template image blocks.
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [activeBlockField, setActiveBlockField] = useState<string | null>(null)

  const triggerAssetPicker = (blockId: string, field: string) => {
    setActiveBlockId(blockId)
    setActiveBlockField(field)
    setAssetPickerOpen(true)
  }

  const handleAssetSelect = (url: string) => {
    if (activeBlockId && activeBlockField) {
      handleBlockFieldChange(activeBlockId, activeBlockField, url)
    }
    setAssetPickerOpen(false)
    setActiveBlockId(null)
    setActiveBlockField(null)
  }

  const [allInquiries, setAllInquiries] = useState<LuxorInquiry[]>([])
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [showDirectory, setShowDirectory] = useState(false)
  const [directorySearch, setDirectorySearch] = useState('')

  // Fetch inquiries for global client selection
  const fetchInquiries = async () => {
    try {
      const res = await fetch('/api/inquiries')
      if (res.ok) {
        const data = await res.json()
        setAllInquiries(data || [])
      }
    } catch (e) {
      console.error('Failed to load clients list:', e)
    }
  }

  useEffect(() => {
    if (isOpen) {
      void fetchInquiries()
      void fetch('/api/portal/user-preferences', { headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((profile) => {
          if (!profile) return
          if (typeof profile.display_name === 'string' && profile.display_name.trim()) setFromName(profile.display_name.trim())
          if (typeof profile.role_title === 'string' && profile.role_title.trim()) setSenderRole(profile.role_title.trim())
          setSenderAvatarUrl(typeof profile.avatar_url === 'string' && profile.avatar_url.trim() ? profile.avatar_url.trim() : null)
        })
        .catch((error) => console.warn('Failed to load email sender profile:', error))
      void fetch('/api/public/phone-number', { headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => setSenderPhone(typeof data?.phoneNumber === 'string' && data.phoneNumber.trim() ? data.phoneNumber.trim() : null))
        .catch((error) => console.warn('Failed to load selected Luxor phone number:', error))
    }
  }, [isOpen])

  // A closed composer unmounts, so PortalShell keeps this draft in memory and
  // supplies it on reopen. Reset only when the user changes compose target.
  const currentContextKeyRef = useRef(composeContextKey)
  useEffect(() => {
    if (currentContextKeyRef.current === composeContextKey) return
    currentContextKeyRef.current = composeContextKey
    if (lead) {
      setToAddress(lead.email || '')
    } else {
      setToAddress('')
    }
    setSubject('')
    setBodyText('')
    setSelectedTemplateId('regular')
    setTemplateBlocks([])
    setErrorMsg(null)
    setSuccessMsg(null)
    setSimulationMsg(null)
    setShowDirectory(false)
    setDirectorySearch('')
  }, [composeContextKey, lead])

  useEffect(() => {
    if (!isOpen) return
    onDraftChange({
      contextKey: composeContextKey,
      fromAddress,
      toAddress,
      subject,
      track,
      selectedTemplateId,
      bodyText,
      templateBlocks,
    })
  }, [isOpen, composeContextKey, fromAddress, toAddress, subject, track, selectedTemplateId, bodyText, templateBlocks, onDraftChange])

  // Fetch saved marketing templates
  useEffect(() => {
    if (isOpen) {
      void fetchTemplates()
    }
  }, [isOpen])

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true)
      const res = await fetch('/api/marketing/templates')
      if (res.ok) {
        const data = await res.json()
        setCustomTemplates(data.templates || [])
      }
    } catch (err) {
      console.error('Failed to load marketing templates', err)
    } finally {
      setLoadingTemplates(false)
    }
  };

  // Compile options list for selector
  const templateOptions = useMemo(() => {
    const options = [{ value: 'regular', label: 'Regular Email (Plain Text)' }]
    
    // Built-in starters
    EMAIL_TEMPLATES.forEach(tpl => {
      options.push({ value: `built-in:${tpl.id}`, label: `Starter: ${tpl.name}` })
    })

    // Custom saved ones
    customTemplates.forEach(tpl => {
      options.push({ value: `custom:${tpl.id}`, label: `Saved: ${tpl.name}` })
    })

    return options
  }, [customTemplates])

  // Handle template selection change
  const handleTemplateChange = useCallback((val: string) => {
    setSelectedTemplateId(val)
    setErrorMsg(null)

    if (val === 'regular') {
      setTemplateBlocks([])
      return
    }

    if (val.startsWith('built-in:')) {
      const templateId = val.split(':')[1]
      const found = EMAIL_TEMPLATES.find(t => t.id === templateId)
      if (found) {
        setSubject(found.name)
        // Deep clone blocks
        setTemplateBlocks(JSON.parse(JSON.stringify(found.blocks)))
      }
    } else if (val.startsWith('custom:')) {
      const templateId = val.split(':')[1]
      const found = customTemplates.find(t => t.id === templateId)
      if (found) {
        setSubject(found.name)
        setTemplateBlocks(JSON.parse(JSON.stringify(found.blocks)) as EmailBlock[])
      }
    }
  }, [customTemplates])

  useEffect(() => {
    if (!isOpen || !initialTemplateId) return
    if (initialTemplateId.startsWith('custom:') && !customTemplates.some((template) => `custom:${template.id}` === initialTemplateId)) return
    if (initialTemplateId.startsWith('built-in:') && !EMAIL_TEMPLATES.some((template) => `built-in:${template.id}` === initialTemplateId)) return
    handleTemplateChange(initialTemplateId)
  }, [isOpen, initialTemplateId, customTemplates, handleTemplateChange])

  // Update specific field in a template block
  const handleBlockFieldChange = (blockId: string, field: string, value: string) => {
    setTemplateBlocks(prev =>
      prev.map(block => (block.id === blockId ? { ...block, [field]: value } : block))
    )
  }

  // Compile current email blocks or text to responsive Luxor HTML
  const compiledHtml = useMemo(() => {
    if (selectedTemplateId === 'regular') {
      return buildConversationalEmailHtml({
        to: toAddress || 'client@example.com',
        subject: subject || 'Message from Luxor Event Space',
        body: '',
        bodyHtml: bodyText || '<p>Type your message...</p>',
        senderName: fromName,
        senderRole,
        senderEmail: fromAddress,
        senderPhone,
        senderImageUrl: senderAvatarUrl,
      })
    } else {
      // Use configured template blocks
      return renderEmailToHtml(subject || 'Marketing Email', templateBlocks)
    }
  }, [selectedTemplateId, bodyText, templateBlocks, subject, toAddress, fromName, senderRole, fromAddress, senderPhone, senderAvatarUrl])

  const updateIframeHeight = () => {
    if (iframeRef.current?.contentWindow?.document?.body) {
      const height = iframeRef.current.contentWindow.document.body.scrollHeight + 20
      setIframeHeight(height)
    }
  }

  const handleIframeLoad = () => {
    updateIframeHeight()
  }

  // Also update iframe height when compiledHtml changes or activeTab transitions
  useEffect(() => {
    const timer = setTimeout(updateIframeHeight, 150)
    return () => clearTimeout(timer)
  }, [compiledHtml, activeTab])

  const handleSend = async () => {
    if (sendInFlightRef.current) return
    if (!toAddress.trim()) {
      setErrorMsg('Please enter a recipient email address.')
      return
    }
    if (!subject.trim()) {
      setErrorMsg('Please enter a subject line.')
      return
    }
    if (selectedTemplateId === 'regular' && !bodyText.trim()) {
      setErrorMsg('Please enter email content.')
      return
    }

    try {
      sendInFlightRef.current = true
      setIsSending(true)
      setErrorMsg(null)
      setSuccessMsg(null)
      setSimulationMsg(null)

      const isConversational = selectedTemplateId === 'regular'
      const payload = {
        to: toAddress.trim(),
        from: fromAddress,
        fromName: fromName.trim(),
        subject: subject.trim(),
        content: isConversational ? bodyText : compiledHtml,
        format: isConversational ? 'conversational' : 'html',
        contentMode: isConversational ? 'rich' : undefined,
        track,
        campaignName: selectedTemplateId !== 'regular' ? `Direct Campaign: ${subject.trim()}` : undefined
      }
      const fingerprint = JSON.stringify(payload)
      if (!sendAttemptRef.current || sendAttemptRef.current.fingerprint !== fingerprint) {
        sendAttemptRef.current = {
          fingerprint,
          idempotencyKey: createManualEmailIdempotencyKey(),
        }
      }

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, idempotencyKey: sendAttemptRef.current.idempotencyKey }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email.')
      }
      if (data.simulated === true) {
        setSimulationMsg('No email was sent. This permanent test recipient uses a no-send simulation; your draft is still open.')
        return
      }
      if (data.success !== true) {
        throw new Error('The mail service did not confirm acceptance. Your draft is still open.')
      }

      publishLuxorEmailSent({
        leadId: lead?.id || null,
        recipient: toAddress.trim(),
        messageId: typeof data.messageId === 'string' ? data.messageId : null,
      })
      setSuccessMsg('The mail provider accepted this email. Delivery is not confirmed yet.')
      onSuccess?.()
      closeAfterSendTimerRef.current = setTimeout(() => {
        closeAfterSendTimerRef.current = null
        requestClose()
      }, 1800)

    } catch (err) {
      console.error(err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to deliver message.')
    } finally {
      sendInFlightRef.current = false
      setIsSending(false)
    }
  }

  // Portrait tablets use one focused workspace at a time. The split editor and
  // preview needs a desktop-width canvas to keep both surfaces useful.
  const showSplitPreview = isExpanded && canSplitCompose && activeTab === 'edit'

  // Class definitions based on minimized / expanded states
  const drawerClasses = `
    fixed inset-x-0 top-[var(--email-compose-top,0px)] h-[var(--email-compose-height,100dvh)] z-50 flex flex-col overflow-hidden bg-[color:var(--portal-card)] shadow-2xl
    pt-[env(safe-area-inset-top)] sm:pt-0 ${isMinimized ? '' : 'pb-[env(safe-area-inset-bottom)] sm:pb-0'}
    sm:inset-auto sm:right-4 sm:top-1/2 sm:h-[min(760px,calc(100dvh-2rem))] sm:w-[min(760px,calc(100vw-2rem))] sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-[color:var(--portal-border)]
    lg:right-6 lg:w-[min(820px,calc(100vw-3rem))]
    ${isMinimized ? 'sm:h-12' : ''}
    ${isExpanded ? 'sm:h-[calc(100dvh-2rem)] sm:w-[min(1100px,calc(100vw-2rem))]' : ''}
  `

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={isClosing ? { y: '100%', opacity: 0 } : { y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      onAnimationComplete={() => {
        if (isClosing) onClose()
      }}
      style={{
        '--email-compose-height': isMinimized ? 'calc(3.5rem + env(safe-area-inset-top))' : visualViewportMetrics ? `${visualViewportMetrics.height}px` : '100dvh',
        '--email-compose-top': visualViewportMetrics ? `${visualViewportMetrics.top}px` : '0px',
      } as React.CSSProperties}
      className={drawerClasses}
    >
      {/* Header Bar */}
      <div className={`relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 sm:px-4 ${isMinimized ? 'min-h-14 sm:min-h-12' : 'min-h-14'}`}>
        <div className="flex min-w-0 items-center gap-2">
          <PortalCloseButton onClick={requestClose} aria-label="Close composer" />
          {isMinimized && <button type="button" onClick={() => setIsMinimized(false)} aria-label="Restore composer" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]"><Maximize2 size={15} /></button>}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{isMinimized ? `Draft to ${lead?.full_name || toAddress || 'Client'}` : 'New Message'}</p>
          </div>
        </div>
        {!isMinimized && <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!isMinimized && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Restore composer size' : 'Expand composer'}
              title={isExpanded ? 'Restore size' : 'Expand'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"
            >
              <Maximize2 size={15} />
            </button>
          )}
          <button type="button" onClick={() => void handleSend()} disabled={isSending} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-white transition-colors hover:bg-[#d4b060] disabled:cursor-wait disabled:opacity-50">
            <Send size={14} /> {isSending ? 'Sending' : 'Send'}
          </button>
          <div className="relative">
            <button type="button" aria-label="More compose options" aria-expanded={moreMenuOpen} onClick={() => setMoreMenuOpen((open) => !open)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
              <MoreVertical size={16} />
            </button>
            {moreMenuOpen && <div role="menu" className="absolute right-0 top-full z-[70] mt-1 w-64 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 shadow-xl">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">Sender details</p>
              <p className="mt-2 text-xs font-semibold text-[color:var(--portal-text)]">{fromName}{senderRole ? ` · ${senderRole}` : ''}</p>
              <p className="mt-0.5 break-all text-[11px] text-[color:var(--portal-muted)]">{fromAddress}</p>
              {senderPhone ? <p className="mt-0.5 text-[11px] text-[color:var(--portal-muted)]">{senderPhone}</p> : null}
              <div className="my-2 border-t border-[color:var(--portal-border)]" />
              <button type="button" role="menuitem" onClick={() => { setIsMinimized(true); setMoreMenuOpen(false) }} className="min-h-10 w-full rounded-lg px-2 text-left text-xs text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">Minimize composer</button>
            </div>}
          </div>
        </div>}
      </div>

      {/* Main Drawer Body (Hidden if minimized) */}
      {!isMinimized && (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Main Edit Form */}
          <div className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3 sm:p-4 ${showSplitPreview || activeTab === 'edit' ? '' : 'hidden'}`}>
            {/* Senders and Recipients */}
            <div className="flex shrink-0 items-center gap-2.5 border-b border-[color:var(--portal-border)] pb-2">
              <span className="w-10 shrink-0 text-xs text-[color:var(--portal-muted)]">From:</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[color:var(--portal-text)]">{fromName}{senderRole ? ` · ${senderRole}` : ''}</p>
                <p className="truncate text-[11px] text-[color:var(--portal-muted)]">{fromAddress}</p>
              </div>
              <PortalSelect
                value={fromAddress}
                options={ALLOWED_SENDERS}
                onChange={setFromAddress}
                aria-label="Choose sender account"
                buttonClassName="min-h-10 max-w-36 normal-case tracking-normal sm:max-w-44"
              />
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[color:var(--portal-muted)]">To:</label>
                  {!lead && (
                    <button
                      type="button"
                      onClick={() => setShowDirectory(!showDirectory)}
                      className="min-h-9 px-2 text-[10px] font-semibold text-[#a8792f] hover:text-[#d4b060] transition-colors cursor-pointer dark:text-[#dfbd68]"
                    >
                      {showDirectory ? 'Hide Directory' : 'Browse Directory'}
                    </button>
                  )}
                </div>
                {lead ? (
                  <input
                    type="text"
                    readOnly
                    value={`${lead.full_name} <${lead.email || ''}>`}
                    className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-3 text-sm text-[color:var(--portal-text)] outline-none"
                  />
                ) : (
                  <div className="relative font-sans">
                    <input
                      type="text"
                      placeholder="Search or enter email..."
                      value={toAddress}
                      onFocus={() => setShowClientDropdown(true)}
                      onChange={(e) => {
                        setToAddress(e.target.value)
                        setShowClientDropdown(true)
                      }}
                      className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40 placeholder:text-[color:var(--portal-faint)]"
                    />
                    {showClientDropdown && toAddress.trim().length > 0 && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShowClientDropdown(false)}
                        />
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[color:var(--portal-border)] bg-[#fffdf9]/95 p-1.5 shadow-2xl backdrop-blur-2xl portal-scrollbar dark:bg-[#12110f]/95">
                          {allInquiries.filter(inq => 
                            inq.full_name.toLowerCase().includes(toAddress.toLowerCase()) ||
                            (inq.email && inq.email.toLowerCase().includes(toAddress.toLowerCase()))
                          ).slice(0, 5).map(inq => (
                            <button
                              key={inq.id}
                              type="button"
                              onClick={() => {
                                setToAddress(inq.email || '')
                                setShowClientDropdown(false)
                              }}
                              className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
                            >
                              <div>
                                <p className="font-bold text-[color:var(--portal-text)]">{inq.full_name}</p>
                                <p className="text-[10px] text-[color:var(--portal-faint)] font-mono mt-0.5">{inq.email || 'No email'}</p>
                              </div>
                              {inq.event_type && (
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-1.5 py-0.5 rounded">
                                  {inq.event_type}
                                </span>
                              )}
                            </button>
                          ))}
                          {allInquiries.filter(inq => 
                            inq.full_name.toLowerCase().includes(toAddress.toLowerCase()) ||
                            (inq.email && inq.email.toLowerCase().includes(toAddress.toLowerCase()))
                          ).length === 0 && (
                            <div className="py-3 text-center text-xs text-[color:var(--portal-faint)] italic">
                              No matching clients found.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Collapsible Contacts Directory */}
            {!lead && showDirectory && (
              <div className="border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 rounded-xl p-3 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-[#caa24c]">Contacts Directory</h4>
                    <p className="text-[8px] text-[color:var(--portal-muted)]">Search and click a contact to set the recipient.</p>
                  </div>
                  {toAddress && (
                    <button
                      type="button"
                      onClick={() => setToAddress('')}
                      className="text-[8px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
                    >
                      Clear Recipient
                    </button>
                  )}
                </div>

                {/* Directory Search */}
                <input
                  type="text"
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]"
                />

                {/* Directory Scroll List */}
                <div className="max-h-36 overflow-y-auto portal-scrollbar border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/35 rounded-lg p-1 divide-y divide-[color:var(--portal-border)]">
                  {allInquiries.filter(inq => {
                    const q = directorySearch.trim().toLowerCase()
                    if (!q) return true
                    return inq.full_name.toLowerCase().includes(q) || (inq.email && inq.email.toLowerCase().includes(q))
                  }).length === 0 ? (
                    <div className="text-center py-4 text-xs text-[color:var(--portal-muted)] italic">
                      No contacts found matching &quot;{directorySearch}&quot;
                    </div>
                  ) : (
                    allInquiries.filter(inq => {
                      const q = directorySearch.trim().toLowerCase()
                      if (!q) return true
                      return inq.full_name.toLowerCase().includes(q) || (inq.email && inq.email.toLowerCase().includes(q))
                    }).map((inq, idx) => {
                      const isSelected = toAddress.trim().toLowerCase() === (inq.email || '').trim().toLowerCase()
                      return (
                        <div
                          key={inq.id}
                          onClick={() => {
                            setToAddress(inq.email || '')
                            setShowClientDropdown(false)
                          }}
                          className="group flex items-center py-1.5 px-2 hover:bg-[color:var(--portal-soft)] rounded-lg cursor-pointer transition-colors select-none"
                        >
                          {/* Spotify-style hover index / checkmark */}
                          <div className="w-8 flex-shrink-0 flex items-center justify-center font-mono text-[9px] text-[color:var(--portal-muted)]">
                            {isSelected ? (
                              <CheckCircle size={12} className="text-[#caa24c] fill-[#caa24c]/10" />
                            ) : (
                              <>
                                <span className="group-hover:hidden">{idx + 1}</span>
                                <span className="hidden group-hover:inline">
                                  <Check size={10} className="text-[#caa24c] stroke-[2.5]" />
                                </span>
                              </>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0 ml-1">
                            <p className={`text-[11px] font-bold transition-colors leading-tight ${isSelected ? 'text-[#8c6529] dark:text-[#f1d27a]' : 'text-[color:var(--portal-text)] group-hover:text-[color:var(--portal-text)]'}`}>
                              {inq.full_name}
                            </p>
                            <p className="text-[9px] text-[color:var(--portal-muted)] font-mono mt-0.5 truncate">{inq.email || 'No email registered'}</p>
                          </div>

                          {/* Event Type Badge */}
                          {inq.event_type && (
                            <span className={`text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                              isSelected 
                                ? 'border-[#caa24c]/30 bg-[#caa24c]/10 text-[#8c6529] dark:text-[#f1d27a]'
                                : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)]'
                            }`}>
                              {inq.event_type}
                            </span>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {/* Subject */}
            <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--portal-border)] pb-2">
              <label htmlFor="compose-email-subject" className="w-10 shrink-0 text-xs text-[color:var(--portal-muted)]">Subject:</label>
              <input
                id="compose-email-subject"
                type="text"
                placeholder="Enter subject..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]"
              />
            </div>

            <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="hidden shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[color:var(--portal-muted)] sm:inline-flex"><Mail size={14} className="text-[#a8792f] dark:text-[#f1d27a]" /> Insert template</span>
                <PortalSelect
                  value={selectedTemplateId}
                  options={templateOptions}
                  onChange={handleTemplateChange}
                  aria-label="Insert email template"
                  buttonClassName="min-h-9 max-w-[min(52vw,15rem)] justify-between normal-case tracking-normal text-xs font-medium"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <div className="relative">
                  <button type="button" aria-expanded={trackingMenuOpen} onClick={() => setTrackingMenuOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
                    <Eye size={14} /> <span>Tracking</span><ChevronDown size={12} />
                  </button>
                  {trackingMenuOpen && <div role="menu" className="absolute right-0 top-full z-[70] mt-1 w-60 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 shadow-xl">
                    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-xs font-medium text-[color:var(--portal-text)]">
                      <input type="checkbox" checked={track} onChange={(event) => setTrack(event.target.checked)} className="h-4 w-4 accent-[#caa24c]" />
                      Track opens &amp; clicks
                    </label>
                    <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">When enabled, opens and clicks are recorded for this email.</p>
                  </div>}
                </div>
                <div className="relative">
                  <button type="button" aria-expanded={moreOptionsOpen} onClick={() => setMoreOptionsOpen((open) => !open)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
                    <MoreVertical size={14} /> <span className="hidden sm:inline">More</span>
                  </button>
                  {moreOptionsOpen && <div role="menu" className="absolute right-0 top-full z-[70] mt-1 w-56 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 shadow-xl">
                    {!lead && <button type="button" role="menuitem" onClick={() => { setShowDirectory(true); setMoreOptionsOpen(false) }} className="min-h-10 w-full rounded-lg px-2.5 text-left text-xs text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">Open contacts directory</button>}
                    <button type="button" role="menuitem" onClick={() => { setIsMinimized(true); setMoreOptionsOpen(false) }} className="min-h-10 w-full rounded-lg px-2.5 text-left text-xs text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">Minimize composer</button>
                  </div>}
                </div>
              </div>
            </div>

            {/* Editor Workspace */}
            <div className="flex min-h-0 flex-1 flex-col">
              {selectedTemplateId === 'regular' ? (
                <EmailRichTextEditor
                  value={bodyText}
                  onChange={setBodyText}
                  placeholder="Write your message…"
                  ariaLabel="Write your message"
                />
              ) : (
                // Marketing Template Field Editor
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 scrollbar-thin">
                  {templateBlocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-[color:var(--portal-faint)] border border-dashed border-[color:var(--portal-border)] rounded-xl">
                      <Sparkles size={24} className="text-[color:var(--portal-muted)] animate-pulse mb-2" />
                      <p className="text-xs font-semibold text-[color:var(--portal-muted)]">Template loaded. Edit values below.</p>
                    </div>
                  ) : (
                    templateBlocks.map((block) => {
                      if (block.type === 'hero') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 p-3.5 space-y-3">
                            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Hero Block</span>
                            </div>
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Headline"
                                value={block.headline}
                                onChange={(e) => handleBlockFieldChange(block.id, 'headline', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                              />
                              <textarea
                                placeholder="Subheadline"
                                rows={2}
                                value={block.subheadline}
                                onChange={(e) => handleBlockFieldChange(block.id, 'subheadline', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                              />
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  placeholder="Hero Background Image URL"
                                  value={block.backgroundImage || ''}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'backgroundImage', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40 font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => triggerAssetPicker(block.id, 'backgroundImage')}
                                  className="shrink-0 flex items-center justify-center h-8 px-2.5 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer text-[10px] font-black uppercase tracking-wider"
                                >
                                  Browse
                                </button>
                              </div>
                              {block.ctaVisible && (
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    placeholder="CTA Button Label"
                                    value={block.ctaLabel}
                                    onChange={(e) => handleBlockFieldChange(block.id, 'ctaLabel', e.target.value)}
                                    className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                                  />
                                  <input
                                    type="text"
                                    placeholder="CTA Button URL"
                                    value={block.ctaUrl}
                                    onChange={(e) => handleBlockFieldChange(block.id, 'ctaUrl', e.target.value)}
                                    className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-[color:var(--portal-muted)] outline-none focus:border-[#caa24c]/40 font-mono"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      }
                      if (block.type === 'text') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 p-3.5 space-y-2">
                            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Text block</span>
                            </div>
                            <textarea
                              rows={5}
                              placeholder="Rich paragraph content..."
                              value={block.content}
                              onChange={(e) => handleBlockFieldChange(block.id, 'content', e.target.value)}
                              className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] p-3 text-xs leading-relaxed text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                            />
                          </div>
                        )
                      }
                      if (block.type === 'button') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Button block</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Label"
                                value={block.label}
                                onChange={(e) => handleBlockFieldChange(block.id, 'label', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                              />
                              <input
                                type="text"
                                placeholder="URL"
                                value={block.url}
                                onChange={(e) => handleBlockFieldChange(block.id, 'url', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-[color:var(--portal-muted)] outline-none focus:border-[#caa24c]/40 font-mono"
                              />
                            </div>
                          </div>
                        )
                      }
                      if (block.type === 'image_text') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Image + Text block</span>
                            </div>
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Headline"
                                value={block.headline}
                                onChange={(e) => handleBlockFieldChange(block.id, 'headline', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                              />
                              <textarea
                                placeholder="Body copy"
                                rows={3}
                                value={block.body}
                                onChange={(e) => handleBlockFieldChange(block.id, 'body', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                              />
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  placeholder="Image URL"
                                  value={block.imageUrl || ''}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'imageUrl', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40 font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => triggerAssetPicker(block.id, 'imageUrl')}
                                  className="shrink-0 flex items-center justify-center h-8 px-2.5 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer text-[10px] font-black uppercase tracking-wider"
                                >
                                  Browse
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  placeholder="CTA Label"
                                  value={block.ctaLabel}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'ctaLabel', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                                />
                                <input
                                  type="text"
                                  placeholder="CTA Link URL"
                                  value={block.ctaUrl}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'ctaUrl', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-[color:var(--portal-muted)] outline-none focus:border-[#caa24c]/40 font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        )
                      }
                      if (block.type === 'two_column') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 p-3.5 space-y-3">
                            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Two-column layout</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Left Headline"
                                  value={block.leftHeadline}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'leftHeadline', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2 py-1 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                                />
                                <textarea
                                  placeholder="Left content..."
                                  rows={3}
                                  value={block.leftBody}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'leftBody', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] p-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                                />
                              </div>
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Right Headline"
                                  value={block.rightHeadline}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'rightHeadline', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2 py-1 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                                />
                                <textarea
                                  placeholder="Right content..."
                                  rows={3}
                                  value={block.rightBody}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'rightBody', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] p-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40"
                                />
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Side Live HTML Preview (Always visible in expanded mode, or toggled on in default size) */}
          <AnimatePresence initial={false}>
          {(showSplitPreview || activeTab === 'preview') && (
            <motion.div
              key={showSplitPreview ? 'expanded-preview' : 'drawer-preview'}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
              transition={{ duration: reduceMotion ? 0.08 : 0.24, ease: [0.23, 1, 0.32, 1] }}
              className={`flex min-h-0 flex-col ${showSplitPreview ? 'w-1/2 max-w-[560px] shrink-0 border-l border-[color:var(--portal-border)]' : 'flex-1'} min-w-0 bg-[color:var(--portal-card)] p-3 sm:p-4`}
            >
              <div className="mb-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <Eye size={12} className="text-[#caa24c]" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Live Brand Preview</span>
                </div>
                
                {/* Zoom Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {!showSplitPreview && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('edit')}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
                    >
                      <Pencil size={10} /> Edit
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-0.5 select-none">
                  <button
                    type="button"
                    onClick={() => {
                      setZoomMode('custom')
                      setZoomLevel(prev => Math.max(0.2, Number((prev - 0.1).toFixed(1))))
                    }}
                    className="cursor-pointer rounded p-0.5 text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)]"
                    title="Zoom Out"
                  >
                    <Minus size={11} />
                  </button>
                  <span className="min-w-[28px] text-center font-mono text-[9px] text-[color:var(--portal-muted)]">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setZoomMode('custom')
                      setZoomLevel(prev => Math.min(2.0, Number((prev + 0.1).toFixed(1))))
                    }}
                    className="cursor-pointer rounded p-0.5 text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)]"
                    title="Zoom In"
                  >
                    <Plus size={11} />
                  </button>
                  <span className="h-2.5 w-px bg-[color:var(--portal-border)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setZoomMode('fit')
                      fitPreviewToContainer()
                    }}
                    className={`px-1 py-0.5 text-[8px] font-black uppercase tracking-wider rounded transition-colors cursor-pointer ${
                      zoomMode === 'fit'
                        ? 'text-[#caa24c] bg-[#caa24c]/10'
                        : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                    }`}
                    title="Fit to Screen"
                  >
                    Auto Fit
                  </button>
                  </div>
                </div>
              </div>
              <div ref={containerRef} className="relative h-full w-full flex-1 overflow-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] portal-scrollbar">
                <div
                  style={{
                    width: `${600 * zoomLevel}px`,
                    height: `${iframeHeight * zoomLevel}px`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    title="luxor-email-preview"
                    srcDoc={stripTrackingPixels(compiledHtml).replace('</head>', '<style>body::-webkit-scrollbar { width: 6px; height: 6px; } body::-webkit-scrollbar-track { background: #000000; } body::-webkit-scrollbar-thumb { background: rgba(202, 162, 76, 0.4); border-radius: 3px; } body::-webkit-scrollbar-thumb:hover { background: rgba(202, 162, 76, 0.6); }</style></head>')}
                    sandbox="allow-same-origin"
                    onLoad={handleIframeLoad}
                    className="border-none absolute left-0 top-0 origin-top-left"
                    style={{
                      width: '600px',
                      height: `${iframeHeight}px`,
                      transform: `scale(${zoomLevel})`,
                      overflow: 'hidden',
                    }}
                    scrolling="no"
                  />
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      )}

      {!isMinimized && (
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            {errorMsg ? <p role="alert" className="truncate text-xs text-rose-600 dark:text-rose-300">{errorMsg}</p>
              : simulationMsg ? <p role="status" className="truncate text-xs text-amber-700 dark:text-amber-300">{simulationMsg}</p>
                : successMsg ? <p role="status" className="truncate text-xs text-emerald-700 dark:text-emerald-300">{successMsg}</p>
                  : null}
          </div>
          <button
            type="button"
            onClick={() => setActiveTab((tab) => tab === 'edit' ? 'preview' : 'edit')}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"
          >
            <Eye size={15} /> {activeTab === 'edit' ? 'Preview' : 'Back to editor'}
          </button>
        </div>
      )}
      <AnimatePresence>
        {assetPickerOpen && (
          <BrandAssetPicker
            isOpen={assetPickerOpen}
            onClose={() => setAssetPickerOpen(false)}
            onSelect={handleAssetSelect}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
