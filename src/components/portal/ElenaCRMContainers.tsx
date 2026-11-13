'use client'
import { PortalConstellationLoader } from '@/components/portal/PortalConstellationLoader'
import { LUXOR_MAX_GUESTS } from '@/lib/luxorInquiryTypes'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  UserCheck,
  FileSignature,
  Receipt,
  CheckSquare,
  Check,
  Loader2,
  Copy,
  ExternalLink,
  Send,
  AlertCircle,
  Calendar,
  Users,
  Wrench,
  FileText,
  Plus,
  ChevronDown,
  ChevronLeft,
  Globe,
  LayoutDashboard,
} from '@/lib/icons/phosphor-compat'
import { PortalDatePicker, PortalSelect, PORTAL_MODAL_EASE } from './PortalUI'
import { readPortalActionResponse } from '@/lib/portalActionFetch'
import {
  developerSupportPagesForArea,
  developerSupportRouteChip,
  getDeveloperSupportPageArea,
  labelDeveloperSupportPagePath,
  normalizeDeveloperSupportPagePath,
  type DeveloperSupportPageArea,
} from '@/lib/luxorDeveloperSupportPagePaths'

// --- 1. Lead Update Container ---
export interface LeadUpdatePayload {
  inquiryId?: string
  bookingId?: string
  clientName: string
  currentPipelineStage?: string
  currentStatus?: string
  targetDate?: string
  guestCount?: number
  eventType?: string
}

export function ElenaLeadUpdateCard({
  payload,
  onSuccess
}: {
  payload: LeadUpdatePayload
  onSuccess?: (msg: string) => void
}) {
  const [pipelineStage, setPipelineStage] = useState(payload.currentPipelineStage || 'inquiry')
  const [status, setStatus] = useState(payload.currentStatus || 'new')
  const [targetDate, setTargetDate] = useState(payload.targetDate || '')
  const [guestCount, setGuestCount] = useState<number | string>(payload.guestCount || '')
  const guestCountValidationError = guestCount === ''
    ? null
    : !Number.isInteger(Number(guestCount)) || Number(guestCount) < 1
      ? 'Enter a whole guest count greater than zero.'
      : Number(guestCount) > LUXOR_MAX_GUESTS && Number(guestCount) !== payload.guestCount
        ? 'Guest count must be 180 or fewer.'
        : null
  
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApply = async () => {
    if (isUpdating || isDone) return
    if (guestCountValidationError) { setError(guestCountValidationError); return }
    setIsUpdating(true)
    setError(null)

    try {
      const res = await fetch('/api/portal/elena-chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_LEAD',
          inquiryId: payload.inquiryId,
          bookingId: payload.bookingId,
          updates: {
            pipeline_stage: pipelineStage,
            status,
            target_date: targetDate || null,
            guest_count: guestCount ? Number(guestCount) : null
          }
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update CRM record')

      setIsDone(true)
      if (onSuccess) {
        onSuccess(`Updated ${payload.clientName}'s CRM record to stage "${pipelineStage.replace(/_/g, ' ')}"! ✨`)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="w-full mt-3 overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-[#0a0807]/90 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[#caa24c]/15 bg-[#caa24c]/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#caa24c]/20 border border-[#caa24c]/30 text-[#f1d27a]">
            <UserCheck size={14} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">Elena CRM Lead Update</h4>
            <p className="text-[10px] text-zinc-400">Client: <strong className="text-zinc-200">{payload.clientName}</strong></p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {/* Pipeline Stage Select */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Pipeline Stage</label>
            <PortalSelect
              value={pipelineStage}
              onChange={setPipelineStage}
              disabled={isDone}
              className="w-full"
              buttonClassName="!h-8 !rounded-lg !px-2.5 !py-1.5 !text-left !text-xs"
              options={[
                { value: 'newsletter', label: '0. Newsletter' },
                { value: 'inquiry', label: '1. Inquiry' },
                { value: 'tour', label: '2. Tour Scheduled / Attended' },
                { value: 'proposal_sent', label: '3. Proposal Sent' },
                { value: 'book_reserve', label: '4. Book & Reserve' },
                { value: 'planning_begins', label: '5. Planning Begins' },
                { value: 'final_details', label: '6. Final Details' },
                { value: 'setup_event_day', label: '7. Event Day' },
                { value: 'after_event', label: '8. After Event' },
                { value: 'closed_lost', label: 'Archived' },
              ]}
            />
          </div>

          {/* Inquiry Status Select */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Lead Status</label>
            <PortalSelect
              value={status}
              onChange={setStatus}
              disabled={isDone}
              className="w-full"
              buttonClassName="!h-8 !rounded-lg !px-2.5 !py-1.5 !text-left !text-xs"
              options={[
                { value: 'new', label: 'New' },
                { value: 'contacted', label: 'Contacted' },
                { value: 'tour_requested', label: 'Tour Time Needed' },
                { value: 'tour_confirmed', label: 'Tour Confirmed' },
                { value: 'proposal_sent', label: 'Proposal Sent' },
                { value: 'booked', label: 'Booked' },
                { value: 'closed_lost', label: 'Archived' },
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Target Date Input */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1 flex items-center gap-1">
              <Calendar size={10} /> Target Date
            </label>
            <input
              type="text"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              placeholder="e.g. Oct 12, 2026"
              disabled={isDone}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#caa24c] disabled:opacity-60"
            />
          </div>

          {/* Guest Count Input */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1 flex items-center gap-1">
              <Users size={10} /> Guest Count
            </label>
            <input
              type="number"
              min={1}
              max={LUXOR_MAX_GUESTS}
              step={1}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              placeholder="e.g. 150"
              disabled={isDone}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#caa24c] disabled:opacity-60"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          {!isDone ? (
            <button
              type="button"
              onClick={handleApply}
              disabled={isUpdating}
              className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#f1d27a] text-white hover:text-white focus-visible:text-white disabled:text-white px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isUpdating ? <PortalConstellationLoader size={13} tone="white" /> : <Check size={13} />}
              <span>Apply CRM Updates</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-green-500/40 bg-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-400">
              <Check size={13} /> CRM Updated
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// --- 2. Contract Signature Container ---
export interface ContractCardPayload {
  inquiryId?: string
  bookingId?: string
  clientName: string
  clientEmail: string
  eventType?: string
  eventDate?: string
  contractTotal?: number
  depositRequired?: number
  signingStatus?: string
  signingUrl?: string
}

export function ElenaContractCard({
  payload,
  onSuccess
}: {
  payload: ContractCardPayload
  onSuccess?: (msg: string) => void
}) {
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [signingUrl, setSigningUrl] = useState(payload.signingUrl || '')
  const [error, setError] = useState<string | null>(null)

  const handleSendContract = async () => {
    if (isSending || sent) return
    setIsSending(true)
    setError(null)

    try {
      const res = await fetch('/api/portal/elena-chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_CONTRACT',
          inquiryId: payload.inquiryId,
          bookingId: payload.bookingId,
          sendEmail: true
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send contract signature request')

      if (data.signingUrl) {
        setSigningUrl(data.signingUrl)
      }
      setSent(true)
      if (onSuccess) {
        onSuccess(`Sent the Event Agreement to **${payload.clientEmail}**. Payment will follow after signature. 📄✍️`)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Contract send failed')
    } finally {
      setIsSending(false)
    }
  }

  const handleCopyLink = () => {
    if (!signingUrl) return
    navigator.clipboard.writeText(signingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="w-full mt-3 overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-[#0a0807]/90 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[#caa24c]/15 bg-[#caa24c]/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#caa24c]/20 border border-[#caa24c]/30 text-[#f1d27a]">
            <FileSignature size={14} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">Luxor Digital Event Agreement</h4>
            <p className="text-[10px] text-zinc-400">{payload.eventType || 'Event'} • {payload.clientName}</p>
          </div>
        </div>

        <span className="rounded-md border border-[#caa24c]/30 bg-[#caa24c]/10 px-2 py-0.5 text-[10px] font-bold text-[#f1d27a] capitalize">
          {payload.signingStatus || 'Ready'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-850 bg-zinc-950/60 p-3">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block">Contract Total</span>
            <span className="text-sm font-bold font-mono text-zinc-200">
              ${(payload.contractTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block">Deposit Required</span>
            <span className="text-sm font-bold font-mono text-[#f1d27a]">
              ${(payload.depositRequired || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="text-xs text-zinc-400 space-y-1">
          <p>Recipient: <strong className="text-zinc-200">{payload.clientEmail}</strong></p>
          {payload.eventDate && <p>Event Date: <strong className="text-zinc-200">{payload.eventDate}</strong></p>}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {signingUrl ? (
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-all cursor-pointer"
            >
              {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              <span>{copied ? 'Link Copied!' : 'Copy Signing Link'}</span>
            </button>
          ) : (
            <span className="text-[10px] text-zinc-500 font-mono">Email Delivery Active</span>
          )}

          {!sent ? (
            <button
              type="button"
              onClick={handleSendContract}
              disabled={isSending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#f1d27a] text-white hover:text-white focus-visible:text-white disabled:text-white px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSending ? <PortalConstellationLoader size={13} tone="white" /> : <Send size={13} />}
              <span>Resend Event Agreement</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-green-500/40 bg-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-400">
              <Check size={13} /> Contract Sent
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// --- 3. Invoice & Payment Container ---
export interface InvoiceCardPayload {
  invoiceId: string
  inquiryId?: string
  clientName: string
  clientEmail?: string
  total: number
  paidTotal: number
  balanceDue: number
  status: string
  checkoutUrl?: string
}

export function ElenaInvoiceCard({
  payload,
  onSuccess
}: {
  payload: InvoiceCardPayload
  onSuccess?: (msg: string) => void
}) {
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkoutUrl = payload.checkoutUrl || ''

  const handleSendInvoice = async () => {
    if (isSending || sent) return
    setIsSending(true)
    setError(null)

    try {
      const res = await fetch('/api/portal/elena-chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_INVOICE',
          invoiceId: payload.invoiceId,
          inquiryId: payload.inquiryId,
          sendEmail: true
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send invoice link')

      setSent(true)
      if (onSuccess) {
        onSuccess(`Sent the post-signature payment link to **${payload.clientName}**. 💳`)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Invoice send failed')
    } finally {
      setIsSending(false)
    }
  }

  const handleCopyLink = () => {
    if (!checkoutUrl) return
    navigator.clipboard.writeText(checkoutUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="w-full mt-3 overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-[#0a0807]/90 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[#caa24c]/15 bg-[#caa24c]/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#caa24c]/20 border border-[#caa24c]/30 text-[#f1d27a]">
            <Receipt size={14} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">Signed-Contract Payment</h4>
            <p className="text-[10px] text-zinc-400">Client: <strong className="text-zinc-200">{payload.clientName}</strong></p>
          </div>
        </div>

        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold capitalize ${
          payload.status === 'paid'
            ? 'border-green-500/40 bg-green-500/20 text-green-400'
            : 'border-[#caa24c]/30 bg-[#caa24c]/10 text-[#f1d27a]'
        }`}>
          {payload.status}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-850 bg-zinc-950/60 p-3 text-center">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block">Total</span>
            <span className="text-xs font-bold font-mono text-zinc-300">${payload.total.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block">Paid</span>
            <span className="text-xs font-bold font-mono text-green-400">${payload.paidTotal.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block">Balance</span>
            <span className="text-xs font-bold font-mono text-[#f1d27a]">${payload.balanceDue.toFixed(2)}</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {checkoutUrl ? (
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-all cursor-pointer"
            >
              {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
              <span>{copied ? 'Link Copied!' : 'Copy Checkout Link'}</span>
            </button>
          ) : (
            <a
              href={`/portal/invoices?id=${payload.invoiceId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#caa24c] hover:underline"
            >
              <span>View Invoice Record</span>
              <ExternalLink size={12} />
            </a>
          )}

          {!sent && payload.balanceDue > 0 ? (
            <button
              type="button"
              onClick={handleSendInvoice}
              disabled={isSending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#f1d27a] text-white hover:text-white focus-visible:text-white disabled:text-white px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSending ? <PortalConstellationLoader size={13} tone="white" /> : <Send size={13} />}
              <span>Send Invoice Link</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-green-500/40 bg-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-400">
              <Check size={13} /> {payload.balanceDue <= 0 ? 'Fully Paid' : 'Invoice Sent'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// --- 4. Task Creator Container ---
export interface TaskCardPayload {
  inquiryId: string
  clientName?: string
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  dueDate?: string
}

export function ElenaTaskCard({ payload, onSuccess }: { payload: TaskCardPayload; onSuccess?: (msg: string) => void }) {
  const [title, setTitle] = useState(payload.title || '')
  const [description, setDescription] = useState(payload.description || '')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(payload.priority || 'medium')
  const [dueDate, setDueDate] = useState(payload.dueDate || '')
  const [confirmation, setConfirmation] = useState<{ token: string; expiresAt: string; summary: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prepareTask = async () => {
    if (!title.trim() || isSaving || isSaved || uncertain) return
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/portal/elena-chat/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PREPARE_TASK', task: { inquiryId: payload.inquiryId, title: title.trim(), description: description.trim(), priority, dueDate: dueDate || null } }),
      })
      const data = await response.json()
      if (!response.ok || typeof data.confirmation?.token !== 'string' || typeof data.confirmation?.expiresAt !== 'string' || typeof data.confirmation?.summary !== 'string') throw new Error('The task could not be prepared. Please try again.')
      setConfirmation(data.confirmation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The task could not be prepared. Please try again.')
    } finally { setIsSaving(false) }
  }

  const confirmTask = async () => {
    if (!confirmation || isSaving || isSaved || uncertain) return
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/portal/elena-chat/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CONFIRM_TASK', token: confirmation.token }),
      })
      const data = await response.json()
      if (!response.ok || data.success !== true || typeof data.result?.task_id !== 'string' || !data.result.task_id) throw new Error('Unverified result')
      setConfirmation(null)
      setIsSaved(true)
      onSuccess?.('Task created in the CRM.')
    } catch {
      // A response may be lost after a commit; do not enable a blind retry.
      setConfirmation(null)
      setUncertain(true)
      setError('The result could not be verified. Check the task list before requesting this task again.')
    } finally { setIsSaving(false) }
  }

  return (
    <div className="mt-3 w-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
      <div className="flex items-center gap-2 border-b border-[color:var(--portal-border)] px-4 py-3">
        <CheckSquare size={16} className="text-[#a8792f] dark:text-[#f1d27a]" />
        <h4 className="font-sans text-sm font-bold text-[color:var(--portal-text)]">Create task</h4>
      </div>
      <div className="space-y-3 p-4">
        {confirmation ? (
          <div aria-live="polite">
            <p className="mb-2 text-xs font-semibold text-[color:var(--portal-text)]">Review this task before creating it</p>
            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[color:var(--portal-text)]">{confirmation.summary}</p>
            <p className="mt-2 text-xs text-[color:var(--portal-muted)]">This confirmation expires shortly.</p>
          </div>
        ) : !isSaved && !uncertain ? (
          <>
            <p className="text-xs text-[color:var(--portal-muted)]">Linked client: <span className="font-semibold text-[color:var(--portal-text)]">{payload.clientName || 'Verified Luxor client'}</span></p>
            <label className="block text-xs font-semibold text-[color:var(--portal-text)]">Task title
              <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isSaving} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 disabled:opacity-60" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="mb-1 block text-xs font-semibold text-[color:var(--portal-text)]">Priority</span>
                <PortalSelect value={priority} onChange={(value) => setPriority(value as 'low' | 'medium' | 'high')} disabled={isSaving} className="w-full" buttonClassName="!h-9 !rounded-lg !text-left !text-xs" options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
              </div>
              <div><span className="mb-1 block text-xs font-semibold text-[color:var(--portal-text)]">Due date</span>
                <PortalDatePicker value={dueDate} onChange={setDueDate} placeholder="No due date" className="w-full" />
              </div>
            </div>
            <label className="block text-xs font-semibold text-[color:var(--portal-text)]">Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} disabled={isSaving} className="mt-1 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-2.5 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 disabled:opacity-60" />
            </label>
          </>
        ) : null}
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          {confirmation && !uncertain && <button type="button" onClick={() => setConfirmation(null)} disabled={isSaving} className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50">Edit</button>}
          {!isSaved && !uncertain && <button type="button" onClick={confirmation ? confirmTask : prepareTask} disabled={isSaving || !title.trim()} className="luxor-gold-raised inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold !text-white disabled:opacity-50">
            {isSaving && <PortalConstellationLoader size={13} tone="white" />}{confirmation ? 'Confirm task' : 'Review task'}
          </button>}
          {isSaved && <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400"><Check size={13} /> Task added</span>}
        </div>
      </div>
    </div>
  )
}

export type DeveloperSupportSavedAttachment = {
  name: string
  type: string
  kind: 'image' | 'document' | 'text'
  storagePath?: string
  textContent?: string
}

export interface DeveloperSupportCardPayload {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  pagePath?: string
  reporterName?: string
  savedAttachments?: DeveloperSupportSavedAttachment[]
}

export type DeveloperSupportAttachmentCandidate = {
  key: string
  name: string
  type: string
  kind: 'image' | 'document' | 'text'
  dataUrl?: string
  textContent?: string
  storagePath?: string
  chatId?: string | null
}

type DeveloperSupportMessageAttachment = {
  name: string
  type: string
  dataUrl?: string
  textContent?: string
  storagePath?: string
}

type DeveloperSupportComposerAttachment = {
  name: string
  type: string
  dataUrl?: string
  textContent?: string
}

function DeveloperSupportAttachmentThumb({ item }: { item: DeveloperSupportAttachmentCandidate }) {
  const [fetchedSrc, setFetchedSrc] = useState('')
  const src = item.dataUrl || fetchedSrc

  useEffect(() => {
    if (item.dataUrl) return
    if (item.kind !== 'image' || !item.storagePath || !item.chatId) return
    let cancelled = false
    void fetch(
      `/api/portal/elena-chat/attachment?chatId=${encodeURIComponent(item.chatId)}&storagePath=${encodeURIComponent(item.storagePath)}&name=${encodeURIComponent(item.name)}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { url?: string } | null) => {
        if (!cancelled && typeof data?.url === 'string') setFetchedSrc(data.url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [item])

  if (item.kind === 'image' && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className="h-9 w-9 shrink-0 rounded-md border border-[color:var(--portal-border)] object-cover" />
    )
  }
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[#caa24c]">
      <FileText size={14} aria-hidden="true" />
    </span>
  )
}

const DEVELOPER_SUPPORT_PRIORITY_LABEL: Record<'low' | 'medium' | 'high' | 'urgent', string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}

const DEVELOPER_SUPPORT_PRIORITY_CLASS: Record<'low' | 'medium' | 'high' | 'urgent', string> = {
  low: 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]',
  medium: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  high: 'border-[#caa24c]/35 bg-[#caa24c]/12 text-[#8c6529] dark:text-[#f1d27a]',
  urgent: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
}

function DeveloperSupportPagePicker({
  value,
  defaultPath,
  onChange,
  disabled = false,
}: {
  value: string
  defaultPath: string
  onChange: (path: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'area' | 'routes'>('area')
  const [draftArea, setDraftArea] = useState<DeveloperSupportPageArea>(() => getDeveloperSupportPageArea(value))
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reduceMotion = useReducedMotion()
  const area = getDeveloperSupportPageArea(value)
  const pageLabel = labelDeveloperSupportPagePath(value)
  const valueRouteChip = developerSupportRouteChip(value)

  const resetPickerStep = () => setStep('area')

  const closePopover = (immediate = false) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (immediate || reduceMotion) {
      setOpen(false)
      resetPickerStep()
      return
    }
    setOpen(false)
  }

  const selectRoute = (path: string) => {
    setPendingPath(path)
    onChange(path)
    if (reduceMotion) {
      closePopover(true)
      setPendingPath(null)
      return
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      closePopover()
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closePopover()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopover()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, reduceMotion])

  const routeOptions = developerSupportPagesForArea(draftArea, defaultPath)
  const layoutTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.34, ease: PORTAL_MODAL_EASE }
  const stepBlurTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.26, ease: PORTAL_MODAL_EASE }
  const popoverExitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.3, ease: PORTAL_MODAL_EASE }

  const pickArea = (nextArea: DeveloperSupportPageArea) => {
    setDraftArea(nextArea)
    setStep('routes')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (disabled) return
          if (open) {
            closePopover()
            return
          }
          setDraftArea(getDeveloperSupportPageArea(value))
          setStep('area')
          setOpen(true)
        }}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-3 py-2.5 text-left transition-colors hover:border-[#caa24c]/35 hover:bg-[color:var(--portal-soft)] disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">
            Applies to · {area === 'portal' ? 'Portal' : 'Public site'}
          </span>
          <span className="mt-0.5 flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate text-xs font-semibold text-[color:var(--portal-text)]">{pageLabel}</span>
            {valueRouteChip ? (
              <span className="shrink-0 font-mono text-[10px] text-[color:var(--portal-muted)]">{valueRouteChip}</span>
            ) : null}
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-[color:var(--portal-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          if (!open) {
            setPendingPath(null)
            resetPickerStep()
          }
        }}
      >
        {open ? (
          <motion.div
            layout
            role="dialog"
            aria-label="Choose page for this ticket"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -6, scale: reduceMotion ? 1 : 0.98, filter: reduceMotion ? 'blur(0px)' : 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : 0.97, filter: reduceMotion ? 'blur(0px)' : 'blur(10px)' }}
            transition={{
              opacity: popoverExitTransition,
              y: popoverExitTransition,
              scale: popoverExitTransition,
              filter: popoverExitTransition,
              layout: layoutTransition,
            }}
            className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 shadow-2xl backdrop-blur-2xl"
          >
            <motion.div layout="position" className="flex h-9 shrink-0 items-center border-b border-[color:var(--portal-border)] px-3">
              <AnimatePresence mode="wait" initial={false}>
                {step === 'routes' ? (
                  <motion.button
                    key="routes-header"
                    type="button"
                    initial={{ opacity: 0, filter: reduceMotion ? 'blur(0px)' : 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: reduceMotion ? 'blur(0px)' : 'blur(4px)' }}
                    transition={stepBlurTransition}
                    onClick={() => setStep('area')}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-1 text-[11px] font-semibold leading-none text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]"
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                    Back
                  </motion.button>
                ) : (
                  <motion.p
                    key="area-header"
                    initial={{ opacity: 0, filter: reduceMotion ? 'blur(0px)' : 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: reduceMotion ? 'blur(0px)' : 'blur(4px)' }}
                    transition={stepBlurTransition}
                    className="text-[11px] font-semibold leading-none text-[color:var(--portal-text)]"
                  >
                    Choose area
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
            <motion.div
              layout
              transition={{ layout: layoutTransition }}
              className={`overflow-hidden p-2 ${step === 'routes' ? 'max-h-56 overflow-y-auto overscroll-contain portal-scrollbar' : ''}`}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {step === 'area' ? (
                  <motion.div
                    key="area-step"
                    layout
                    initial={{ opacity: 0, filter: reduceMotion ? 'blur(0px)' : 'blur(10px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: reduceMotion ? 'blur(0px)' : 'blur(8px)' }}
                    transition={{ ...stepBlurTransition, layout: layoutTransition }}
                    className="space-y-2"
                  >
                    <button
                      type="button"
                      onClick={() => pickArea('portal')}
                      className="flex w-full items-start gap-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)]/60 p-3 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-[#caa24c]/35 hover:bg-[#caa24c]/8 active:scale-[0.99]"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]">
                        <LayoutDashboard size={16} aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-xs font-semibold text-[color:var(--portal-text)]">Owner portal</span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-[color:var(--portal-muted)]">CRM, calendar, and settings</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => pickArea('public')}
                      className="flex w-full items-start gap-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)]/60 p-3 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-[#caa24c]/35 hover:bg-[#caa24c]/8 active:scale-[0.99]"
                    >
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                        <Globe size={16} aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-xs font-semibold text-[color:var(--portal-text)]">Public website</span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-[color:var(--portal-muted)]">Guest marketing pages</span>
                      </span>
                    </button>
                  </motion.div>
                ) : (
                  <motion.ul
                    key={`routes-${draftArea}`}
                    layout
                    initial={{ opacity: 0, filter: reduceMotion ? 'blur(0px)' : 'blur(10px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: reduceMotion ? 'blur(0px)' : 'blur(8px)' }}
                    transition={{ ...stepBlurTransition, layout: layoutTransition }}
                    className="space-y-1"
                  >
                    {routeOptions.map((option) => {
                      const selected = value === option.path || pendingPath === option.path
                      const routeChip = developerSupportRouteChip(option.path)
                      return (
                        <li key={option.path}>
                          <button
                            type="button"
                            onClick={() => selectRoute(option.path)}
                            className={`flex w-full flex-col items-stretch rounded-lg border px-3 py-2 text-left transition-colors ${selected ? 'border-[#caa24c]/50 bg-[#caa24c]/10' : 'border-transparent hover:border-[color:var(--portal-border)] hover:bg-[color:var(--portal-soft)]'}`}
                          >
                            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-xs font-semibold text-[color:var(--portal-text)]">{option.label}</span>
                              {routeChip ? (
                                <span className="font-mono text-[10px] text-[color:var(--portal-muted)]">{routeChip}</span>
                              ) : null}
                            </span>
                            {option.description ? <span className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">{option.description}</span> : null}
                          </button>
                        </li>
                      )
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function DeveloperSupportTicketReview({
  reporterName,
  title,
  description,
  priority,
  pagePath,
  summaryForScreenReaders,
}: {
  reporterName: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  pagePath: string | null
  summaryForScreenReaders: string
}) {
  return (
    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-3.5">
      <p className="sr-only">{summaryForScreenReaders}</p>
      <dl className="space-y-3 text-xs">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Sending as</dt>
          <dd className="mt-1 font-semibold text-[color:var(--portal-text)]">{reporterName}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Title</dt>
          <dd className="mt-1 font-semibold leading-snug text-[color:var(--portal-text)]">{title}</dd>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Priority</dt>
            <dd className="mt-1.5">
              <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DEVELOPER_SUPPORT_PRIORITY_CLASS[priority]}`}>
                {DEVELOPER_SUPPORT_PRIORITY_LABEL[priority]}
              </span>
            </dd>
          </div>
          <div className="min-w-0 flex-1">
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Page</dt>
            <dd className="mt-1">
              <span className="text-[10px] font-semibold text-[color:var(--portal-muted)]">{getDeveloperSupportPageArea(pagePath) === 'portal' ? 'Portal' : 'Public site'} · </span>
              <span className="font-semibold text-[color:var(--portal-text)]">{labelDeveloperSupportPagePath(pagePath || '/portal')}</span>
              <span className="mt-0.5 block break-all font-mono text-[10px] text-[color:var(--portal-muted)]">{pagePath || '/portal'}</span>
            </dd>
          </div>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Details</dt>
          <dd className="mt-1.5 max-h-44 overflow-y-auto overscroll-contain rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2.5 text-[11px] leading-relaxed text-[color:var(--portal-text)] whitespace-pre-wrap break-words portal-scrollbar">
            {description.trim() || 'No extra details provided.'}
          </dd>
        </div>
      </dl>
      <p className="mt-3 border-t border-[color:var(--portal-border)]/70 pt-3 text-[10px] leading-snug text-[color:var(--portal-muted)]">
        Lewis gets a Cursor automation to investigate and fix the portal.
      </p>
    </div>
  )
}

function DeveloperSupportAttachmentList({
  items,
  selectedKeys,
  disabled,
  onToggle,
  reviewOnly = false,
}: {
  items: DeveloperSupportAttachmentCandidate[]
  selectedKeys?: Set<string>
  disabled?: boolean
  onToggle?: (key: string) => void
  reviewOnly?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[color:var(--portal-text)]">
          {reviewOnly ? 'Sending with this ticket' : 'Include with ticket'}
        </span>
        <span className="text-[10px] text-[color:var(--portal-muted)]">
          {reviewOnly ? `${items.length} file${items.length === 1 ? '' : 's'}` : `${selectedKeys?.size || 0}/5 selected`}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const checked = reviewOnly ? true : Boolean(selectedKeys?.has(item.key))
          return (
            <li key={item.key}>
              <label className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs ${checked ? 'border-[#caa24c]/45 bg-[#caa24c]/8' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-bg)]'} ${reviewOnly ? '' : 'cursor-pointer'}`}>
                {reviewOnly ? null : (
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 shrink-0 rounded border-[color:var(--portal-border)] accent-[#caa24c]"
                    checked={checked}
                    disabled={disabled || (!checked && (selectedKeys?.size || 0) >= 5)}
                    onChange={() => onToggle?.(item.key)}
                  />
                )}
                <DeveloperSupportAttachmentThumb key={item.key} item={item} />
                <span className="min-w-0 flex-1 truncate font-medium text-[color:var(--portal-text)]">{item.name}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

type DeveloperSupportTicketAttachmentPayload = {
  name: string
  type: string
  kind?: 'image' | 'pdf' | 'text'
  storagePath?: string
  dataUrl?: string
  textContent?: string
}

function ticketAttachmentKind(item: DeveloperSupportAttachmentCandidate): 'image' | 'pdf' | 'text' | undefined {
  if (item.kind === 'image') return 'image'
  if (item.kind === 'text') return 'text'
  if (item.kind === 'document') return 'pdf'
  return undefined
}

async function resolveDeveloperSupportAttachmentsForPrepare(
  chatId: string | null,
  items: DeveloperSupportAttachmentCandidate[],
): Promise<DeveloperSupportTicketAttachmentPayload[]> {
  const resolved: DeveloperSupportTicketAttachmentPayload[] = []
  for (const item of items) {
    if (item.storagePath) {
      resolved.push({
        name: item.name,
        type: item.type,
        ...(ticketAttachmentKind(item) ? { kind: ticketAttachmentKind(item) } : {}),
        storagePath: item.storagePath,
        ...(item.textContent ? { textContent: item.textContent } : {}),
      })
      continue
    }
    if (item.textContent) {
      resolved.push({ name: item.name, type: item.type, textContent: item.textContent })
      continue
    }
    if (item.dataUrl) {
      if (!chatId) throw new Error('This Elena chat is not saved yet. Refresh the chat, then add the screenshot again.')
      const blob = await fetch(item.dataUrl).then((response) => response.blob())
      const form = new FormData()
      form.append('chatId', chatId)
      form.append('name', item.name)
      form.append('type', item.type)
      form.append('file', blob, item.name)
      const uploadResponse = await fetch('/api/portal/elena-chat/developer-support-upload', { method: 'POST', body: form })
      const uploadData = await readPortalActionResponse(uploadResponse)
      if (!uploadResponse.ok || typeof uploadData.storagePath !== 'string') {
        throw new Error(typeof uploadData.error === 'string' ? uploadData.error : `Could not upload ${item.name}.`)
      }
      resolved.push({ name: item.name, type: item.type, storagePath: uploadData.storagePath })
      continue
    }
  }
  return resolved
}

export function collectDeveloperSupportAttachmentCandidates(
  messages: Array<{ role: string; attachments?: DeveloperSupportMessageAttachment[] }>,
  composer: DeveloperSupportComposerAttachment[],
  chatId?: string | null,
): DeveloperSupportAttachmentCandidate[] {
  const map = new Map<string, DeveloperSupportAttachmentCandidate>()
  const add = (name: string, type: string, dataUrl?: string, textContent?: string, storagePath?: string) => {
    if (!dataUrl && !textContent && !storagePath) return
    const fingerprint = `${storagePath || ''}:${dataUrl?.slice(0, 48) || ''}:${textContent?.slice(0, 48) || ''}`
    const key = `${name}::${type}::${fingerprint}`
    const isImage = Boolean(type.startsWith('image/') || (dataUrl && dataUrl.startsWith('data:image/')))
    map.set(key, {
      key,
      name,
      type,
      kind: textContent && !storagePath ? 'text' : isImage ? 'image' : 'document',
      ...(dataUrl ? { dataUrl } : {}),
      ...(textContent ? { textContent } : {}),
      ...(storagePath ? { storagePath } : {}),
      ...(chatId ? { chatId } : {}),
    })
  }
  for (const msg of messages) {
    if (msg.role !== 'user' || !msg.attachments?.length) continue
    for (const att of msg.attachments) add(att.name, att.type, att.dataUrl, att.textContent, att.storagePath)
  }
  for (const att of composer) add(att.name, att.type, att.dataUrl, att.textContent)
  return Array.from(map.values()).slice(-5)
}

function savedTicketAttachments(items: DeveloperSupportAttachmentCandidate[]): DeveloperSupportSavedAttachment[] {
  const saved: DeveloperSupportSavedAttachment[] = []
  for (const item of items) {
    if (saved.length >= 5) break
    if (item.storagePath) {
      saved.push({
        name: item.name,
        type: item.type,
        kind: item.kind,
        storagePath: item.storagePath,
        ...(item.textContent ? { textContent: item.textContent.slice(0, 12_000) } : {}),
      })
      continue
    }
    if (item.textContent) {
      saved.push({
        name: item.name,
        type: item.type,
        kind: 'text',
        textContent: item.textContent.slice(0, 12_000),
      })
    }
  }
  return saved
}

function candidatesFromSavedAttachments(
  saved: DeveloperSupportSavedAttachment[] | undefined,
  chatId?: string | null,
): DeveloperSupportAttachmentCandidate[] {
  return (saved || []).map((item) => ({
    key: `saved::${item.storagePath || item.name}`,
    name: item.name,
    type: item.type,
    kind: item.kind,
    ...(item.storagePath ? { storagePath: item.storagePath } : {}),
    ...(item.textContent ? { textContent: item.textContent } : {}),
    ...(chatId ? { chatId } : {}),
  }))
}

export function ElenaDeveloperSupportCard({
  payload,
  attachmentCandidates = [],
  chatId = null,
  onSavedAttachments,
  onSuccess,
}: {
  payload: DeveloperSupportCardPayload
  attachmentCandidates?: DeveloperSupportAttachmentCandidate[]
  chatId?: string | null
  onSavedAttachments?: (items: DeveloperSupportSavedAttachment[]) => void | Promise<void>
  onSuccess?: (msg: string) => void
}) {
  const [title, setTitle] = useState(payload.title || '')
  const [description, setDescription] = useState(payload.description || '')
  const [ticketPagePath, setTicketPagePath] = useState(() => normalizeDeveloperSupportPagePath(payload.pagePath))
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>(payload.priority || 'medium')
  const [confirmation, setConfirmation] = useState<{ token: string; expiresAt: string; summary: string; reporterName: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localAttachments, setLocalAttachments] = useState<DeveloperSupportAttachmentCandidate[]>(() => candidatesFromSavedAttachments(payload.savedAttachments, chatId))
  const [attachmentNotice, setAttachmentNotice] = useState('')
  const [selectedAttachmentKeys, setSelectedAttachmentKeys] = useState<Set<string>>(() => new Set([
    ...attachmentCandidates.map((item) => item.key),
    ...candidatesFromSavedAttachments(payload.savedAttachments, chatId).map((item) => item.key),
  ]))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const detailsRef = useRef<HTMLTextAreaElement>(null)
  const seenChatKeysRef = useRef<Set<string>>(new Set())
  const [, bumpDetailsLayout] = useState(0)

  const attachmentOptions = useMemo(() => {
    const map = new Map<string, DeveloperSupportAttachmentCandidate>()
    for (const item of attachmentCandidates) map.set(item.key, item)
    for (const item of localAttachments) map.set(item.key, item)
    return Array.from(map.values()).slice(0, 5)
  }, [attachmentCandidates, localAttachments])
  const attachmentOptionKey = attachmentCandidates.map((item) => item.key).join('|')

  useEffect(() => {
    setSelectedAttachmentKeys((prev) => {
      const next = new Set(prev)
      for (const item of attachmentCandidates) {
        if (!seenChatKeysRef.current.has(item.key)) next.add(item.key)
      }
      seenChatKeysRef.current = new Set(attachmentCandidates.map((item) => item.key))
      return next
    })
  }, [attachmentOptionKey, attachmentCandidates])

  const toggleAttachment = (key: string) => {
    setSelectedAttachmentKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < 5) next.add(key)
      return next
    })
  }

  const addTicketFiles = async (files: File[]) => {
    if (!files.length || isSaving || isSent || uncertain) return
    setAttachmentNotice('')
    const remainingSlots = 5 - attachmentOptions.length
    if (remainingSlots <= 0) {
      setAttachmentNotice('This ticket already has 5 files. Uncheck one to add another.')
      return
    }
    const rejected: string[] = []
    const next: DeveloperSupportAttachmentCandidate[] = []
    const maxPdf = 8 * 1024 * 1024
    const maxImage = 5 * 1024 * 1024
    const maxText = 512 * 1024

    const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('read failed'))
      reader.readAsDataURL(file)
    })
    const readText = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('read failed'))
      reader.readAsText(file)
    })

    for (const file of files.slice(0, remainingSlots)) {
      const lowerName = file.name.toLowerCase()
      const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
      const isImage = file.type.startsWith('image/')
      const isText = file.type === 'text/plain' || file.type === 'text/csv' || file.type === 'application/csv' || lowerName.endsWith('.txt') || lowerName.endsWith('.csv')
      if (!isPdf && !isImage && !isText) {
        rejected.push(file.name)
        continue
      }
      if (isPdf && file.size > maxPdf) {
        rejected.push(`${file.name} (PDF limit 8 MB)`)
        continue
      }
      if (isImage && file.size > maxImage) {
        rejected.push(`${file.name} (photo limit 5 MB)`)
        continue
      }
      if (isText && file.size > maxText) {
        rejected.push(`${file.name} (text limit 512 KB)`)
        continue
      }
      try {
        const type = isPdf ? 'application/pdf' : file.type || 'text/plain'
        const kind: DeveloperSupportAttachmentCandidate['kind'] = isText ? 'text' : isImage ? 'image' : 'document'
        const textContent = isText ? await readText(file) : undefined
        let storagePath: string | undefined
        let dataUrl: string | undefined
        if (!isText) {
          if (!chatId) throw new Error('This Elena chat is not saved yet. Refresh the chat, then add the file again.')
          const form = new FormData()
          form.append('chatId', chatId)
          form.append('name', file.name)
          form.append('type', type)
          form.append('file', file, file.name)
          const uploadResponse = await fetch('/api/portal/elena-chat/developer-support-upload', { method: 'POST', body: form })
          const uploadData = await readPortalActionResponse(uploadResponse)
          if (!uploadResponse.ok || typeof uploadData.storagePath !== 'string') {
            throw new Error(typeof uploadData.error === 'string' ? uploadData.error : 'upload failed')
          }
          storagePath = uploadData.storagePath
          dataUrl = await readDataUrl(file)
        }
        const key = `saved::${storagePath || file.name}::${crypto.randomUUID()}`
        next.push({
          key,
          name: file.name,
          type,
          kind,
          ...(chatId ? { chatId } : {}),
          ...(dataUrl ? { dataUrl } : {}),
          ...(storagePath ? { storagePath } : {}),
          ...(textContent ? { textContent } : {}),
        })
      } catch (error) {
        rejected.push(error instanceof Error && error.message !== 'read failed' ? `${file.name} (${error.message})` : file.name)
      }
    }

    if (next.length > 0) {
      const persisted = [...localAttachments, ...next].slice(0, 5)
      setLocalAttachments(persisted)
      setSelectedAttachmentKeys((prev) => {
        const selected = new Set(prev)
        for (const item of next) selected.add(item.key)
        return selected
      })
      try {
        await onSavedAttachments?.(savedTicketAttachments(persisted))
      } catch (error) {
        setAttachmentNotice(error instanceof Error ? error.message : 'The file uploaded, but the chat could not remember it. Add it again after refreshing.')
      }
    }
    if (rejected.length > 0) {
      setAttachmentNotice(
        rejected.length === 1
          ? `Could not attach ${rejected[0]}. Use a photo, PDF, or .txt/.csv under the size limit.`
          : `Some files were skipped: ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}.`,
      )
    }
    if (files.length > remainingSlots && remainingSlots > 0) {
      setAttachmentNotice('This ticket can include 5 files. Extra files were not added.')
    }
  }

  const selectedAttachments = attachmentOptions.filter((item) => selectedAttachmentKeys.has(item.key))

  const reduceMotion = useReducedMotion()
  const layoutEase = PORTAL_MODAL_EASE
  const layoutDuration = reduceMotion ? 0 : 0.38
  const contentDuration = reduceMotion ? 0 : 0.3
  const supportCardPhase = isSent ? 'sent' : uncertain ? 'uncertain' : confirmation ? 'review' : 'compose'

  useEffect(() => {
    const el = detailsRef.current
    if (!el || supportCardPhase !== 'compose') return
    const observer = new ResizeObserver(() => bumpDetailsLayout((value) => value + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [supportCardPhase])

  const issuePrepareRequest = async (): Promise<boolean> => {
    const attachments = await resolveDeveloperSupportAttachmentsForPrepare(chatId, selectedAttachments)
    const trimmedDescription = description.trim()
    const response = await fetch('/api/portal/elena-chat/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'PREPARE_DEVELOPER_SUPPORT',
        ticket: {
          title: title.trim(),
          description: trimmedDescription || null,
          priority,
          pagePath: ticketPagePath || null,
          attachments,
        },
      }),
    })
    const data = await readPortalActionResponse(response)
    const nextConfirmation = data.confirmation as Record<string, unknown> | undefined
    if (
      !response.ok
      || typeof nextConfirmation?.token !== 'string'
      || typeof nextConfirmation?.expiresAt !== 'string'
      || typeof nextConfirmation?.summary !== 'string'
    ) {
      throw new Error(typeof data.error === 'string' ? data.error : 'The support ticket could not be prepared. Please try again.')
    }
    const reporterName = typeof nextConfirmation.reporterName === 'string'
      ? nextConfirmation.reporterName
      : (nextConfirmation.summary.match(/^Send developer support ticket as (.+)$/m)?.[1]?.replace(/^"|"$/g, '') || 'Luxor owner')
    setConfirmation({
      token: nextConfirmation.token,
      expiresAt: nextConfirmation.expiresAt,
      summary: nextConfirmation.summary,
      reporterName,
    })
    return true
  }

  const refreshConfirmationAfterExpiry = async (): Promise<boolean> => {
    setConfirmation(null)
    try {
      await issuePrepareRequest()
      return true
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'The review could not be refreshed. Tap Review ticket to try again.')
      return false
    }
  }

  const prepareTicket = async () => {
    if (!title.trim() || isSaving || isSent || uncertain) return
    setIsSaving(true)
    setError(null)
    try {
      await issuePrepareRequest()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The support ticket could not be prepared. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const confirmTicket = async () => {
    if (!confirmation || isSaving || isSent || uncertain) return
    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/portal/elena-chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CONFIRM_DEVELOPER_SUPPORT', token: confirmation.token }),
      })
      const data = await readPortalActionResponse(response)
      const expired = response.status === 410 || data.code === 'confirmation_expired'
      if (!response.ok || data.success !== true) {
        if (expired) {
          const refreshed = await refreshConfirmationAfterExpiry()
          if (refreshed) {
            setError(null)
            return
          }
        }
        throw new Error(typeof data.error === 'string' ? data.error : 'Unverified result')
      }
      setConfirmation(null)
      setIsSent(true)
      onSuccess?.('Support ticket sent to Braxton. The cloud worker will pick it up.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The ticket may or may not have been sent. Ask before sending another copy.'
      const expired = /expired|confirmation unavailable/i.test(message)
      if (expired) {
        const refreshed = await refreshConfirmationAfterExpiry()
        if (refreshed) {
          setError(null)
          return
        }
        setUncertain(false)
        setError('This confirmation expired. We could not refresh it automatically. Tap Review ticket to try again.')
        return
      }
      setConfirmation(null)
      setUncertain(true)
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <motion.div
      layout
      transition={{ layout: { duration: layoutDuration, ease: layoutEase } }}
      className="mt-3 w-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"
    >
      <motion.div layout="position" className="flex items-center gap-2 border-b border-[color:var(--portal-border)] px-4 py-3">
        <Wrench size={16} className="text-[#a8792f] dark:text-[#f1d27a]" aria-hidden="true" />
        <div>
          <h4 className="font-sans text-sm font-bold text-[color:var(--portal-text)]">Developer support</h4>
          <p className="text-[10px] text-[color:var(--portal-muted)]">Sends a fix to Braxton in the cloud</p>
        </div>
      </motion.div>
      <motion.div layout className="space-y-3 p-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {(supportCardPhase === 'review' || supportCardPhase === 'compose') ? (
            <motion.div
              key={supportCardPhase}
              layout
              aria-live="polite"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              transition={{ duration: contentDuration, ease: layoutEase, layout: { duration: layoutDuration, ease: layoutEase } }}
              className="space-y-3"
            >
              {supportCardPhase === 'review' && confirmation ? (
                <>
                  <motion.div layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: contentDuration, delay: reduceMotion ? 0 : 0.04 }}>
                    <p className="text-xs font-semibold text-[color:var(--portal-text)]">Review before sending</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-[color:var(--portal-muted)]">Confirm the summary below, then send to the developer.</p>
                  </motion.div>
                  <motion.div layout transition={{ layout: { duration: layoutDuration, ease: layoutEase } }}>
                    <DeveloperSupportTicketReview
                      reporterName={confirmation.reporterName}
                      title={title.trim()}
                      description={description}
                      priority={priority}
                      pagePath={ticketPagePath || null}
                      summaryForScreenReaders={confirmation.summary}
                    />
                  </motion.div>
                  <motion.div layout transition={{ layout: { duration: layoutDuration, ease: layoutEase } }}>
                    {selectedAttachments.length > 0 ? (
                      <DeveloperSupportAttachmentList items={selectedAttachments} reviewOnly />
                    ) : (
                      <p className="text-[10px] leading-snug text-[color:var(--portal-muted)]">No files are attached to this ticket.</p>
                    )}
                  </motion.div>
                  <p className="text-[10px] text-[color:var(--portal-muted)]">This confirmation expires shortly.</p>
                </>
              ) : (
                <>
                  <motion.div layout transition={{ layout: { duration: layoutDuration, ease: layoutEase } }}>
                    <DeveloperSupportPagePicker
                      value={ticketPagePath}
                      defaultPath={normalizeDeveloperSupportPagePath(payload.pagePath)}
                      onChange={setTicketPagePath}
                      disabled={isSaving}
                    />
                  </motion.div>
                  <label className="block text-xs font-semibold text-[color:var(--portal-text)]">
                    What needs fixing?
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={isSaving}
                      className="mt-1 min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-3.5 py-2 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 disabled:opacity-60 sm:min-h-9"
                    />
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-[color:var(--portal-text)]">Priority</span>
                    <PortalSelect
                      value={priority}
                      onChange={(value) => setPriority(value as 'low' | 'medium' | 'high' | 'urgent')}
                      disabled={isSaving}
                      className="w-full"
                      buttonClassName="!h-9 !rounded-lg !text-left !text-xs"
                      options={[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                        { value: 'urgent', label: 'Urgent' },
                      ]}
                    />
                  </div>
                  <motion.label
                    layout
                    transition={{ layout: { duration: layoutDuration, ease: layoutEase } }}
                    className="block text-xs font-semibold text-[color:var(--portal-text)]"
                  >
                    Extra details
                    <textarea
                      ref={detailsRef}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      disabled={isSaving}
                      placeholder="What happened? What did you expect?"
                      className="mt-1 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-2.5 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 disabled:opacity-60"
                    />
                  </motion.label>
                  <motion.div layout transition={{ layout: { duration: layoutDuration, ease: layoutEase } }} className="space-y-2">
                    {attachmentOptions.length > 0 ? (
                      <DeveloperSupportAttachmentList
                        items={attachmentOptions}
                        selectedKeys={selectedAttachmentKeys}
                        disabled={isSaving}
                        onToggle={toggleAttachment}
                      />
                    ) : (
                      <p className="text-[10px] leading-snug text-[color:var(--portal-muted)]">
                        Add a screenshot or PDF so Braxton can see the issue.
                      </p>
                    )}
                    {attachmentNotice ? <p role="status" className="text-[10px] leading-snug text-[color:var(--portal-muted)]">{attachmentNotice}</p> : null}
                  </motion.div>
                </>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {error ? (
            <motion.p
              key="dev-support-error"
              role="alert"
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: layoutEase, layout: { duration: layoutDuration, ease: layoutEase } }}
              className="overflow-hidden text-xs text-red-600 dark:text-red-400"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>
        <motion.div layout="position" transition={{ layout: { duration: layoutDuration, ease: layoutEase } }} className="flex items-stretch justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.pdf,text/plain,text/csv,.txt,.csv"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.target.files
              if (files?.length) void addTicketFiles(Array.from(files))
              event.target.value = ''
            }}
          />
          <AnimatePresence mode="popLayout" initial={false}>
            {confirmation && !uncertain ? (
              <motion.button
                key="edit-ticket"
                type="button"
                layout
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: layoutEase, layout: { duration: layoutDuration, ease: layoutEase } }}
                onClick={() => setConfirmation(null)}
                disabled={isSaving}
                className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50"
              >
                Edit
              </motion.button>
            ) : null}
            {!confirmation && !isSent && !uncertain ? (
              <motion.button
                key="add-attachment"
                type="button"
                layout
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: layoutEase, layout: { duration: layoutDuration, ease: layoutEase } }}
                disabled={isSaving || attachmentOptions.length >= 5}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-10 items-center gap-2 self-stretch rounded-lg border-0 bg-[color:var(--portal-soft)] px-4 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-border)]/40 disabled:opacity-50"
              >
                <Plus size={14} aria-hidden="true" />
                Add screenshot or PDF
              </motion.button>
            ) : null}
            {!isSent && !uncertain ? (
              <motion.button
                key={confirmation ? 'send-ticket' : 'review-ticket'}
                type="button"
                layout
                initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: layoutEase, layout: { duration: layoutDuration, ease: layoutEase } }}
                onClick={confirmation ? confirmTicket : prepareTicket}
                disabled={isSaving || !title.trim()}
                className="luxor-gold-raised inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold !text-white disabled:opacity-50"
              >
                {isSaving && <PortalConstellationLoader size={13} tone="white" />}
                <motion.span
                  key={confirmation ? 'send-label' : 'review-label'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                >
                  {confirmation ? 'Send to developer' : 'Review ticket'}
                </motion.span>
              </motion.button>
            ) : null}
            {isSent ? (
              <motion.span
                key="sent"
                layout
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.28, ease: layoutEase, layout: { duration: layoutDuration, ease: layoutEase } }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400"
              >
                <Check size={13} /> Ticket sent
              </motion.span>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
