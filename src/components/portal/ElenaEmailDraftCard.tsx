'use client'

import React, { useEffect, useState } from 'react'
import { Mail, Send, Eye, X, Check, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { buildConversationalEmailHtml } from '@/lib/luxorConversationalEmailServer'

export interface EmailDraftPayload {
  recipientEmail: string
  recipientName?: string
  inquiryId?: string
  subject: string
  body: string
  templateType?: 'conversational' | 'marketing'
  senderProfile?: {
    email: string
    displayName: string
    roleTitle: string
    avatarUrl: string | null
  }
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
  const [senderProfile, setSenderProfile] = useState(draft.senderProfile || {
    email: 'booking@luxoratlaspalmas.com',
    displayName: 'Luxor Event Space',
    roleTitle: 'Venue Team',
    avatarUrl: null,
  })

  useEffect(() => {
    if (draft.senderProfile) return

    let active = true
    void fetch('/api/portal/user-preferences')
      .then((response) => response.json())
      .then((data) => {
        if (!active || typeof data.display_name !== 'string' || !data.display_name.trim()) return
        const nextProfile = {
          email: typeof data.email === 'string' && data.email.trim() ? data.email.trim() : 'booking@luxoratlaspalmas.com',
          displayName: data.display_name.trim(),
          roleTitle: typeof data.role_title === 'string' && data.role_title.trim() ? data.role_title.trim() : 'Luxor Event Space Team',
          avatarUrl: typeof data.avatar_url === 'string' && data.avatar_url.trim() ? data.avatar_url.trim() : null,
        }
        setSenderProfile(nextProfile)
        setBody((current) => current.replace(/\[(?:your\s+)?name\]/gi, nextProfile.displayName))
      })
      .catch((error) => console.error('Failed to hydrate email sender profile:', error))

    return () => {
      active = false
    }
  }, [draft.senderProfile])
  const senderInitials = senderProfile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'LE'

  const renderedHtml = buildConversationalEmailHtml({
    to: recipientEmail || 'client@example.com',
    recipientName: recipientName || undefined,
    subject: subject || 'Message from Luxor Event Space',
    body: body || '',
    senderName: senderProfile.displayName,
    senderRole: senderProfile.roleTitle,
    senderEmail: senderProfile.email,
    senderImageUrl: senderProfile.avatarUrl,
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
    <div className="portal-render-surface mt-3 w-full overflow-hidden rounded-[1.35rem] border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] font-sans shadow-[0_22px_60px_-42px_rgba(55,38,16,0.55)]">
      {/* Card Top Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]">
            <Mail size={14} />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold tracking-[-0.01em] text-[color:var(--portal-text)]">Elena Email Draft</h4>
            <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">Personal email • {senderProfile.displayName} signature</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/8 px-3 py-1.5 text-[11px] font-semibold text-[#8c6529] transition-all hover:border-[#caa24c]/45 hover:bg-[#caa24c]/14 dark:text-[#f1d27a] cursor-pointer"
            title="Preview full HTML email rendered with signature"
          >
            <Eye size={12} />
            <span>Preview</span>
          </button>

          {onRegenerateRequest && (
            <button
              type="button"
              onClick={() => setShowRefineInput((prev) => !prev)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-all hover:border-[#caa24c]/35 hover:text-[#a8792f] cursor-pointer"
              title="Ask Elena to refine this draft"
            >
              <RefreshCw size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Refine prompt input field */}
      {showRefineInput && (
        <form onSubmit={handleRefineSubmit} className="flex items-center gap-2 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3">
          <input
            type="text"
            placeholder="Tell Elena how to tweak this (e.g. 'Make it shorter' or 'Add pricing details')..."
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/10"
          />
          <button
            type="submit"
            className="portal-gold-button rounded-xl bg-[#caa24c] px-3.5 py-2 text-[11px] font-bold text-white hover:bg-[#b58c39] transition-all cursor-pointer"
          >
            Refine
          </button>
        </form>
      )}

      {/* Main Composer Editable Form */}
      <div className="space-y-3.5 p-4">
        {/* Recipient Field */}
        <label className="group flex items-center gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5 transition-colors focus-within:border-[#caa24c]/45 focus-within:bg-[color:var(--portal-card)] focus-within:ring-2 focus-within:ring-[#caa24c]/8">
          <span className="w-12 shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">To</span>
          <input
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="recipient@example.com"
            disabled={isSent}
            className="portal-input-transparent min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] disabled:opacity-60"
          />
        </label>

        {/* Subject Field */}
        <label className="group flex items-center gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5 transition-colors focus-within:border-[#caa24c]/45 focus-within:bg-[color:var(--portal-card)] focus-within:ring-2 focus-within:ring-[#caa24c]/8">
          <span className="w-12 shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject..."
            disabled={isSent}
            className="portal-input-transparent min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] disabled:opacity-60"
          />
        </label>

        {/* Body Textarea */}
        <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3.5 transition-colors focus-within:border-[#caa24c]/45 focus-within:bg-[color:var(--portal-card)] focus-within:ring-2 focus-within:ring-[#caa24c]/8">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            disabled={isSent}
            placeholder="Email body copy..."
            className="portal-input-transparent portal-scrollbar min-h-36 w-full resize-none bg-transparent text-[13px] leading-6 text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] disabled:opacity-60"
          />
        </div>

        {/* Signature Preview Badge */}
        <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {/* AP Glyph Icon */}
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-gradient-to-br from-[#f1d27a] via-[#caa24c] to-[#9b6d24] bg-cover bg-center font-serif text-sm font-bold tracking-wide text-[#18130d] shadow-md"
              style={senderProfile.avatarUrl ? { backgroundImage: `url(${senderProfile.avatarUrl})` } : undefined}
            >
              {senderProfile.avatarUrl ? <span className="sr-only">{senderProfile.displayName}</span> : senderInitials}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[color:var(--portal-text)]">{senderProfile.displayName}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-[#9a6e28] dark:text-[#caa24c]">{senderProfile.roleTitle} • Luxor Event Space</p>
            </div>
          </div>
          <span className="break-all text-[10px] text-[color:var(--portal-muted)] sm:text-right">{senderProfile.email}</span>
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
          <label className="flex items-center gap-2 text-[11px] text-[color:var(--portal-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={trackEmail}
              onChange={(e) => setTrackEmail(e.target.checked)}
              disabled={isSent}
              className="h-3.5 w-3.5 cursor-pointer rounded border-[color:var(--portal-border)] accent-[#caa24c]"
            />
            <span>Track Opens & Clicks</span>
          </label>

          <div className="flex items-center gap-2">
            {!isSent ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !recipientEmail.trim() || !subject.trim() || !body.trim()}
                className="portal-gold-button inline-flex items-center gap-2 rounded-xl bg-[#caa24c] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-[#b58c39] disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
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
          <div className="relative flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-[#caa24c]" />
                <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Outgoing Email Preview</h3>
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
            <div className="flex-1 overflow-hidden bg-[color:var(--portal-soft)] p-4">
              <iframe
                title="Email Preview"
                srcDoc={renderedHtml}
                className="h-full w-full rounded-xl border border-zinc-800 bg-white shadow-inner"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-3">
              <span className="text-xs text-[color:var(--portal-muted)]">Recipient: <strong className="text-[color:var(--portal-text)]">{recipientEmail}</strong></span>
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
