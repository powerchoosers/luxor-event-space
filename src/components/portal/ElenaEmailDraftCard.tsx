'use client'

import React, { useState } from 'react'
import { Mail, Send, Eye, X, Check, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { buildConversationalEmailHtml } from '@/lib/luxorConversationalEmailServer'

export interface EmailDraftPayload {
  recipientEmail: string
  recipientName?: string
  inquiryId?: string
  subject: string
  body: string
  templateType?: 'conversational' | 'marketing'
}

interface ElenaEmailDraftCardProps {
  draft: EmailDraftPayload
  onSendSuccess?: (recipient: string, subject: string) => void
  onRegenerateRequest?: (instruction: string) => void
}

export function ElenaEmailDraftCard({ draft, onSendSuccess, onRegenerateRequest }: ElenaEmailDraftCardProps) {
  const [recipientEmail, setRecipientEmail] = useState(draft.recipientEmail || '')
  const [recipientName, setRecipientName] = useState(draft.recipientName || '')
  const [subject, setSubject] = useState(draft.subject || '')
  const [body, setBody] = useState(draft.body || '')
  
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [trackEmail, setTrackEmail] = useState(true)

  const [refinePrompt, setRefinePrompt] = useState('')
  const [showRefineInput, setShowRefineInput] = useState(false)

  const renderedHtml = buildConversationalEmailHtml({
    to: recipientEmail || 'client@example.com',
    recipientName: recipientName || undefined,
    subject: subject || 'Message from Luxor Event Space',
    body: body || '',
    senderName: 'Arianna Patterson',
    senderRole: 'Owner & Managing Director',
  })

  const handleSend = async () => {
    if (!recipientEmail.trim() || !subject.trim() || !body.trim() || isSending || isSent) return

    setIsSending(true)
    setSendError(null)

    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail.trim(),
          recipientName: recipientName.trim() || undefined,
          subject: subject.trim(),
          content: body.trim(),
          format: 'conversational',
          fromName: 'Arianna Patterson',
          track: trackEmail,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email.')
      }

      setIsSent(true)
      if (onSendSuccess) {
        onSendSuccess(recipientEmail.trim(), subject.trim())
      }
    } catch (err) {
      console.error('Failed to send email:', err)
      setSendError(err instanceof Error ? err.message : 'Failed to send email.')
    } finally {
      setIsSending(false)
    }
  }

  const handleRefineSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!refinePrompt.trim() || !onRegenerateRequest) return
    onRegenerateRequest(refinePrompt.trim())
    setRefinePrompt('')
    setShowRefineInput(false)
  }

  return (
    <div className="w-full mt-3 overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-[#0a0807]/90 shadow-xl backdrop-blur-md">
      {/* Card Top Header Bar */}
      <div className="flex items-center justify-between border-b border-[#caa24c]/15 bg-[#caa24c]/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#caa24c]/20 border border-[#caa24c]/30 text-[#f1d27a]">
            <Mail size={14} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">Elena Email Draft</h4>
            <p className="text-[10px] text-zinc-400">Conversational 1-on-1 • Arianna Patterson Signature</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-2.5 py-1 text-[11px] font-medium text-[#f1d27a] hover:bg-[#caa24c]/20 transition-all cursor-pointer"
            title="Preview full HTML email rendered with signature"
          >
            <Eye size={12} />
            <span>Preview</span>
          </button>

          {onRegenerateRequest && (
            <button
              type="button"
              onClick={() => setShowRefineInput((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Ask Elena to refine this draft"
            >
              <RefreshCw size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Refine prompt input field */}
      {showRefineInput && (
        <form onSubmit={handleRefineSubmit} className="flex items-center gap-2 border-b border-zinc-800/80 bg-zinc-950/80 p-2.5">
          <input
            type="text"
            placeholder="Tell Elena how to tweak this (e.g. 'Make it shorter' or 'Add pricing details')..."
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#caa24c]"
          />
          <button
            type="submit"
            className="rounded-md bg-[#caa24c] px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:bg-[#f1d27a] transition-all cursor-pointer"
          >
            Refine
          </button>
        </form>
      )}

      {/* Main Composer Editable Form */}
      <div className="p-4 space-y-3">
        {/* Recipient Field */}
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 w-12 shrink-0">To:</span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="recipient@example.com"
            disabled={isSent}
            className="flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600 disabled:opacity-60"
          />
        </div>

        {/* Subject Field */}
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 w-12 shrink-0">Subject:</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject..."
            disabled={isSent}
            className="flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600 font-medium disabled:opacity-60"
          />
        </div>

        {/* Body Textarea */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            disabled={isSent}
            placeholder="Email body copy..."
            className="w-[#100%] w-full bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-600 resize-y leading-relaxed font-sans disabled:opacity-60"
          />
        </div>

        {/* Signature Preview Badge */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-850 bg-zinc-950/40 p-3">
          <div className="flex items-center gap-3">
            {/* AP Glyph Icon */}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#f1d27a] via-[#caa24c] to-[#9b6d24] text-zinc-950 font-serif font-bold text-xs shadow-md shrink-0">
              AP
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-200">Arianna Patterson</p>
              <p className="text-[10px] text-[#caa24c]">Owner & Managing Director • Luxor Event Space</p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">booking@luxoratlaspalmas.com</span>
        </div>

        {/* Error Alert */}
        {sendError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            <span>{sendError}</span>
          </div>
        )}

        {/* Success Alert */}
        {isSent && (
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-400 font-medium">
            <Check size={16} className="shrink-0" />
            <span>Email successfully sent via Zoho Mail to {recipientEmail}!</span>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={trackEmail}
              onChange={(e) => setTrackEmail(e.target.checked)}
              disabled={isSent}
              className="accent-[#caa24c] rounded cursor-pointer"
            />
            <span>Track Opens & Clicks</span>
          </label>

          <div className="flex items-center gap-2">
            {!isSent ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !recipientEmail.trim() || !subject.trim() || !body.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#f1d27a] text-zinc-950 px-4 py-2 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
              >
                {isSending ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Send Email</span>
                  </>
                )}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-green-500/40 bg-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-400">
                <Check size={13} /> Sent
              </span>
            )}
          </div>
        </div>
      </div>

      {/* HTML Render Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative flex h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-[#caa24c]/30 bg-[#121212] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5 bg-zinc-950">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-[#caa24c]" />
                <h3 className="text-sm font-semibold text-zinc-200">Email Render Preview (Zoho Outgoing)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Rendered HTML Iframe Preview */}
            <div className="flex-1 bg-zinc-900 p-4 overflow-hidden">
              <iframe
                title="Email Preview"
                srcDoc={renderedHtml}
                className="h-full w-full rounded-xl border border-zinc-800 bg-white shadow-inner"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3 bg-zinc-950">
              <span className="text-xs text-zinc-400">Recipient: <strong className="text-zinc-200">{recipientEmail}</strong></span>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
