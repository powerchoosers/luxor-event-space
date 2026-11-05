'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Download, Loader2, Mail, Reply, Send } from 'lucide-react'
import type { EmailMessageItem } from '@/app/(portal)/portal/marketing/tabs/AllEmailsTab'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import { EmailRichTextEditor } from './EmailRichTextEditor'
import { LeadActivityDisclosure } from './LeadActivityDisclosure'
import { PortalButton, PortalModal } from './PortalUI'
import { PortalPdfViewer } from './PortalPdfViewer'

const ThreadMessage = dynamic(() => import('@/app/(portal)/portal/marketing/tabs/AllEmailsTab').then((module) => module.ThreadMessage), {
  ssr: false,
  loading: () => <p role="status" className="py-4 text-sm text-[color:var(--portal-muted)]">Opening email…</p>,
})

type Attachment = NonNullable<EmailMessageItem['attachments']>[number]
export type LeadEmailActivityEmail = Omit<EmailMessageItem, 'direction'> & { direction?: 'incoming' | 'outgoing' | 'matched' }
type Props = { email: LeadEmailActivityEmail; inquiry: LuxorInquiry; onReplySent?: (message: EmailMessageItem) => void }

function previewText(value: string) {
  return decodeHtmlEntities(value.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function activityDate(value: string | null) {
  const date = value ? new Date(Number.isFinite(Number(value)) ? Number(value) : value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date unavailable'
}

export function LeadEmailActivity(props: Props) {
  return <LeadEmailActivityContent key={`${props.inquiry.id}:${props.email.id}:${props.email.folderId || ''}`} {...props} />
}

function LeadEmailActivityContent({ email, inquiry, onReplySent }: Props) {
  const [detail, setDetail] = useState<EmailMessageItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockExternalImages, setBlockExternalImages] = useState(true)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyHtml, setReplyHtml] = useState('')
  const [draftReady, setDraftReady] = useState(false)
  const [sending, setSending] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<(Attachment & { url: string; mimeType: string }) | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const attachmentRequest = useRef(0)
  const replyDelivery = useRef<{ fingerprint: string; key: string } | null>(null)
  const draftKey = `luxor-lead-email-reply:${inquiry.id}:${email.id}`
  const inquiryByEmail = useMemo(() => new Map(inquiry.email ? [[inquiry.email.trim().toLowerCase(), inquiry]] : []), [inquiry])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; attachmentRequest.current += 1 }
  }, [])

  useEffect(() => {
    try { setReplyHtml(window.localStorage.getItem(draftKey) || '') } catch { /* The in-memory draft still works. */ }
    setDraftReady(true)
  }, [draftKey])

  useEffect(() => {
    if (!draftReady) return
    try {
      if (replyHtml) window.localStorage.setItem(draftKey, replyHtml)
      else window.localStorage.removeItem(draftKey)
    } catch { /* Keep editing available when browser storage is unavailable. */ }
  }, [draftKey, draftReady, replyHtml])

  useEffect(() => {
    const url = attachmentPreview?.url
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [attachmentPreview?.url])

  const loadDetail = useCallback(async () => {
    if (detail || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setError(null)
    try {
      const folderQuery = email.folderId ? `?folderId=${encodeURIComponent(email.folderId)}` : ''
      const response = await fetch(`/api/email/messages/${encodeURIComponent(email.id)}${folderQuery}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as EmailMessageItem & { error?: string }
      if (!response.ok || !payload.id) throw new Error(payload.error || 'This email could not be opened.')
      if (mounted.current) setDetail(payload)
    } catch (requestError) {
      if (mounted.current) setError(requestError instanceof Error ? requestError.message : 'This email could not be opened.')
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [detail, email.folderId, email.id])

  async function openAttachment(attachment: Attachment, message: EmailMessageItem) {
    const reference = attachment.attachmentId || attachment.attachmentPath
    if (!reference) return
    const request = ++attachmentRequest.current
    setOpeningAttachment(reference)
    setAttachmentError(null)
    try {
      const params = new URLSearchParams({ attachmentId: attachment.attachmentId || '', attachmentPath: attachment.attachmentPath || '', folderId: message.folderId || '', filename: attachment.filename })
      const response = await fetch(`/api/email/attachments/${encodeURIComponent(message.id)}?${params}`)
      if (!response.ok) throw new Error('The attachment could not be opened. Select it again to retry.')
      const mimeType = response.headers.get('content-type') || attachment.mimeType || 'application/octet-stream'
      const url = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: mimeType }))
      if (mounted.current && request === attachmentRequest.current) setAttachmentPreview({ ...attachment, mimeType, url })
      else URL.revokeObjectURL(url)
    } catch (requestError) {
      if (mounted.current && request === attachmentRequest.current) setAttachmentError(requestError instanceof Error ? requestError.message : 'The attachment could not be opened.')
    } finally {
      if (mounted.current && request === attachmentRequest.current) setOpeningAttachment(null)
    }
  }

  async function sendReply() {
    if (!detail || !replyHtml.trim() || sending) return
    const fingerprint = JSON.stringify({ messageId: detail.id, content: replyHtml })
    if (replyDelivery.current?.fingerprint !== fingerprint) replyDelivery.current = { fingerprint, key: crypto.randomUUID() }
    setSending(true)
    setReplyError(null)
    try {
      const response = await fetch(`/api/email/messages/${encodeURIComponent(detail.id)}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyHtml, deliveryKey: replyDelivery.current.key, folderId: detail.folderId || email.folderId || null, inquiryId: inquiry.id }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: EmailMessageItem }
      if (!response.ok) throw new Error(payload.error || 'Your reply could not be sent. Your draft is still here; try again.')
      setReplyHtml('')
      replyDelivery.current = null
      setReplyOpen(false)
      setSent(true)
      try { window.localStorage.removeItem(draftKey) } catch { /* The sent reply is cleared in memory. */ }
      if (payload.message) onReplySent?.(payload.message)
    } catch (requestError) {
      setReplyError(requestError instanceof Error ? requestError.message : 'Your reply could not be sent. Your draft is still here; try again.')
    } finally { setSending(false) }
  }

  const outgoing = (detail?.direction || email.direction) === 'outgoing' || detail?.direction === 'campaign'
  const recipient = detail ? (outgoing ? detail.to : detail.from) : inquiry.email || ''
  // A mailbox summary is only a collapsed preview, never the complete body.
  const message = detail ? { ...detail, summary: '', direction: detail.direction || (email.direction === 'matched' ? 'incoming' : email.direction) } : null
  const hasReply = Boolean(replyHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || /<img\b/i.test(replyHtml))

  return <>
    <LeadActivityDisclosure
      icon={<Mail size={15} />}
      label={email.direction === 'outgoing' ? 'Email sent' : 'Email received'}
      title={decodeHtmlEntities(email.subject) || 'No subject'}
      description={`${email.direction === 'outgoing' ? 'To' : 'From'} ${email.direction === 'outgoing' ? email.to : email.from}`}
      preview={previewText(email.summary)}
      timestamp={activityDate(email.receivedAt)}
      badge={email.deliveryStatus ? <span className="rounded-md bg-[color:var(--portal-soft)] px-2 py-0.5 text-[10px] font-semibold capitalize text-[color:var(--portal-muted)]">{email.deliveryStatus.replaceAll('_', ' ')}</span> : undefined}
      onExpand={() => { void loadDetail() }}
    >
      {loading ? <p role="status" className="flex items-center gap-2 py-4 text-sm text-[color:var(--portal-muted)]"><Loader2 size={15} className="animate-spin" /> Opening email…</p> : error ? <div role="alert" className="space-y-3"><p className="text-sm text-[color:var(--portal-muted)]">{error}</p><PortalButton onClick={() => { void loadDetail() }}>Try again</PortalButton></div> : message ? <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <PortalButton variant="primary" onClick={() => { setReplyOpen(true); setReplyError(null); setSent(false) }}><Reply size={14} /> Reply</PortalButton>
          {message.htmlContent ? <PortalButton variant="ghost" onClick={() => setBlockExternalImages((current) => !current)} aria-pressed={!blockExternalImages}>{blockExternalImages ? 'Load external images' : 'Block external images'}</PortalButton> : null}
        </div>
        {sent ? <p role="status" className="mb-3 text-sm text-[color:var(--portal-muted)]">Reply sent.</p> : null}
        <ThreadMessage message={message} expanded chat viewMode="html" blockExternalImages={blockExternalImages} inquiryByEmail={inquiryByEmail} onThreadInteraction={() => undefined} onOpenAttachment={(attachment, selectedMessage) => { void openAttachment(attachment, selectedMessage) }} openingAttachment={openingAttachment} />
        {attachmentError ? <p role="alert" className="mt-3 text-sm text-[color:var(--portal-muted)]">{attachmentError}</p> : null}
      </> : null}
    </LeadActivityDisclosure>

    <PortalModal isOpen={replyOpen} onClose={() => { if (!sending) setReplyOpen(false) }} title="Reply to email" maxWidth="max-w-3xl" fullScreenOnCompact footer={<div className="flex flex-wrap items-center justify-end gap-2"><PortalButton variant="ghost" onClick={() => setReplyOpen(false)} disabled={sending}>Close draft</PortalButton><PortalButton variant="primary" onClick={() => { void sendReply() }} disabled={sending || !hasReply || !detail}>{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{sending ? 'Sending…' : 'Send reply'}</PortalButton></div>}>
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm"><dt className="text-[color:var(--portal-muted)]">To</dt><dd className="break-words text-[color:var(--portal-text)]">{recipient}</dd><dt className="text-[color:var(--portal-muted)]">Subject</dt><dd className="break-words text-[color:var(--portal-text)]">Re: {decodeHtmlEntities(detail?.subject || email.subject).replace(/^(\s*re\s*:\s*)+/i, '') || '(No subject)'}</dd></dl>
        <EmailRichTextEditor value={replyHtml} onChange={setReplyHtml} ariaLabel="Email reply" placeholder="Write your reply…" autoFocus readOnly={sending} compact basicFormatting className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]" bodyClassName="min-h-48 text-sm leading-6 text-[color:var(--portal-text)]" />
        {replyError ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{replyError}</p> : null}
      </div>
    </PortalModal>

    <PortalModal isOpen={Boolean(attachmentPreview)} onClose={() => setAttachmentPreview(null)} title={attachmentPreview?.filename || 'Attachment'} maxWidth="max-w-5xl" fullScreenOnCompact footer={attachmentPreview ? <a href={attachmentPreview.url} download={attachmentPreview.filename} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><Download size={15} /> Download attachment</a> : undefined}>
      {attachmentPreview ? attachmentPreview.mimeType.includes('pdf') || /\.pdf$/i.test(attachmentPreview.filename) ? <div className="flex h-[65dvh] min-h-0 flex-col"><PortalPdfViewer url={attachmentPreview.url} title={attachmentPreview.filename} /></div> : attachmentPreview.mimeType.startsWith('image/') ? <div className="flex min-h-40 items-center justify-center">
        {/* The image is a local blob from the authenticated attachment endpoint. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachmentPreview.url} alt={attachmentPreview.filename} className="max-h-[65dvh] max-w-full rounded-lg object-contain" />
      </div> : <p className="text-sm text-[color:var(--portal-muted)]">This file can be downloaded using the attachment link below.</p> : null}
    </PortalModal>
  </>
}
