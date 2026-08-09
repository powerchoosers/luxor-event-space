'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Download, RefreshCw, Search } from 'lucide-react'
import { PortalButton, PortalPageFrame, PortalPageHeader, PortalSelect, PortalTableCard, PortalStickyTable, PortalStickyThead } from '@/components/portal/PortalUI'
import type { LuxorGrandOpeningAttendee } from '@/lib/luxorInquiryTypes'

export default function GrandOpeningAttendancePage() {
  const [attendees, setAttendees] = useState<LuxorGrandOpeningAttendee[]>([])
  const [query, setQuery] = useState('')
  const [attendeeType, setAttendeeType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newType, setNewType] = useState('guest')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (attendeeType) params.set('type', attendeeType)
      const response = await fetch(`/api/portal/grand-opening-attendance?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Attendance could not be loaded.')
      setAttendees(Array.isArray(payload.attendees) ? payload.attendees : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Attendance could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [attendeeType, query])

  useEffect(() => { void load() }, [load])

  const downloadCsv = () => {
    const params = new URLSearchParams({ format: 'csv' })
    if (query.trim()) params.set('q', query.trim())
    if (attendeeType) params.set('type', attendeeType)
    window.location.assign(`/api/portal/grand-opening-attendance?${params.toString()}`)
  }

  return (
    <PortalPageFrame className="gap-6">
      <PortalPageHeader
        icon={<ClipboardCheck size={18} />}
        title="Grand Opening Attendance"
        description="Private historical check-ins retained after the public RSVP experience was retired."
        actions={(
          <div className="flex flex-wrap gap-2">
            <PortalButton onClick={() => void load()} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</PortalButton>
            <PortalButton onClick={downloadCsv}><Download size={13} /> Export CSV</PortalButton>
            <PortalButton onClick={() => setShowAdd((value) => !value)}><ClipboardCheck size={13} /> Add record</PortalButton>
          </div>
        )}
      />

      {showAdd ? <form onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(null); try { const response = await fetch('/api/portal/grand-opening-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: newName, phone: newPhone, attendeeType: newType }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Attendance could not be saved.'); setNewName(''); setNewPhone(''); setShowAdd(false); await load() } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Attendance could not be saved.') } finally { setSaving(false) } }} className="grid gap-3 rounded-xl border border-[#caa24c]/25 bg-[#caa24c]/5 p-4 sm:grid-cols-[1.4fr_1fr_180px_auto] sm:items-end">
        <label><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Attendee name</span><input required minLength={2} value={newName} onChange={(event) => setNewName(event.target.value)} className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/60" /></label>
        <label><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Phone</span><input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/60" /></label>
        <label><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Type</span><PortalSelect value={newType} onChange={setNewType} options={[{ value: 'rsvp', label: 'RSVP' }, { value: 'guest', label: 'Guest' }]} /></label>
        <PortalButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save record'}</PortalButton>
      </form> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Search by name</span>
          <span className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-faint)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search attendees" className="min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] pl-9 pr-3 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/60" />
          </span>
        </label>
        <label className="w-full sm:w-48">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Attendee type</span>
          <PortalSelect value={attendeeType} onChange={setAttendeeType} placeholder="All attendees" options={[{ value: 'rsvp', label: 'RSVP' }, { value: 'guest', label: 'Guest' }]} />
        </label>
      </div>

      {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-500">{error}</div> : null}

      <PortalTableCard>
        <PortalStickyTable>
          <PortalStickyThead>
            <tr><th>Name</th><th>Phone</th><th>Type</th><th>Checked in</th><th>Recorded by</th></tr>
          </PortalStickyThead>
          <tbody>
            {attendees.map((attendee) => (
              <tr key={attendee.id} className="border-t border-[color:var(--portal-border)] transition-colors hover:bg-[#caa24c]/[0.04]">
                <td className="px-4 py-4 font-semibold text-[color:var(--portal-text)]">{attendee.full_name}</td>
                <td className="px-4 py-4 text-[color:var(--portal-muted)]">{attendee.phone || '—'}</td>
                <td className="px-4 py-4 capitalize text-[color:var(--portal-muted)]">{attendee.attendee_type}</td>
                <td className="px-4 py-4 font-mono text-xs text-[color:var(--portal-muted)]">{formatDate(attendee.checked_in_at)}</td>
                <td className="px-4 py-4 capitalize text-[color:var(--portal-muted)]">{attendee.checked_in_by}</td>
              </tr>
            ))}
            {!loading && attendees.length === 0 ? <tr><td colSpan={5} className="px-6 py-16 text-center text-sm text-[color:var(--portal-muted)]">No historical check-ins are stored yet.</td></tr> : null}
            {loading ? <tr><td colSpan={5} className="px-6 py-16 text-center text-sm text-[color:var(--portal-muted)]">Loading attendance…</td></tr> : null}
          </tbody>
        </PortalStickyTable>
      </PortalTableCard>
    </PortalPageFrame>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
