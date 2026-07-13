'use client'

import React, { useState, useEffect } from 'react'
import { X, Send, Loader2, CheckCircle, AlertCircle, Copy, Download, CalendarClock, Check } from 'lucide-react'
import type { EmailBlock } from '../emailTemplates'
import { renderEmailToHtml } from './emailRenderer'
import { PortalDatePicker, PortalSelect, PortalModal, PortalAnimatedTabs, PortalTabTransition } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

const scheduleTimeOptions = Array.from({ length: 25 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30
  const hours24 = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return {
    value: `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    label: `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`,
  }
})

interface EmailPreviewProps {
  isOpen: boolean
  blocks: EmailBlock[]
  subject: string
  onClose: () => void
}

type SendStatus = 'idle' | 'sending' | 'success' | 'error'

export function EmailPreview({ isOpen, blocks, subject, onClose }: EmailPreviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'html' | 'send'>('preview')
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [typedInput, setTypedInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [allContacts, setAllContacts] = useState<LuxorInquiry[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [sendSubject, setSendSubject] = useState(subject)
  const [campaignName, setCampaignName] = useState(subject)
  const [audienceLabel, setAudienceLabel] = useState('Manual list')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle')
  const [sendMessage, setSendMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const html = renderEmailToHtml(subject, blocks)
  const scheduledFor = scheduledDate && scheduledTime ? `${scheduledDate}T${scheduledTime}:00` : ''
  const isScheduled = Boolean(scheduledFor)

  // Load contacts
  useEffect(() => {
    if (isOpen) {
      setContactsLoading(true)
      fetch('/api/inquiries')
        .then((res) => res.json())
        .then((data) => {
          setAllContacts(data || [])
        })
        .catch((err) => console.error(err))
        .finally(() => setContactsLoading(false))
    }
  }, [isOpen])

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
    setSelectedEmails(prev => prev.filter(e => e !== email))
  }

  // Toggle selection from directory
  const handleToggleEmail = (email: string) => {
    if (!email) return
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
        if (val.includes('@') && !selectedEmails.includes(val)) {
          setSelectedEmails(prev => [...prev, val])
        }
      }
      setTypedInput('')
    }
  }

  // Bulk actions
  const handleSelectAll = () => {
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
    if (!searchQuery.trim()) {
      setSelectedEmails([])
    } else {
      const filteredEmails = filteredContacts.map((c) => c.email).filter(Boolean)
      setSelectedEmails(prev => prev.filter(e => !filteredEmails.includes(e)))
    }
  }

  async function handleSend() {
    const emails = selectedEmails

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
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Email Preview</p>
              <h3 className="text-sm font-bold text-white/90 mt-0.5 truncate max-w-xs">{subject || 'Untitled Email'}</h3>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
            <PortalAnimatedTabs
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab)}
            />
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 overflow-hidden">
          
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
                <div className="flex-1 bg-zinc-800 rounded px-3 py-1 text-[10px] text-zinc-500 font-mono">
                  {subject || 'Untitled Email'}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCopyHtml} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 transition-all">
                    <Copy size={11} />
                    {copied ? 'Copied!' : 'Copy HTML'}
                  </button>
                  <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 transition-all">
                    <Download size={11} />
                    Download
                  </button>
                </div>
              </div>
              {/* iframe preview */}
              <div className="flex-1 bg-zinc-100 overflow-hidden">
                <iframe
                  srcDoc={html}
                  title="Email Preview"
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
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
                  <p className="text-xs text-zinc-500 mt-1">Send now through Zoho, or pick a date and time to schedule it. Separate multiple addresses with commas.</p>
                </div>

                <div className="space-y-4">
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
                      <input
                        className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20 transition-colors"
                        placeholder="Wedding leads, no-shows..."
                        value={audienceLabel}
                        onChange={(e) => setAudienceLabel(e.target.value)}
                      />
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
                        options={scheduleTimeOptions}
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
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-6 py-3.5 text-sm font-black uppercase tracking-[0.15em] text-black shadow-lg shadow-[#caa24c]/20 transition-all hover:bg-[#d4b060] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
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
                  Sent by Zoho Mail from <span className="text-zinc-500">booking@luxoratlaspalmas.com</span>. Scheduled campaigns are processed by the Supabase email scheduler.
                </p>
              </div>
            </div>
          )}
        </PortalTabTransition>
      </PortalModal>
  )
}
