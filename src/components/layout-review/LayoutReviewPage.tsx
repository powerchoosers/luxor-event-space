'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, MessageSquareText, RotateCcw, Send, ShieldCheck, ThumbsUp } from 'lucide-react'
import type { LayoutItem } from '@/components/portal/EventLayoutDesigner'
import type { PublicLayoutReview } from '@/lib/luxorLayoutReviewTypes'

const EventLayout3D = dynamic(
  () => import('@/components/portal/EventLayout3D').then((module) => module.EventLayout3D),
  {
    ssr: false,
    loading: () => <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-[#8f8478]"><Loader2 className="mr-2 animate-spin" size={18} /> Loading the layout preview…</div>,
  },
)

type ReviewResponse = { review: PublicLayoutReview }

function reviewDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

function newSubmissionKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function LayoutReviewPage({ token }: { token: string }) {
  const [review, setReview] = useState<PublicLayoutReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState<'approved' | 'feedback' | null>(null)
  const [submissionKey, setSubmissionKey] = useState<string | null>(null)

  const loadReview = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/public/layout-reviews/${encodeURIComponent(token)}`, { cache: 'no-store' })
      const data = await response.json() as ReviewResponse & { error?: string }
      if (!response.ok || !data.review) throw new Error(data.error || 'This layout review is unavailable.')
      setReview(data.review)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'This layout review is unavailable.')
      setReview(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadReview()
  }, [loadReview])

  const layoutStats = useMemo(() => {
    if (!review) return { seats: 0, items: 0, roomDepth: 0 }
    const snapshot = review.layout_snapshot
    return {
      seats: snapshot.items.reduce((total, item) => total + (item.seats || 0), 0),
      items: snapshot.items.length,
      roomDepth: snapshot.roomHeightFeet + snapshot.secondaryRoomDepthFeet,
    }
  }, [review])

  const submit = async (action: 'approved' | 'feedback') => {
    const trimmedNote = note.trim()
    if (action === 'feedback' && !trimmedNote) {
      setError('Please add a note so we know what you would like changed.')
      return
    }

    const requestKey = submissionKey || newSubmissionKey()
    setSubmissionKey(requestKey)
    setSubmitting(action)
    setError(null)
    try {
      const response = await fetch(`/api/public/layout-reviews/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, note: trimmedNote || null, submissionKey: requestKey }),
      })
      const data = await response.json() as ReviewResponse & { error?: string }
      if (!response.ok || !data.review) throw new Error(data.error || 'Unable to send your response.')
      setReview(data.review)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to send your response.')
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) {
    return <div className="mx-auto flex min-h-[68vh] max-w-7xl items-center justify-center px-4 text-sm text-[#a79b8d]"><Loader2 className="mr-2 animate-spin" size={18} /> Loading your layout…</div>
  }

  if (!review) {
    return (
      <div className="mx-auto flex min-h-[68vh] max-w-xl items-center px-4 py-16 sm:px-6">
        <div className="w-full rounded-3xl border border-white/10 bg-[#211c17] p-7 text-center shadow-2xl">
          <ShieldCheck className="mx-auto text-[#caa24c]" size={30} />
          <h1 className="mt-4 font-serif text-3xl text-[#f5e7d2]">Layout review unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[#aaa094]">{error || 'This private review link may have expired or been replaced.'}</p>
        </div>
      </div>
    )
  }

  const snapshot = review.layout_snapshot
  const response = review.response
  const isApproved = response?.action === 'approved'
  const roomDepth = snapshot.roomHeightFeet + snapshot.secondaryRoomDepthFeet

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-7 max-w-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#d3ad5b]">Saved event layout</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-[#f8eddf] sm:text-5xl">{review.layout_name}</h1>
        <p className="mt-3 text-sm leading-6 text-[#b8ada0]">Please take a look around the room. You can approve the plan or leave a note for the Luxor team.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.75fr)]">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#211c17] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4 sm:px-6">
            <div>
              <p className="text-sm font-semibold text-[#f0e4d5]">Interactive 3D preview</p>
              <p className="mt-0.5 text-xs text-[#95897d]">Drag to orbit and inspect the saved setup.</p>
            </div>
            <span className="rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#e8c775]">Private link</span>
          </div>
          <div className="h-[360px] bg-[#e9edf1] sm:h-[500px]">
            <EventLayout3D
              items={snapshot.items as LayoutItem[]}
              selectedId={null}
              onSelect={() => undefined}
              roomWidthFeet={snapshot.roomWidthFeet}
              roomDepthFeet={roomDepth}
              mainRoomDepthFeet={snapshot.roomHeightFeet}
              secondaryRoomWidthFeet={snapshot.secondaryRoomWidthFeet}
            />
          </div>
          <div className="grid grid-cols-3 border-t border-white/8 bg-[#1b1713] px-5 py-4 text-center sm:px-6">
            <div><p className="text-lg font-semibold text-[#f1dfc7]">{layoutStats.seats}</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f8376]">Planned seats</p></div>
            <div className="border-x border-white/8"><p className="text-lg font-semibold text-[#f1dfc7]">{layoutStats.items}</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f8376]">Layout items</p></div>
            <div><p className="text-lg font-semibold text-[#f1dfc7]">{snapshot.roomWidthFeet}′</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f8376]">Room width</p></div>
          </div>
        </section>

        <aside className="rounded-3xl border border-white/10 bg-[#211c17] p-5 shadow-2xl sm:p-6">
          {response ? (
            <div className="text-center sm:text-left">
              {isApproved ? <CheckCircle2 className="text-emerald-400" size={30} /> : <MessageSquareText className="text-[#e2bb68]" size={30} />}
              <h2 className="mt-4 font-serif text-3xl text-[#f8eddf]">{isApproved ? 'Layout approved' : 'Feedback received'}</h2>
              <p className="mt-2 text-sm leading-6 text-[#aca194]">
                {isApproved ? 'Thank you. The Luxor team has your approval.' : 'Thank you. The Luxor team has your notes and will follow up if needed.'}
              </p>
              {response.note ? <blockquote className="mt-5 rounded-2xl border border-white/8 bg-[#181410] p-4 text-left text-sm leading-6 text-[#d9cec0] whitespace-pre-wrap">{response.note}</blockquote> : null}
              <p className="mt-5 text-[11px] text-[#8e8275]">Response sent {reviewDate(response.created_at)}.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-[#e4c174]"><ThumbsUp size={18} /><p className="text-[10px] font-bold uppercase tracking-[0.2em]">Your response</p></div>
              <h2 className="mt-3 font-serif text-3xl text-[#f8eddf]">Does this layout work for you?</h2>
              <p className="mt-2 text-sm leading-6 text-[#aca194]">Approve it as-is, or tell us what you would like adjusted.</p>

              <button
                type="button"
                onClick={() => void submit('approved')}
                disabled={Boolean(submitting)}
                className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting === 'approved' ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
                Approve this layout
              </button>

              <div className="my-6 h-px bg-white/8" />
              <label htmlFor="layout-feedback-note" className="text-sm font-semibold text-[#ece0d1]">Request a change</label>
              <p className="mt-1 text-xs leading-5 text-[#93877a]">Let us know what you would like moved, added, or removed.</p>
              <textarea
                id="layout-feedback-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
                rows={6}
                placeholder="For example: Could we move the dance floor closer to the stage?"
                className="mt-3 w-full resize-y rounded-xl border border-white/12 bg-[#181410] px-3 py-2.5 text-sm text-[#f1e5d7] outline-none placeholder:text-[#766b60] focus:border-[#d7b25e] focus:ring-2 focus:ring-[#caa24c]/20"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[#887d71]"><span>{note.length}/2000</span><span>Shared privately with Luxor</span></div>
              <button
                type="button"
                onClick={() => void submit('feedback')}
                disabled={Boolean(submitting) || !note.trim()}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#caa24c]/55 bg-[#caa24c]/12 px-4 text-sm font-bold text-[#f3d68c] transition-colors hover:bg-[#caa24c]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting === 'feedback' ? <Loader2 className="animate-spin" size={17} /> : <Send size={16} />}
                Send feedback
              </button>
              {error ? <p role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">{error}</p> : null}
            </div>
          )}
        </aside>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#1c1814] px-5 py-4 text-xs text-[#968a7c]">
        <span>Saved {reviewDate(review.created_at)} · This link expires {reviewDate(review.expires_at)}.</span>
        <button type="button" onClick={() => void loadReview()} className="inline-flex items-center gap-1.5 font-semibold text-[#d8b563] hover:text-[#f0d284]"><RotateCcw size={13} /> Refresh</button>
      </div>
    </div>
  )
}
