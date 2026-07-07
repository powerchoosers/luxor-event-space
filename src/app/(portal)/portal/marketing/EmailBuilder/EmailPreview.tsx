'use client'

import React, { useState } from 'react'
import { X, Send, Loader2, CheckCircle, AlertCircle, Copy, Download, CalendarClock } from 'lucide-react'
import type { EmailBlock } from '../emailTemplates'
import { renderEmailToHtml } from './emailRenderer'
import { PortalDatePicker, PortalSelect, PortalModal, PortalAnimatedTabs } from '@/components/portal/PortalUI'

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
  const [recipients, setRecipients] = useState('')
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

  async function handleSend() {
    const emails = recipients
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)

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
        <div className="flex-1 overflow-hidden">
          
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

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Recipients</label>
                    <textarea
                      className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20 transition-colors resize-none"
                      rows={4}
                      placeholder="email@example.com, another@example.com"
                      value={recipients}
                      onChange={(e) => setRecipients(e.target.value)}
                    />
                    <p className="text-[10px] text-zinc-600">
                      {recipients.split(',').filter((e) => e.trim()).length} recipient(s)
                    </p>
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
                  Sent by Zoho Mail from <span className="text-zinc-500">booking@luxoratlaspalmas.com</span>. Scheduled campaigns are handled by the cron sender.
                </p>
              </div>
            </div>
          )}
        </div>
      </PortalModal>
  )
}
