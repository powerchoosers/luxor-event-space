'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Copy, ExternalLink, Link2, Loader2, MessageSquareText, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { useToast } from '@/components/portal/ToastProvider'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'
import type { EventLayoutDocument } from '@/components/portal/EventLayoutDesigner'
import type { LuxorLayoutReviewFeedback, PortalLayoutReview } from '@/lib/luxorLayoutReviewTypes'

type Props = {
  inquiryId: string
  leadEventId: string | null
  layout: EventLayoutDocument | null
  onOpenLayoutBuilder: () => void
}

type ReviewResponse = {
  reviews: PortalLayoutReview[]
  feedback: LuxorLayoutReviewFeedback[]
  error?: string
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function isExpired(value: string) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}

function reviewState(review: PortalLayoutReview, feedback: LuxorLayoutReviewFeedback | undefined) {
  if (review.revoked_at || review.status === 'revoked') return { label: 'Revoked', tone: 'text-[color:var(--portal-muted)] bg-[color:var(--portal-soft)] border-[color:var(--portal-border)]' }
  if (isExpired(review.expires_at) || review.status === 'expired') return { label: 'Expired', tone: 'text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' }
  if (feedback?.action === 'approved' || review.status === 'approved') return { label: 'Approved', tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' }
  if (feedback?.action === 'feedback' || review.status === 'feedback') return { label: 'Feedback received', tone: 'text-[#9a6e21] dark:text-[#efcf84] bg-[#caa24c]/10 border-[#caa24c]/25' }
  return { label: 'Waiting for response', tone: 'text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/20' }
}

export function LayoutReviewPanel({ inquiryId, leadEventId, layout, onOpenLayoutBuilder }: Props) {
  const { notify } = useToast()
  const [reviews, setReviews] = useState<PortalLayoutReview[]>([])
  const [feedback, setFeedback] = useState<LuxorLayoutReviewFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadReviews = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const query = new URLSearchParams({ inquiryId })
      if (leadEventId) query.set('leadEventId', leadEventId)
      const response = await fetch(`/api/portal/layout-reviews?${query.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      const data = await response.json() as ReviewResponse
      if (!response.ok) throw new Error(data.error || 'Unable to load layout reviews.')
      setReviews(Array.isArray(data.reviews) ? data.reviews : [])
      setFeedback(Array.isArray(data.feedback) ? data.feedback : [])
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load layout reviews.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [inquiryId, leadEventId])

  useEffect(() => {
    void loadReviews()
  }, [loadReviews])

  useEffect(() => {
    const supabase = getPortalSupabaseClient()
    if (!supabase) return
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null

    void fetch('/api/portal/realtime-config', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || typeof data?.realtimeChannel !== 'string') return
        channel = supabase
          .channel(data.realtimeChannel)
          .on('broadcast', { event: 'layout-review-feedback' }, (event) => {
            const eventInquiryId = typeof event.payload?.inquiryId === 'string' ? event.payload.inquiryId : ''
            if (!eventInquiryId || eventInquiryId === inquiryId) void loadReviews(true)
          })
          .subscribe()
      })
      .catch((connectionError) => console.warn('Failed to connect layout review updates:', connectionError))

    return () => {
      active = false
      if (channel) void supabase.removeChannel(channel)
    }
  }, [inquiryId, loadReviews])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadReviews(true)
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [loadReviews])

  const feedbackByReviewId = useMemo(() => new Map(feedback.map((entry) => [entry.review_id, entry])), [feedback])
  const currentReview = useMemo(
    () => reviews.find((review) => !review.revoked_at && review.status !== 'revoked' && !isExpired(review.expires_at)) || null,
    [reviews],
  )
  const plannedSeats = layout?.items.reduce((total, item) => total + (item.seats || 0), 0) || 0

  const copyLink = useCallback(async (review: PortalLayoutReview) => {
    if (!review.share_url) {
      setError('This saved link cannot be recovered. Create a replacement link to continue.')
      return
    }
    try {
      await navigator.clipboard.writeText(review.share_url)
      setCopiedId(review.id)
      window.setTimeout(() => setCopiedId((current) => current === review.id ? null : current), 1800)
      notify({ title: 'Private link copied', description: 'Share it directly with the person reviewing the layout.', variant: 'success' })
    } catch {
      setError('Your browser could not copy the link. Select and copy it from the field below.')
    }
  }, [notify])

  const createReview = async () => {
    if (!layout) {
      onOpenLayoutBuilder()
      return
    }
    setCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/portal/layout-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ inquiryId, leadEventId, layout }),
      })
      const data = await response.json() as { review?: PortalLayoutReview; error?: string }
      if (!response.ok || !data.review) throw new Error(data.error || 'Unable to create a private layout link.')
      await loadReviews(true)
      notify({ title: 'Private layout link created', description: 'Older links for this event are no longer active.', variant: 'success' })
      await copyLink(data.review)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create a private layout link.')
    } finally {
      setCreating(false)
    }
  }

  const revokeReview = async (review: PortalLayoutReview) => {
    if (!window.confirm('Revoke this private layout link? Anyone using it will no longer be able to view or respond.')) return
    setRevokingId(review.id)
    setError(null)
    try {
      const response = await fetch('/api/portal/layout-reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ inquiryId, reviewId: review.id }),
      })
      const data = await response.json() as { review?: PortalLayoutReview; error?: string }
      if (!response.ok || !data.review) throw new Error(data.error || 'Unable to revoke the private link.')
      await loadReviews(true)
      notify({ title: 'Private layout link revoked', description: 'The recipient can no longer use that link.', variant: 'info' })
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Unable to revoke the private link.')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--portal-border)] pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#b9872f] dark:text-[#e5c370]">
            <ClipboardCheck size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Client layout review</p>
            <h3 className="mt-1 text-sm font-bold text-[color:var(--portal-text)]">Share the saved setup and capture a clear response.</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">Each link is a private snapshot of this saved layout. Creating a new link automatically replaces any earlier link for this event.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void createReview()}
          disabled={creating}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#b9872f] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#caa24c] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
          {!layout ? 'Open layout builder' : currentReview ? 'Create updated link' : 'Create private link'}
        </button>
      </div>

      {!layout ? (
        <div className="mt-4 rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-5 text-sm text-[color:var(--portal-muted)]">
          Save a layout in the builder first. The review link will always show the exact saved version, never a work-in-progress.
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-xs text-[color:var(--portal-muted)]">
          <span><strong className="text-[color:var(--portal-text)]">{layout.name}</strong> is ready to share.</span>
          <span>{layout.items.length} items · {plannedSeats} planned seats</span>
          <span>Links expire after 30 days.</span>
        </div>
      )}

      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-700 dark:text-red-200">{error}</p> : null}

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-xs text-[color:var(--portal-muted)]"><Loader2 className="animate-spin" size={15} /> Loading review activity…</div>
      ) : reviews.length ? (
        <div className="mt-5 space-y-3">
          {reviews.map((review) => {
            const response = feedbackByReviewId.get(review.id)
            const state = reviewState(review, response)
            const isCurrent = currentReview?.id === review.id
            return (
              <article key={review.id} className={`rounded-xl border p-4 ${isCurrent ? 'border-[#caa24c]/35 bg-[#caa24c]/5' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[color:var(--portal-text)]">{review.layout_name}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${state.tone}`}>{state.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">Created {formatTimestamp(review.created_at)} · Expires {formatTimestamp(review.expires_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {review.share_url ? <button type="button" onClick={() => void copyLink(review)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 text-[10px] font-bold text-[color:var(--portal-text)] hover:border-[#caa24c]/45 hover:text-[#b9872f] dark:hover:text-[#e5c370]">{copiedId === review.id ? <CheckCircle2 size={13} /> : <Copy size={13} />}{copiedId === review.id ? 'Copied' : 'Copy link'}</button> : null}
                    {review.share_url ? <button type="button" onClick={() => window.open(review.share_url!, '_blank', 'noopener,noreferrer')} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 text-[10px] font-bold text-[color:var(--portal-text)] hover:border-[#caa24c]/45 hover:text-[#b9872f] dark:hover:text-[#e5c370]"><ExternalLink size={13} /> Preview</button> : null}
                    {!review.revoked_at && review.status !== 'revoked' ? <button type="button" onClick={() => void revokeReview(review)} disabled={revokingId === review.id} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-bold text-[color:var(--portal-muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300 disabled:opacity-50">{revokingId === review.id ? <Loader2 className="animate-spin" size={13} /> : <XCircle size={13} />}Revoke</button> : null}
                  </div>
                </div>

                {review.share_url && isCurrent ? <input aria-label="Private layout review link" readOnly value={review.share_url} onFocus={(event) => event.currentTarget.select()} className="mt-3 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 font-mono text-[10px] text-[color:var(--portal-muted)] outline-none focus:border-[#caa24c]/55" /> : null}

                {response ? (
                  <div className="mt-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[color:var(--portal-text)]">
                      {response.action === 'approved' ? <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" /> : <MessageSquareText size={15} className="text-[#b9872f] dark:text-[#e5c370]" />}
                      {response.action === 'approved' ? 'Approved by the recipient' : 'Recipient feedback'}
                      <span className="ml-auto text-[10px] font-medium text-[color:var(--portal-muted)]">{formatTimestamp(response.created_at)}</span>
                    </div>
                    {response.note ? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[color:var(--portal-muted)]">{response.note}</p> : null}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#b9872f] dark:text-[#e5c370]" />
          <div><p className="text-xs font-bold text-[color:var(--portal-text)]">No private review link yet</p><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Create one when this saved arrangement is ready for the client to see.</p></div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={() => void loadReviews()} className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)] hover:text-[#b9872f] dark:hover:text-[#e5c370]"><RefreshCw size={12} /> Refresh review activity</button>
      </div>
    </section>
  )
}
