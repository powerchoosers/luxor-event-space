'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Mail,
  Send,
  X,
  Minimize2,
  Maximize2,
  AlertCircle,
  Eye,
  Pencil,
  Sparkles,
  ChevronUp,
  ExternalLink,
  Minus,
  Plus
} from 'lucide-react'
import { PortalSelect } from '@/components/portal/PortalUI'
import { LuxorInquiry, LuxorMarketingTemplate } from '@/lib/luxorInquiryTypes'
import { EMAIL_TEMPLATES, EmailBlock, EmailTemplate } from '@/app/(portal)/portal/marketing/emailTemplates'
import { renderEmailToHtml } from '@/app/(portal)/portal/marketing/EmailBuilder/emailRenderer'
import { BrandAssetPicker } from './BrandAssetPicker'

// Allowed Zoho email senders
const ALLOWED_SENDERS = [
  { value: 'booking@luxoratlaspalmas.com', label: 'booking@luxoratlaspalmas.com' },
  { value: 'hello@luxoratlaspalmas.com', label: 'hello@luxoratlaspalmas.com' }
]

const DEFAULT_FOOTER_BLOCK: EmailBlock = {
  id: 'footer-default',
  type: 'footer',
  companyName: 'Luxor Event Space',
  address: '803 Castroville Rd #402, San Antonio, TX 78237',
  phone: 'Private venue tours by appointment.',
  website: 'luxoratlaspalmas.com',
  unsubscribeUrl: '#unsubscribe',
  showSocial: true,
  instagramUrl: 'https://www.instagram.com/luxoratlaspalmas?utm_source=qr',
  facebookUrl: 'https://www.facebook.com/share/1DD3mKM8XJ/?mibextid=wwXIfr',
  tiktokUrl: 'https://www.tiktok.com/@luxoratlaspalmas?_r=1&_t=ZT-97vnzmYjFUM',
}

interface EmailComposeDrawerProps {
  isOpen: boolean
  onClose: () => void
  lead: LuxorInquiry | null
  onSuccess?: () => void
}

export function EmailComposeDrawer({ isOpen, onClose, lead, onSuccess }: EmailComposeDrawerProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')

  // Preview Scaling & Zoom States & Ref
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [iframeHeight, setIframeHeight] = useState(800)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (zoomMode !== 'fit' || !containerRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width > 0) {
          const scale = Math.min(1, width / 600)
          setZoomLevel(scale)
        }
      }
    })
    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [zoomMode, activeTab, isExpanded])

  // Form Fields
  const [fromAddress, setFromAddress] = useState('booking@luxoratlaspalmas.com')
  const [fromName, setFromName] = useState('Luxor Event Space')
  const [toAddress, setToAddress] = useState('')
  const [subject, setSubject] = useState('')
  const [track, setTrack] = useState(true)

  // Message Types & Templates
  const [selectedTemplateId, setSelectedTemplateId] = useState('regular')
  const [customTemplates, setCustomTemplates] = useState<LuxorMarketingTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Composed Body
  const [bodyText, setBodyText] = useState('')
  const [templateBlocks, setTemplateBlocks] = useState<EmailBlock[]>([])

  // Delivery states
  const [isSending, setIsSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Brand Asset Picker States & Helpers
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
    }
  }, [isOpen])

  // Auto-fill To Address when lead changes
  useEffect(() => {
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
  }, [lead, isOpen])

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
  const handleTemplateChange = (val: string) => {
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
  }

  // Update specific field in a template block
  const handleBlockFieldChange = (blockId: string, field: string, value: string) => {
    setTemplateBlocks(prev =>
      prev.map(block => (block.id === blockId ? { ...block, [field]: value } : block))
    )
  }

  // Compile current email blocks or text to responsive Luxor HTML
  const compiledHtml = useMemo(() => {
    if (selectedTemplateId === 'regular') {
      // Wrap regular text in simple brand layout
      const blocks: EmailBlock[] = [
        {
          id: 'text-regular',
          type: 'text',
          content: bodyText || 'Type your message...',
          fontSize: 15,
          textAlign: 'left',
          color: 'rgba(215,194,154,0.78)',
        },
        DEFAULT_FOOTER_BLOCK
      ]
      return renderEmailToHtml(subject || 'Direct Message', blocks)
    } else {
      // Use configured template blocks
      return renderEmailToHtml(subject || 'Marketing Email', templateBlocks)
    }
  }, [selectedTemplateId, bodyText, templateBlocks, subject])

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
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
      setIsSending(true)
      setErrorMsg(null)

      const payload = {
        to: toAddress.trim(),
        from: fromAddress,
        fromName: fromName.trim(),
        subject: subject.trim(),
        content: compiledHtml,
        track,
        campaignName: selectedTemplateId !== 'regular' ? `Direct Campaign: ${subject.trim()}` : undefined
      }

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email.')
      }

      setSuccessMsg('Email successfully sent!')
      
      // Auto-close after brief delay
      setTimeout(() => {
        onClose()
        if (onSuccess) onSuccess()
      }, 1500)

    } catch (err) {
      console.error(err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to deliver message.')
    } finally {
      setIsSending(false)
    }
  }

  // Class definitions based on minimized / expanded states
  const drawerClasses = `
    fixed right-6 bottom-0 z-50
    flex flex-col
    bg-[color:var(--portal-card)] border border-[#caa24c]/30 rounded-t-2xl shadow-2xl backdrop-blur-xl
    transition-all duration-300 ease-in-out
    ${isMinimized ? 'h-12 w-[380px]' : isExpanded ? 'h-[85vh] w-[960px]' : 'h-[600px] w-[540px]'}
  `

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className={drawerClasses}
    >
      {/* Header Bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#caa24c]/20 bg-black/40 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Mail size={14} className="text-[#caa24c]" />
          <span className="truncate text-xs font-black uppercase tracking-wider text-white">
            {isMinimized ? `Draft to ${lead?.full_name || toAddress || 'Client'}` : 'New Message'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Minimize / Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Restore Compose Drawer' : 'Minimize'}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            {isMinimized ? <ChevronUp size={13} /> : <Minimize2 size={13} />}
          </button>
          
          {!isMinimized && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Exit Full Screen' : 'Full Screen'}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            >
              <Maximize2 size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Close Drawer"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Main Drawer Body (Hidden if minimized) */}
      {!isMinimized && (
        <div className="flex flex-1 min-h-0">
          {/* Main Edit Form */}
          <div className={`flex flex-col flex-1 min-w-0 p-4 space-y-3 ${isExpanded && activeTab === 'preview' ? 'hidden md:flex' : ''}`}>
            {/* Senders and Recipients */}
            <div className="grid grid-cols-2 gap-3 shrink-0">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">From Name</label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-1.5 text-xs text-white outline-none focus:border-[#caa24c]/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">From Address</label>
                <PortalSelect
                  value={fromAddress}
                  options={ALLOWED_SENDERS}
                  onChange={setFromAddress}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 shrink-0">
              <div className="space-y-1 relative">
                <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">To (Client)</label>
                {lead ? (
                  <input
                    type="text"
                    readOnly
                    value={`${lead.full_name} <${lead.email || ''}>`}
                    className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-3 py-1.5 text-xs text-zinc-400 outline-none"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search or enter email..."
                      value={toAddress}
                      onFocus={() => setShowClientDropdown(true)}
                      onChange={(e) => {
                        setToAddress(e.target.value)
                        setShowClientDropdown(true)
                      }}
                      className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-1.5 text-xs font-mono text-white outline-none focus:border-[#caa24c]/40"
                    />
                    {showClientDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShowClientDropdown(false)}
                        />
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1 shadow-xl portal-scrollbar">
                          {allInquiries.filter(inq => 
                            inq.full_name.toLowerCase().includes(toAddress.toLowerCase()) ||
                            (inq.email && inq.email.toLowerCase().includes(toAddress.toLowerCase()))
                          ).slice(0, 10).map(inq => (
                            <button
                              key={inq.id}
                              type="button"
                              onClick={() => {
                                setToAddress(inq.email || '')
                                setShowClientDropdown(false)
                              }}
                              className="w-full rounded-md px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-[#caa24c]/10 hover:text-white transition-colors cursor-pointer"
                            >
                              <div className="font-bold">{inq.full_name}</div>
                              <div className="text-[10px] text-zinc-500 font-mono">{inq.email || 'No email'}</div>
                            </button>
                          ))}
                          {allInquiries.filter(inq => 
                            inq.full_name.toLowerCase().includes(toAddress.toLowerCase()) ||
                            (inq.email && inq.email.toLowerCase().includes(toAddress.toLowerCase()))
                          ).length === 0 && (
                            <div className="py-2 text-center text-xs text-zinc-650 italic">
                              No matching clients found. Type to enter email manually.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Template Type</label>
                <PortalSelect
                  value={selectedTemplateId}
                  options={templateOptions}
                  onChange={handleTemplateChange}
                />
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-1 shrink-0">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Subject</label>
              <input
                type="text"
                placeholder="Enter email subject line..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40 placeholder:text-zinc-600"
              />
            </div>

            {/* Editor Workspace */}
            <div className="flex-1 min-h-0 flex flex-col space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Message Content</label>
                {/* Visual tabs on standard sizing */}
                {!isExpanded && (
                  <div className="flex rounded-lg border border-[color:var(--portal-border)] bg-black/20 p-0.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('edit')}
                      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors ${
                        activeTab === 'edit' ? 'bg-[#caa24c]/20 text-[#f1d27a]' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      <Pencil size={10} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider transition-colors ${
                        activeTab === 'preview' ? 'bg-[#caa24c]/20 text-[#f1d27a]' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      <Eye size={10} /> Preview
                    </button>
                  </div>
                )}
              </div>

              {selectedTemplateId === 'regular' ? (
                // Regular Plain-text Editor
                <div className="flex-1 min-h-0">
                  <textarea
                    placeholder="Write your email content here. It will be wrapped automatically in the premium Luxor brand layout..."
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    className="h-full w-full resize-none rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs leading-relaxed text-zinc-300 outline-none focus:border-[#caa24c]/40"
                  />
                </div>
              ) : (
                // Marketing Template Field Editor
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 scrollbar-thin">
                  {templateBlocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-650 border border-dashed border-[color:var(--portal-border)] rounded-xl">
                      <Sparkles size={24} className="text-zinc-700 animate-pulse mb-2" />
                      <p className="text-xs font-semibold text-zinc-550">Template loaded. Edit values below.</p>
                    </div>
                  ) : (
                    templateBlocks.map((block) => {
                      if (block.type === 'hero') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-black/25 p-3.5 space-y-3">
                            <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Hero Block</span>
                            </div>
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Headline"
                                value={block.headline}
                                onChange={(e) => handleBlockFieldChange(block.id, 'headline', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-white outline-none focus:border-[#caa24c]/40"
                              />
                              <textarea
                                placeholder="Subheadline"
                                rows={2}
                                value={block.subheadline}
                                onChange={(e) => handleBlockFieldChange(block.id, 'subheadline', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-[#caa24c]/40"
                              />
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  placeholder="Hero Background Image URL"
                                  value={block.backgroundImage || ''}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'backgroundImage', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-[#caa24c]/40 font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => triggerAssetPicker(block.id, 'backgroundImage')}
                                  className="shrink-0 flex items-center justify-center h-8 px-2.5 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-zinc-400 hover:text-white transition-colors cursor-pointer text-[10px] font-black uppercase tracking-wider"
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
                                    className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-white outline-none focus:border-[#caa24c]/40"
                                  />
                                  <input
                                    type="text"
                                    placeholder="CTA Button URL"
                                    value={block.ctaUrl}
                                    onChange={(e) => handleBlockFieldChange(block.id, 'ctaUrl', e.target.value)}
                                    className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-zinc-400 outline-none focus:border-[#caa24c]/40 font-mono"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      }
                      if (block.type === 'text') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-black/25 p-3.5 space-y-2">
                            <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Text block</span>
                            </div>
                            <textarea
                              rows={5}
                              placeholder="Rich paragraph content..."
                              value={block.content}
                              onChange={(e) => handleBlockFieldChange(block.id, 'content', e.target.value)}
                              className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] p-3 text-xs leading-relaxed text-zinc-300 outline-none focus:border-[#caa24c]/40"
                            />
                          </div>
                        )
                      }
                      if (block.type === 'button') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-black/25 p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Button block</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Label"
                                value={block.label}
                                onChange={(e) => handleBlockFieldChange(block.id, 'label', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-white outline-none focus:border-[#caa24c]/40"
                              />
                              <input
                                type="text"
                                placeholder="URL"
                                value={block.url}
                                onChange={(e) => handleBlockFieldChange(block.id, 'url', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-zinc-400 outline-none focus:border-[#caa24c]/40 font-mono"
                              />
                            </div>
                          </div>
                        )
                      }
                      if (block.type === 'image_text') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-black/25 p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Image + Text block</span>
                            </div>
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Headline"
                                value={block.headline}
                                onChange={(e) => handleBlockFieldChange(block.id, 'headline', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-white outline-none focus:border-[#caa24c]/40"
                              />
                              <textarea
                                placeholder="Body copy"
                                rows={3}
                                value={block.body}
                                onChange={(e) => handleBlockFieldChange(block.id, 'body', e.target.value)}
                                className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-[#caa24c]/40"
                              />
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  placeholder="Image URL"
                                  value={block.imageUrl || ''}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'imageUrl', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-[#caa24c]/40 font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => triggerAssetPicker(block.id, 'imageUrl')}
                                  className="shrink-0 flex items-center justify-center h-8 px-2.5 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-zinc-400 hover:text-white transition-colors cursor-pointer text-[10px] font-black uppercase tracking-wider"
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
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-white outline-none focus:border-[#caa24c]/40"
                                />
                                <input
                                  type="text"
                                  placeholder="CTA Link URL"
                                  value={block.ctaUrl}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'ctaUrl', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2.5 py-1 text-xs text-zinc-400 outline-none focus:border-[#caa24c]/40 font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        )
                      }
                      if (block.type === 'two_column') {
                        return (
                          <div key={block.id} className="rounded-xl border border-[color:var(--portal-border)] bg-black/25 p-3.5 space-y-3">
                            <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c]">Two-column layout</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Left Headline"
                                  value={block.leftHeadline}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'leftHeadline', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2 py-1 text-xs text-white outline-none focus:border-[#caa24c]/40"
                                />
                                <textarea
                                  placeholder="Left content..."
                                  rows={3}
                                  value={block.leftBody}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'leftBody', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] p-2 text-xs text-zinc-300 outline-none focus:border-[#caa24c]/40"
                                />
                              </div>
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Right Headline"
                                  value={block.rightHeadline}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'rightHeadline', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2 py-1 text-xs text-white outline-none focus:border-[#caa24c]/40"
                                />
                                <textarea
                                  placeholder="Right content..."
                                  rows={3}
                                  value={block.rightBody}
                                  onChange={(e) => handleBlockFieldChange(block.id, 'rightBody', e.target.value)}
                                  className="w-full rounded bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] p-2 text-xs text-zinc-300 outline-none focus:border-[#caa24c]/40"
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
          {(isExpanded || activeTab === 'preview') && (
            <div className={`flex flex-col ${isExpanded ? 'w-[440px] border-l border-[#caa24c]/20' : 'flex-1'} min-w-0 bg-zinc-950 p-4`}>
              <div className="mb-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <Eye size={12} className="text-[#caa24c]" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Live Brand Preview</span>
                </div>
                
                {/* Zoom Controls */}
                <div className="flex items-center gap-1.5 shrink-0 bg-zinc-900/60 border border-zinc-800/80 rounded-lg px-2 py-0.5 select-none">
                  <button
                    type="button"
                    onClick={() => {
                      setZoomMode('custom')
                      setZoomLevel(prev => Math.max(0.2, Number((prev - 0.1).toFixed(1))))
                    }}
                    className="p-0.5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    title="Zoom Out"
                  >
                    <Minus size={11} />
                  </button>
                  <span className="text-[9px] font-mono text-zinc-400 min-w-[28px] text-center">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setZoomMode('custom')
                      setZoomLevel(prev => Math.min(2.0, Number((prev + 0.1).toFixed(1))))
                    }}
                    className="p-0.5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    <Plus size={11} />
                  </button>
                  <span className="h-2.5 w-px bg-zinc-800" />
                  <button
                    type="button"
                    onClick={() => {
                      setZoomMode('fit')
                    }}
                    className={`px-1 py-0.5 text-[8px] font-black uppercase tracking-wider rounded transition-colors cursor-pointer ${
                      zoomMode === 'fit'
                        ? 'text-[#caa24c] bg-[#caa24c]/10'
                        : 'text-zinc-500 hover:text-white'
                    }`}
                    title="Fit to Screen"
                  >
                    Auto Fit
                  </button>
                </div>
              </div>
              <div ref={containerRef} className="flex-1 rounded-xl border border-zinc-900 bg-black overflow-auto portal-scrollbar relative w-full h-full">
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
                    srcDoc={compiledHtml.replace('</head>', '<style>body::-webkit-scrollbar { width: 6px; height: 6px; } body::-webkit-scrollbar-track { background: #000000; } body::-webkit-scrollbar-thumb { background: rgba(202, 162, 76, 0.4); border-radius: 3px; } body::-webkit-scrollbar-thumb:hover { background: rgba(202, 162, 76, 0.6); }</style></head>')}
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
            </div>
          )}
        </div>
      )}

      {/* Action Footer (Hidden if minimized) */}
      {!isMinimized && (
        <div className="flex items-center justify-between border-t border-[#caa24c]/20 bg-black/20 p-4 shrink-0">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={track}
                onChange={(e) => setTrack(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[#caa24c]/30 bg-[color:var(--portal-soft)] accent-[#caa24c] outline-none"
              />
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white transition-colors">
                Track Opens & Clicks
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            {errorMsg && (
              <div className="flex items-center gap-1 text-red-400 text-[10px] font-semibold bg-red-950/20 border border-red-900/35 rounded px-2.5 py-1 max-w-[240px] truncate">
                <AlertCircle size={11} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="flex items-center gap-1 text-emerald-400 text-[10px] font-semibold bg-emerald-950/20 border border-emerald-900/35 rounded px-2.5 py-1">
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="button"
              disabled={isSending}
              onClick={handleSend}
              className="inline-flex items-center gap-2 rounded-lg bg-[#b98a3e] px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-[#a8792f] disabled:opacity-40 cursor-pointer"
            >
              {isSending ? (
                <>Delivering...</>
              ) : (
                <>
                  <Send size={11} /> Send Email
                </>
              )}
            </button>
          </div>
        </div>
      )}
      <BrandAssetPicker
        isOpen={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onSelect={handleAssetSelect}
      />
    </motion.div>
  )
}
