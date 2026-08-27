'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Send, Loader2, CheckCircle, AlertCircle, Copy, Download, CalendarClock, Check, Link2 } from 'lucide-react'
import type { EmailBlock, LuxorEmailTheme } from '../emailTemplates'
import { renderThemedEmailToHtml } from './emailRenderer'
import { PortalDatePicker, PortalSelect, PortalModal, PortalAnimatedTabs, PortalTabTransition, PortalCloseButton } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { decodeHtmlEntities, stripTrackingPixels } from '@/lib/luxorTextUtils'
import { LUXOR_TIME_DROPDOWN_OPTIONS } from '@/lib/luxorTimeOptions'

interface EmailPreviewProps {
  isOpen: boolean
  blocks: EmailBlock[]
  subject: string
  preheader?: string
  theme?: LuxorEmailTheme
  initialAudienceLabel?: string
  initialSelectedEmails?: string[]
  onAudienceLabelChange?: (value: string) => void
  onSelectedEmailsChange?: (emails: string[]) => void
  onBlocksChange?: (blocks: EmailBlock[]) => void
  onClose: () => void
}

type SendStatus = 'idle' | 'sending' | 'success' | 'error'
type EditableEmailLink = { blockId: string; field: 'ctaUrl' | 'url'; label: string; url: string }

type MarketingList = {
  id: string
  name: string
  description: string | null
  isBuiltIn: boolean
  memberCount: number
  members: { email: string; full_name: string | null }[]
}

export function EmailPreview({ isOpen, blocks, subject, preheader = '', theme, initialAudienceLabel = 'Manual list', initialSelectedEmails = [], onAudienceLabelChange, onSelectedEmailsChange, onBlocksChange, onClose }: EmailPreviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'html' | 'send'>('preview')
  const [selectedEmails, setSelectedEmails] = useState<string[]>(initialSelectedEmails)
  const [typedInput, setTypedInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [allContacts, setAllContacts] = useState<LuxorInquiry[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [sendSubject, setSendSubject] = useState(subject)
  const [campaignName, setCampaignName] = useState(subject)
  const [audienceLabel, setAudienceLabel] = useState(initialAudienceLabel)
  const [selectedMarketingListId, setSelectedMarketingListId] = useState<string | null>(null)
  const [marketingLists, setMarketingLists] = useState<MarketingList[]>([])
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle')
  const [sendMessage, setSendMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const html = stripTrackingPixels(renderThemedEmailToHtml(subject, blocks, theme, preheader))
  const scheduledFor = scheduledDate && scheduledTime ? `${scheduledDate}T${scheduledTime}:00` : ''
  const isScheduled = Boolean(scheduledFor)
  const editableLinks = blocks.reduce<EditableEmailLink[]>((links, block) => {
    if (block.type === 'hero' && block.ctaVisible) links.push({ blockId: block.id, field: 'ctaUrl', label: block.ctaLabel || 'Hero button', url: block.ctaUrl })
    if (block.type === 'image_text') links.push({ blockId: block.id, field: 'ctaUrl', label: block.ctaLabel || 'Section button', url: block.ctaUrl })
    if (block.type === 'button') links.push({ blockId: block.id, field: 'url', label: block.label || 'Button', url: block.url })
    return links
  }, [])

  const updateLink = (blockId: string, field: 'ctaUrl' | 'url', value: string) => {
    onBlocksChange?.(blocks.map((block) => block.id === blockId ? { ...block, [field]: value } as EmailBlock : block))
  }

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wasOpenRef = useRef(false)
  const [iframeHeight, setIframeHeight] = useState(800)
  const [iframeLoading, setIframeLoading] = useState(true)

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setAudienceLabel(initialAudienceLabel)
      setSelectedMarketingListId(null)
      setSelectedEmails(initialSelectedEmails)
    }
    wasOpenRef.current = isOpen
  }, [initialAudienceLabel, initialSelectedEmails, isOpen])

  const updateIframeHeight = () => {
    if (iframeRef.current?.contentWindow?.document?.body) {
      const height = iframeRef.current.contentWindow.document.body.scrollHeight + 50
      setIframeHeight(height)
    }
  }

  useEffect(() => {
    const timer = setTimeout(updateIframeHeight, 150)
    return () => clearTimeout(timer)
  }, [html, activeTab])

  // Load contacts
  useEffect(() => {
    if (!isOpen) return
    const timer = window.setTimeout(() => {
      setContactsLoading(true)
      fetch('/api/inquiries')
        .then((res) => res.json())
        .then((data) => {
          setAllContacts(data || [])
        })
        .catch((err) => console.error(err))
        .finally(() => setContactsLoading(false))

      fetch('/api/marketing/lists', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setMarketingLists(Array.isArray(data.lists) ? data.lists : []))
        .catch((err) => console.error(err))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !marketingLists.length) return
    const matchingList = marketingLists.find((list) => list.name.toLowerCase() === initialAudienceLabel.toLowerCase())
    if (matchingList) {
      const timer = window.setTimeout(() => {
        setAudienceLabel(matchingList.name)
        setSelectedMarketingListId(matchingList.id)
        setSelectedEmails(matchingList.members.map((member) => member.email))
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [initialAudienceLabel, isOpen, marketingLists])

  useEffect(() => {
    onSelectedEmailsChange?.(selectedEmails)
  }, [onSelectedEmailsChange, selectedEmails])

  const handleAudienceChange = (value: string) => {
    if (value === '__create_new__') {
      setAudienceLabel(value)
      setSelectedMarketingListId(null)
      return
    }
    if (value === '__manual__') {
      setAudienceLabel('Manual list')
      setSelectedMarketingListId(null)
      onAudienceLabelChange?.('Manual list')
      return
    }
    const list = marketingLists.find((item) => item.id === value)
    if (!list) return
    setAudienceLabel(list.name)
    setSelectedMarketingListId(list.id)
    onAudienceLabelChange?.(list.name)
    setSelectedEmails(list.members.map((member) => member.email))
  }

  const switchToManualAudience = () => {
    if (!selectedMarketingListId) return
    setSelectedMarketingListId(null)
    setAudienceLabel('Manual list')
    onAudienceLabelChange?.('Manual list')
  }

  const handleCreateList = async () => {
    const name = newListName.trim()
    if (!name || !selectedEmails.length) {
      setSendStatus('error')
      setSendMessage('Select at least one recipient and enter a name for the new list.')
      return
    }
    setCreatingList(true)
    try {
      const response = await fetch('/api/marketing/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listName: name,
          recipients: selectedEmails.map((email) => {
            const contact = allContacts.find((item) => item.email?.trim().toLowerCase() === email.trim().toLowerCase())
            return {
              email,
              name: contact?.full_name || null,
              source: contact?.source || 'Manual',
              metadata: contact ? { phone: contact.phone, event_type: contact.event_type } : {},
            }
          }),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create marketing list.')
      const newList = data.list as MarketingList | null
      if (!newList?.id) throw new Error('The list was saved but could not be reloaded.')
      setMarketingLists((current) => [...current.filter((list) => list.name !== name), newList])
      setAudienceLabel(name)
      setSelectedMarketingListId(newList.id)
      onAudienceLabelChange?.(name)
      setNewListName('')
      setSendStatus('idle')
      setSendMessage('')
    } catch (error) {
      setSendStatus('error')
      setSendMessage(error instanceof Error ? error.message : 'Unable to create marketing list.')
    } finally {
      setCreatingList(false)
    }
  }

  // Filter contacts based on search query
  const filteredContacts = allContacts.filter((c) => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    return (
      c.full_name.toLowerCase().includes(query) ||
      (c.email && c.email.toLowerCase().includes(query))
    )
  })

  // Filter suggestions based on typed input
  const filteredSuggestions = allContacts.filter((c) => {
    const typed = typedInput.trim().toLowerCase()
    if (!typed) return false
    // Don't show already selected emails in suggestions
    if (c.email && selectedEmails.includes(c.email)) return false
    return (
      c.full_name.toLowerCase().includes(typed) ||
      (c.email && c.email.toLowerCase().includes(typed))
    )
  }).slice(0, 5)

  // Add a specific contact
  const handleAddContact = (contact: LuxorInquiry) => {
    switchToManualAudience()
    if (contact.email) {
      const email = contact.email.trim()
      if (!selectedEmails.includes(email)) {
        setSelectedEmails(prev => [...prev, email])
      }
    }
    setTypedInput('')
  }

  // Remove email tag
  const handleRemoveEmail = (email: string) => {
    switchToManualAudience()
    setSelectedEmails(prev => prev.filter(e => e !== email))
  }

  // Toggle selection from directory
  const handleToggleEmail = (email: string) => {
    if (!email) return
    switchToManualAudience()
    setSelectedEmails(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    )
  }

  // Handle typing input keys (Enter / Comma to add custom email tag)
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = typedInput.trim()
      if (val) {
        switchToManualAudience()
        if (val.includes('@') && !selectedEmails.includes(val)) {
          setSelectedEmails(prev => [...prev, val])
        }
      }
      setTypedInput('')
    }
  }

  // Bulk actions
  const handleSelectAll = () => {
    switchToManualAudience()
    const filteredEmails = filteredContacts
      .map((c) => c.email)
      .filter((e): e is string => !!e)
    setSelectedEmails((prev) => {
      const next = [...prev]
      filteredEmails.forEach((email) => {
        if (!next.includes(email)) next.push(email)
      })
      return next
    })
  }

  const handleClearAll = () => {
    switchToManualAudience()
    if (!searchQuery.trim()) {
      setSelectedEmails([])
    } else {
      const filteredEmails = filteredContacts.map((c) => c.email).filter(Boolean)
      setSelectedEmails(prev => prev.filter(e => !filteredEmails.includes(e)))
    }
  }

  async function handleSend() {
    const emails = selectedEmails

    if (audienceLabel === '__create_new__') {
      setSendMessage('Create the new marketing list before sending this campaign.')
      setSendStatus('error')
      return
    }
    if (!emails.length) {
      setSendMessage('Please enter at least one recipient email address.')
      setSendStatus('error')
      return
    }
    if (!sendSubject.trim()) {
      setSendMessage('Please enter a subject line.')
      setSendStatus('error')
      return
    }

    setSendStatus('sending')
    setSendMessage('')

    try {
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName || sendSubject,
          subject: sendSubject,
          htmlBody: html,
          recipientsText: emails.join(','),
          audienceLabel,
          marketingListId: selectedMarketingListId,
          scheduledFor: isScheduled ? new Date(scheduledFor).toISOString() : null,
          sendNow: !isScheduled,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create campaign.')
      }

      setSendStatus('success')
      setSendMessage(
        isScheduled
          ? `Campaign scheduled for ${new Date(scheduledFor).toLocaleString()} with ${emails.length} recipient${emails.length !== 1 ? 's' : ''}.`
          : `Send started for ${emails.length} recipient${emails.length !== 1 ? 's' : ''}. Refresh the overview to see sent, failed, open, and click results.`,
      )
    } catch (error) {
      setSendStatus('error')
      setSendMessage(error instanceof Error ? error.message : 'Failed to create campaign.')
    }
  }

  function handleCopyHtml() {
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleDownload() {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sendSubject || 'email'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabs = [
    { id: 'preview' as const, label: 'Preview' },
    { id: 'html' as const, label: 'HTML Source' },
    { id: 'send' as const, label: 'Send' },
  ]

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-4xl">
      <div className="h-[80vh] flex flex-col bg-[color:var(--portal-bg)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Email Preview</p>
              <h3 className="text-sm font-bold text-white/90 mt-0.5 truncate max-w-xs">{decodeHtmlEntities(subject) || 'Untitled Email'}</h3>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
            <PortalAnimatedTabs
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={(tab) => {
                if (tab === 'preview') setIframeLoading(true)
                setActiveTab(tab)
              }}
              buttonClassName="px-3"
            />
          </div>

          <PortalCloseButton onClick={onClose} aria-label="Close preview" />
        </div>

        {/* Content */}
        <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 overflow-hidden flex flex-col">
          
          {/* Preview tab */}
          {activeTab === 'preview' && (
            <div className="h-full flex flex-col">
              {/* Email client simulation bar */}
              <div className="flex items-center gap-4 px-6 py-3 border-b border-zinc-800/50 bg-zinc-900/30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500" />
                  <span className="h-3 w-3 rounded-full bg-amber-400" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 bg-zinc-800 rounded px-3 py-1 text-[10px] text-zinc-550 font-mono">
                  {decodeHtmlEntities(subject) || 'Untitled Email'}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCopyHtml} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 transition-all cursor-pointer">
                    <Copy size={11} />
                    {copied ? 'Copied!' : 'Copy HTML'}
                  </button>
                  <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 transition-all cursor-pointer">
                    <Download size={11} />
                    Download
                  </button>
                </div>
              </div>
              {/* iframe preview container with custom scrollbar */}
              <div className="flex-1 bg-zinc-950 overflow-y-auto portal-scrollbar p-6 flex justify-center relative">
                {iframeLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm z-10 transition-opacity duration-300">
                    <Loader2 className="animate-spin text-[#caa24c] mb-3" size={28} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-550">Generating Preview...</p>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  srcDoc={html}
                  title="Email Preview"
                  className={`w-[640px] border-0 bg-[#050505] shadow-2xl rounded-xl transition-all duration-300 ${
                    iframeLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
                  }`}
                  style={{ height: `${iframeHeight}px`, overflow: 'hidden' }}
                  scrolling="no"
                  sandbox="allow-same-origin"
                  onLoad={() => {
                    updateIframeHeight()
                    setTimeout(() => setIframeLoading(false), 200)
                  }}
                />
              </div>
            </div>
          )}

          {/* HTML Source tab */}
          {activeTab === 'html' && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 bg-zinc-900/30 flex-shrink-0">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  {html.length.toLocaleString()} characters · Inbox-safe inline HTML
                </p>
                <button onClick={handleCopyHtml} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 transition-all">
                  <Copy size={11} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="flex-1 overflow-auto portal-scrollbar">
                <pre className="p-6 text-[10px] font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap break-all">
                  {html}
                </pre>
              </div>
            </div>
          )}

          {/* Send tab */}
          {activeTab === 'send' && (
            <div className="h-full overflow-y-auto portal-scrollbar">
              <div className="max-w-xl mx-auto px-6 py-8 space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-white/90">Send Campaign</h4>
                  <p className="text-xs text-zinc-500 mt-1">Send now, or pick a date and time to schedule it. Separate multiple addresses with commas.</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/5 p-4">
                    <div className="flex items-start gap-3">
                      <Link2 size={16} className="mt-0.5 shrink-0 text-[#caa24c]" />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-[color:var(--portal-text)]">Check button destinations</h4>
                        <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">These are the pages people will open. Review every link before sending.</p>
                        <div className="mt-4 space-y-3">
                          {editableLinks.length ? editableLinks.map((link) => (
                            <label key={`${link.blockId}-${link.field}`} className="block space-y-1.5">
                              <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">{link.label}</span>
                              <input
                                type="url"
                                value={link.url}
                                onChange={(event) => updateLink(link.blockId, link.field, event.target.value)}
                                className="w-full rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 font-mono text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/60"
                                placeholder="https://luxoratlaspalmas.com/tour"
                              />
                            </label>
                          )) : <p className="text-xs text-[color:var(--portal-muted)]">This email has no buttons.</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Campaign Name</label>
                    <input
                      className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20 transition-colors"
                      placeholder="Example: July open house push"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Subject Line</label>
                    <input
                      className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20 transition-colors"
                      placeholder="Your email subject..."
                      value={sendSubject}
                      onChange={(e) => setSendSubject(e.target.value)}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-550">Recipients List</label>
                      
                      {/* Selected Tags Area */}
                      <div className="flex flex-wrap gap-2 p-2.5 border border-zinc-800 bg-zinc-950/60 rounded-lg min-h-[46px] items-center">
                        {selectedEmails.map((email) => {
                          const contact = allContacts.find((c) => c.email?.toLowerCase() === email.toLowerCase())
                          return (
                            <span
                              key={email}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#caa24c]/10 border border-[#caa24c]/20 text-[#f1d27a] text-xs font-semibold"
                            >
                              <span>{contact ? `${contact.full_name} (${email})` : email}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveEmail(email)}
                                className="hover:text-white transition-colors cursor-pointer"
                              >
                                <X size={11} className="stroke-[3]" />
                              </button>
                            </span>
                          )
                        })}
                        {selectedEmails.length === 0 && !typedInput && (
                          <span className="text-zinc-600 text-xs italic">No recipients selected yet. Type to add or select below.</span>
                        )}
                      </div>

                      {/* Type & Add Input with suggestions */}
                      <div className="relative">
                        <input
                          type="text"
                          value={typedInput}
                          onChange={(e) => setTypedInput(e.target.value)}
                          onKeyDown={handleInputKeyDown}
                          placeholder="Type email address or contact name and press Enter..."
                          className="w-full rounded-md border border-zinc-800 bg-zinc-990 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-650 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20 transition-colors"
                        />
                        
                        {/* Suggestions Dropdown */}
                        {typedInput.trim().length > 0 && filteredSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-12 z-50 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl p-1.5 max-h-56 overflow-y-auto portal-scrollbar">
                            {filteredSuggestions.map((contact) => (
                              <button
                                key={contact.id}
                                type="button"
                                onClick={() => handleAddContact(contact)}
                                className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer"
                              >
                                <div>
                                  <p className="font-bold text-white/90">{contact.full_name}</p>
                                  <p className="text-[10px] text-zinc-550 font-mono mt-0.5">{contact.email}</p>
                                </div>
                                {contact.event_type && (
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-1.5 py-0.5 rounded">
                                    {contact.event_type}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* All Contacts Scrollable List */}
                    <div className="border border-zinc-850 bg-black/20 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Contacts Directory</h4>
                          <p className="text-[9px] text-zinc-550 mt-0.5">Search and select contacts from your lead database.</p>
                        </div>
                        
                        {/* Bulk Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSelectAll}
                            className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                          >
                            Select All
                          </button>
                          <span className="text-zinc-700">·</span>
                          <button
                            type="button"
                            onClick={handleClearAll}
                            className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      {/* Search Directory Input */}
                      <div className="relative">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search contacts by name or email..."
                          className="w-full rounded-lg border border-zinc-900 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-650"
                        />
                      </div>

                      {/* Contacts List Scroll Container */}
                      <div className="max-h-60 overflow-y-auto portal-scrollbar border border-zinc-900/60 bg-zinc-950/20 rounded-lg p-1.5 divide-y divide-zinc-900/40">
                        {contactsLoading ? (
                          <div className="text-center py-8 text-xs text-zinc-550 flex items-center justify-center gap-2">
                            <Loader2 size={13} className="animate-spin text-[#caa24c]" />
                            <span>Loading contacts...</span>
                          </div>
                        ) : filteredContacts.length === 0 ? (
                          <div className="text-center py-8 text-xs text-zinc-600 italic">
                            No contacts found matching &quot;{searchQuery}&quot;
                          </div>
                        ) : (
                          filteredContacts.map((contact, index) => {
                            const isSelected = selectedEmails.includes(contact.email || '')
                            return (
                              <div
                                key={contact.id}
                                onClick={() => handleToggleEmail(contact.email || '')}
                                className="group flex items-center py-2 px-3 hover:bg-zinc-900/40 rounded-lg cursor-pointer transition-colors select-none"
                              >
                                {/* Spotify-style hover index / checkmark */}
                                <div className="w-8 flex-shrink-0 flex items-center justify-center font-mono text-[10px] text-zinc-550">
                                  {isSelected ? (
                                    <CheckCircle size={13} className="text-[#caa24c] fill-[#caa24c]/10" />
                                  ) : (
                                    <>
                                      <span className="group-hover:hidden">{index + 1}</span>
                                      <span className="hidden group-hover:inline">
                                        <Check size={11} className="text-[#caa24c] stroke-[2.5]" />
                                      </span>
                                    </>
                                  )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0 ml-1">
                                  <p className={`text-xs font-bold transition-colors leading-tight ${isSelected ? 'text-[#f1d27a]' : 'text-zinc-200 group-hover:text-white'}`}>
                                    {contact.full_name}
                                  </p>
                                  <p className="text-[10px] text-zinc-550 font-mono mt-0.5 truncate">{contact.email || 'No email registered'}</p>
                                </div>

                                {/* Event Type Badge */}
                                {contact.event_type && (
                                  <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${
                                    isSelected 
                                      ? 'border-[#caa24c]/30 bg-[#caa24c]/10 text-[#f1d27a]' 
                                      : 'border-zinc-900 bg-zinc-950 text-zinc-500'
                                  }`}>
                                    {contact.event_type}
                                  </span>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>

                      {/* Selection Summary */}
                      <div className="flex items-center justify-between text-[10px] text-zinc-550 font-bold uppercase tracking-wider px-1">
                        <span>Total Selected</span>
                        <span className="font-mono text-xs text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-2.5 py-0.5 rounded">
                          {selectedEmails.length} recipient{selectedEmails.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Audience Label</label>
                      <PortalSelect
                        value={audienceLabel === '__create_new__' ? '__create_new__' : selectedMarketingListId || '__manual__'}
                        onChange={handleAudienceChange}
                        className="w-full"
                        placeholder="Choose a marketing list"
                        options={[
                          { value: '__manual__', label: 'Manual selection' },
                          ...marketingLists.map((list) => ({ value: list.id, label: `${list.name} (${list.memberCount})` })),
                          { value: '__create_new__', label: '+ Create new list' },
                        ]}
                      />
                      {audienceLabel === '__create_new__' ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={newListName}
                            onChange={(event) => setNewListName(event.target.value)}
                            placeholder="New list name"
                            className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleCreateList}
                            disabled={creatingList || !newListName.trim() || !selectedEmails.length}
                            className="rounded-md bg-[#caa24c] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-white disabled:opacity-40"
                          >
                            {creatingList ? 'Saving' : 'Create'}
                          </button>
                        </div>
                      ) : null}
                      <p className="text-[10px] text-zinc-600">Choosing a list selects all of its saved members.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Schedule Date</label>
                      <PortalDatePicker
                        value={scheduledDate}
                        onChange={setScheduledDate}
                        className="w-full"
                        placeholder="Pick a date"
                      />
                      <p className="text-[10px] text-zinc-600">Choose a date first.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Schedule Time</label>
                      <PortalSelect
                        value={scheduledTime}
                        onChange={setScheduledTime}
                        className="w-full"
                        placeholder="Pick a time"
                        options={LUXOR_TIME_DROPDOWN_OPTIONS}
                      />
                      <p className="text-[10px] text-zinc-600">Leave date and time blank to send immediately.</p>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Summary</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Blocks</p>
                      <p className="text-sm font-bold text-white/90 font-mono">{blocks.length}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-600 uppercase tracking-wider">HTML Size</p>
                      <p className="text-sm font-bold text-white/90 font-mono">{(html.length / 1024).toFixed(1)}kb</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Tracking</p>
                      <p className="text-sm font-bold text-white/90 font-mono">Open + Click</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Send Mode</p>
                      <p className="text-sm font-bold text-white/90 font-mono">{isScheduled ? 'Scheduled' : 'Send Now'}</p>
                    </div>
                  </div>
                </div>

                {/* Status message */}
                {sendStatus !== 'idle' && sendMessage && (
                  <div className={`flex items-start gap-3 rounded-xl border p-4 ${
                    sendStatus === 'success'
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                      : sendStatus === 'error'
                      ? 'border-rose-500/20 bg-rose-500/5 text-rose-400'
                      : 'border-blue-500/20 bg-blue-500/5 text-blue-400'
                  }`}>
                    {sendStatus === 'success' && <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />}
                    {sendStatus === 'error' && <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
                    <p className="text-xs font-medium">{sendMessage}</p>
                  </div>
                )}

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={sendStatus === 'sending'}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-6 py-3.5 text-sm font-black uppercase tracking-[0.15em] text-white shadow-lg shadow-[#caa24c]/20 transition-all hover:bg-[#d4b060] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {sendStatus === 'sending' ? (
                    <><Loader2 size={16} className="animate-spin" /> {isScheduled ? 'Scheduling...' : 'Sending...'}</>
                  ) : isScheduled ? (
                    <><CalendarClock size={16} /> Schedule Campaign</>
                  ) : (
                    <><Send size={16} /> Send Now</>
                  )}
                </button>

                <p className="text-[10px] text-zinc-700 text-center">
                  Sent from <span className="text-zinc-500">booking@luxoratlaspalmas.com</span>. Scheduled campaigns are delivered automatically at the selected time.
                </p>
              </div>
            </div>
          )}
        </PortalTabTransition>
      </div>
    </PortalModal>
  )
}
