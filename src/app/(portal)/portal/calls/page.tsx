'use client'

import {
  Clock3,
  Headphones,
  Loader2,
  Mic2,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
  Search,
  Voicemail,
} from 'lucide-react'
import Link from 'next/link'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { PortalButton, PortalPageFrame, PortalPageHeader, PortalSelect } from '@/components/portal/PortalUI'
import { usePortalVoice } from '@/components/portal/PortalVoiceProvider'
import { useToast } from '@/components/portal/ToastProvider'
import type { LuxorCall } from '@/lib/luxorCallTypes'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'

type DirectionFilter = 'all' | 'inbound' | 'outbound' | 'voicemail' | 'missed'

const OUTCOME_OPTIONS = [
  { value: '', label: 'No outcome selected' },
  { value: 'connected', label: 'Connected' },
  { value: 'left_voicemail', label: 'Left voicemail' },
  { value: 'tour_scheduled', label: 'Tour scheduled' },
  { value: 'follow_up', label: 'Follow up' },
  { value: 'booked', label: 'Booked' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'wrong_number', label: 'Wrong number' },
]

export default function CallsPage() {
  const { notify } = useToast()
  const { openPanel, phoneState } = usePortalVoice()
  const [calls, setCalls] = useState<LuxorCall[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<DirectionFilter>('all')
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState('')

  const loadCalls = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch('/api/twilio/calls?limit=500', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => []) as LuxorCall[] | { error?: string }
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(!Array.isArray(payload) ? payload.error : 'Unable to load calls.')
      }
      setCalls(payload)
      setSelectedId((current) => current && payload.some((call) => call.id === current) ? current : payload[0]?.id || null)
    } catch (error) {
      notify({
        title: 'Call history unavailable',
        description: error instanceof Error ? error.message : 'Unable to load calls.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void loadCalls()
    const refresh = () => void loadCalls(true)
    window.addEventListener('luxor-call-history-refresh', refresh)
    return () => window.removeEventListener('luxor-call-history-refresh', refresh)
  }, [loadCalls])

  const filteredCalls = useMemo(() => {
    const query = search.trim().toLowerCase()
    return calls.filter((call) => {
      if (filter === 'inbound' && call.direction !== 'inbound') return false
      if (filter === 'outbound' && call.direction !== 'outbound') return false
      if (filter === 'voicemail' && !call.is_voicemail) return false
      if (filter === 'missed' && !isMissed(call)) return false
      if (!query) return true
      return [call.contact_name, call.caller_number, call.callee_number, call.outcome]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [calls, filter, search])

  const selectedCall = calls.find((call) => call.id === selectedId) || null

  useEffect(() => {
    if (!selectedCall) return
    setNotes(selectedCall.notes || '')
    setOutcome(selectedCall.outcome || '')
    if (selectedCall.direction === 'inbound' && !selectedCall.is_read) {
      void updateCall(selectedCall.id, { isRead: true }, false)
    }
    // The selected call ID is the intentional boundary for loading editable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCall?.id])

  async function updateCall(id: string, updates: { isRead?: boolean; notes?: string | null; outcome?: string | null }, showToast = true) {
    setSaving(true)
    try {
      const response = await fetch('/api/twilio/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      const updated = await response.json() as LuxorCall & { error?: string }
      if (!response.ok) throw new Error(updated.error || 'Unable to update call.')
      setCalls((current) => current.map((call) => call.id === id ? updated : call))
      window.dispatchEvent(new Event('luxor-call-history-refresh'))
      if (showToast) notify({ title: 'Call updated', description: 'Notes and outcome were saved.', variant: 'success' })
    } catch (error) {
      notify({ title: 'Call update failed', description: error instanceof Error ? error.message : 'Unable to update call.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(() => ({
    total: calls.length,
    inbound: calls.filter((call) => call.direction === 'inbound').length,
    outbound: calls.filter((call) => call.direction === 'outbound').length,
    missed: calls.filter(isMissed).length,
    voicemail: calls.filter((call) => call.is_voicemail).length,
  }), [calls])

  return (
    <PortalPageFrame>
      <PortalPageHeader
        icon={<PhoneCall size={20} />}
        title="Calls & Voicemail"
        description="Every inbound and outbound Luxor call, matched to the lead whenever the phone number is known."
        actions={(
          <>
            <PortalButton onClick={() => void loadCalls()}>
              <RefreshCw size={14} /> Refresh
            </PortalButton>
            <PortalButton variant="primary" onClick={openPanel}>
              <Phone size={14} /> New Call
            </PortalButton>
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="All Calls" value={stats.total} icon={<Headphones size={15} />} />
        <MetricCard label="Inbound" value={stats.inbound} icon={<PhoneIncoming size={15} />} />
        <MetricCard label="Outbound" value={stats.outbound} icon={<PhoneOutgoing size={15} />} />
        <MetricCard label="Missed" value={stats.missed} icon={<PhoneMissed size={15} />} />
        <MetricCard label="Voicemail" value={stats.voicemail} icon={<Voicemail size={15} />} />
      </div>

      <div className="grid min-h-[34rem] flex-1 grid-cols-1 overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] lg:grid-cols-[minmax(20rem,0.9fr)_minmax(24rem,1.1fr)]">
        <section className="flex min-h-0 flex-col border-b border-[color:var(--portal-border)] lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-[color:var(--portal-border)] p-4">
            <div className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3">
              <Search size={14} className="text-zinc-600" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or number" className="h-10 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-zinc-650" />
            </div>
            <div className="flex gap-2 overflow-x-auto portal-scrollbar">
              {(['all', 'inbound', 'outbound', 'missed', 'voicemail'] as DirectionFilter[]).map((value) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${filter === value ? 'border-[#caa24c]/35 bg-[#caa24c]/10 text-[#f1d27a]' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto portal-scrollbar">
            {loading ? (
              <div className="flex h-full min-h-64 items-center justify-center gap-2 text-xs text-zinc-500"><Loader2 size={16} className="animate-spin" /> Loading calls</div>
            ) : filteredCalls.length === 0 ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center"><Phone size={28} className="text-zinc-800" /><p className="mt-3 text-sm font-bold text-zinc-400">No calls found</p><p className="mt-1 text-xs text-zinc-600">Calls will appear here after the Twilio setup is connected.</p></div>
            ) : filteredCalls.map((call) => (
              <button key={call.id} type="button" onClick={() => setSelectedId(call.id)} className={`flex w-full items-start gap-3 border-b border-[color:var(--portal-border)] px-4 py-4 text-left transition-colors ${selectedId === call.id ? 'bg-[#caa24c]/7' : 'hover:bg-[color:var(--portal-soft)]'}`}>
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${isMissed(call) ? 'border-red-500/20 bg-red-500/8 text-red-400' : call.direction === 'inbound' ? 'border-blue-500/20 bg-blue-500/8 text-blue-400' : 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400'}`}>
                  {call.is_voicemail ? <Voicemail size={15} /> : call.direction === 'inbound' ? <PhoneIncoming size={15} /> : <PhoneOutgoing size={15} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className={`truncate text-xs font-black ${!call.is_read && call.direction === 'inbound' ? 'text-white' : 'text-zinc-300'}`}>{call.contact_name || 'Unknown caller'}</p>
                    {!call.is_read && call.direction === 'inbound' && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#caa24c]" />}
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-zinc-600">{formatPhoneDisplay(call.direction === 'inbound' ? call.caller_number : call.callee_number)}</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-zinc-600">
                    <span className="capitalize">{call.status.replace('-', ' ')}</span>
                    <span>{formatRelativeDate(call.created_at)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto p-5 portal-scrollbar sm:p-7">
          {selectedCall ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] pb-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">{selectedCall.direction} call</p>
                  <h2 className="mt-2 text-xl font-black text-white">{selectedCall.contact_name || 'Unknown caller'}</h2>
                  <p className="mt-1 font-mono text-xs text-zinc-500">{formatPhoneDisplay(selectedCall.direction === 'inbound' ? selectedCall.caller_number : selectedCall.callee_number)}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-wider ${isMissed(selectedCall) ? 'border-red-500/20 bg-red-500/8 text-red-400' : 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400'}`}>{selectedCall.status.replace('-', ' ')}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Detail label="Started" value={formatDateTime(selectedCall.started_at)} />
                <Detail label="Duration" value={formatDuration(selectedCall.duration_seconds)} />
                <Detail label="Direction" value={selectedCall.direction} />
                <Detail label="Phone" value={phoneState === 'ready' ? 'Browser ready' : 'Browser offline'} />
              </div>

              {selectedCall.inquiry_id && (
                <Link href={`/portal/leads/${selectedCall.inquiry_id}`} className="flex items-center justify-between rounded-xl border border-[#caa24c]/15 bg-[#caa24c]/5 px-4 py-3 text-xs font-bold text-[#f1d27a] hover:border-[#caa24c]/30">
                  Open matched Luxor lead <span>→</span>
                </Link>
              )}

              {selectedCall.recording_sid && (
                <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                  <div className="flex items-center gap-2"><Mic2 size={15} className="text-[#caa24c]" /><p className="text-xs font-black text-white">Voicemail recording</p></div>
                  <audio controls preload="none" className="mt-3 w-full" src={`/api/twilio/recordings/${selectedCall.recording_sid}`}>Your browser does not support audio playback.</audio>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Call outcome</label>
                <PortalSelect value={outcome} onChange={setOutcome} options={OUTCOME_OPTIONS} />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Call notes</label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} placeholder="What was discussed and what happens next?" className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-[#caa24c]/35" />
              </div>
              <button type="button" onClick={() => void updateCall(selectedCall.id, { notes: notes.trim() || null, outcome: outcome || null })} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#caa24c] text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#dfbd68] disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Clock3 size={14} />} Save call details
              </button>
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center text-center"><Phone size={30} className="text-zinc-800" /><p className="mt-3 text-sm font-bold text-zinc-400">Select a call</p><p className="mt-1 text-xs text-zinc-600">Details, voicemail, and notes will appear here.</p></div>
          )}
        </section>
      </div>
    </PortalPageFrame>
  )
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4"><div className="flex items-center justify-between text-[#caa24c]">{icon}<span className="font-mono text-xl font-black text-white">{value}</span></div><p className="mt-2 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">{label}</p></div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3"><p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">{label}</p><p className="mt-1 truncate text-[11px] font-bold capitalize text-zinc-300">{value}</p></div>
}

function isMissed(call: LuxorCall) {
  return call.direction === 'inbound' && ['busy', 'failed', 'no-answer', 'canceled'].includes(call.status)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatRelativeDate(value: string) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'Unknown'
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
