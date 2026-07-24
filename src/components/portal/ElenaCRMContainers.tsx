'use client'

import React, { useState } from 'react'
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
  Users
} from 'lucide-react'

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
  
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApply = async () => {
    if (isUpdating || isDone) return
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
            <select
              value={pipelineStage}
              onChange={(e) => setPipelineStage(e.target.value)}
              disabled={isDone}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#caa24c] disabled:opacity-60"
            >
              <option value="inquiry">1. Inquiry</option>
              <option value="tour">2. Tour Requested / Attended</option>
              <option value="proposal_sent">3. Proposal Sent</option>
              <option value="book_reserve">4. Book & Reserve</option>
              <option value="planning_begins">5. Planning Begins</option>
              <option value="final_details">6. Final Details</option>
              <option value="setup_event_day">7. Event Day</option>
              <option value="after_event">8. After Event</option>
              <option value="closed_lost">Closed / Lost</option>
            </select>
          </div>

          {/* Inquiry Status Select */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Lead Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={isDone}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#caa24c] disabled:opacity-60"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="tour_requested">Tour Requested</option>
              <option value="tour_confirmed">Tour Confirmed</option>
              <option value="proposal_sent">Proposal Sent</option>
              <option value="booked">Booked</option>
              <option value="closed_lost">Closed Lost</option>
            </select>
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
              className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#f1d27a] text-zinc-950 px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isUpdating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
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
        onSuccess(`Sent event contract signature request to **${payload.clientEmail}**! 📄✍️`)
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
            <span className="text-[10px] text-zinc-500 font-mono">Zoho Delivery Active</span>
          )}

          {!sent ? (
            <button
              type="button"
              onClick={handleSendContract}
              disabled={isSending}
              className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#f1d27a] text-zinc-950 px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              <span>Send Contract Email</span>
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
        onSuccess(`Sent proposal/invoice with payment link to **${payload.clientName}**! 💳✨`)
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
            <h4 className="text-xs font-semibold text-zinc-200">Luxor Invoice & Payment</h4>
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
              className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#f1d27a] text-zinc-950 px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
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
  inquiryId?: string
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  dueDate?: string
}

export function ElenaTaskCard({
  payload,
  onSuccess
}: {
  payload: TaskCardPayload
  onSuccess?: (msg: string) => void
}) {
  const [title, setTitle] = useState(payload.title || '')
  const [description, setDescription] = useState(payload.description || '')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(payload.priority || 'medium')
  const [dueDate, setDueDate] = useState(payload.dueDate || '')

  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSaveTask = async () => {
    if (!title.trim() || isSaving || isSaved) return
    setIsSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/portal/elena-chat/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_TASK',
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          inquiryId: payload.inquiryId
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create task')

      setIsSaved(true)
      if (onSuccess) {
        onSuccess(`Created task **"${title.trim()}"** in your CRM! 📌`)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Task creation failed')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-full mt-3 overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-[#0a0807]/90 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[#caa24c]/15 bg-[#caa24c]/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#caa24c]/20 border border-[#caa24c]/30 text-[#f1d27a]">
            <CheckSquare size={14} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">Elena CRM Operational Task</h4>
            <p className="text-[10px] text-zinc-400">Add to Owner Task Pipeline</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Task Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call caterer regarding Sarah's menu"
            disabled={isSaved}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#caa24c] font-medium disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
              disabled={isSaved}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#caa24c] disabled:opacity-60 capitalize"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isSaved}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#caa24c] disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1">Description / Notes</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Additional notes for this task..."
            disabled={isSaved}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600 resize-none disabled:opacity-60"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          {!isSaved ? (
            <button
              type="button"
              onClick={handleSaveTask}
              disabled={isSaving || !title.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#f1d27a] text-zinc-950 px-4 py-1.5 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : <CheckSquare size={13} />}
              <span>Save Task to CRM</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-green-500/40 bg-green-500/20 px-3 py-1.5 text-xs font-semibold text-green-400">
              <Check size={13} /> Task Added
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
