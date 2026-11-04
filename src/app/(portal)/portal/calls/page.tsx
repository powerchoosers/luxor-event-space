'use client'

import {
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Delete,
  ExternalLink,
  FileText,
  Grid,
  Loader2,
  Mail,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Trash2,
  User,
  Voicemail,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  PortalContactAvatar,
  PortalSelect,
} from '@/components/portal/PortalUI'
import { PortalAudioPlayer } from '@/components/portal/PortalAudioPlayer'
import { usePortalVoice } from '@/components/portal/PortalVoiceProvider'
import { useToast } from '@/components/portal/ToastProvider'
import type { LuxorCall } from '@/lib/luxorCallTypes'
import {
  formatPhoneDisplay,
  formatUsDialInput,
  removeLastDialDigit,
  toUsE164,
} from '@/lib/luxorPhoneClient'
import {
  PortalBulkActionDeck,
  PortalBulkChoiceDialog,
  PortalBulkConfirmDialog,
  PortalBulkHeaderSelector,
  PortalBulkRowSelector,
  usePortalBulkSelection,
} from '@/components/portal/PortalBulkSelection'

type PhoneAppTab = 'recents' | 'voicemail' | 'keypad'
type RecentsFilter = 'all' | 'missed'
type ReaderTab = 'transcript' | 'summary'

const OUTCOME_OPTIONS = [
  { value: '', label: 'No outcome logged' },
  { value: 'connected', label: 'Connected' },
  { value: 'left_voicemail', label: 'Left voicemail' },
  { value: 'tour_scheduled', label: 'Tour scheduled' },
  { value: 'follow_up', label: 'Follow up' },
  { value: 'booked', label: 'Booked' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'wrong_number', label: 'Wrong number' },
]

const KEYPAD_KEYS: Array<{ digit: string; letters?: string }> = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*' },
  { digit: '0', letters: '+' },
  { digit: '#' },
]

export default function CallsPage() {
  const { notify } = useToast()
  const { openPanel, phoneState, startCall, enablePhone, activeCall, isStartingCall, startingCallTarget } = usePortalVoice()
  const reduceMotion = useReducedMotion()
  const showCall = Boolean(activeCall) || isStartingCall

  const [calls, setCalls] = useState<LuxorCall[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [expandedVoicemailId, setExpandedVoicemailId] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<PhoneAppTab>('recents')
  const [recentsFilter, setRecentsFilter] = useState<RecentsFilter>('all')
  const [readerTab, setReaderTab] = useState<ReaderTab>('transcript')
  const [isEditingList, setIsEditingList] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [search, setSearch] = useState('')
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState('')

  // Keypad state
  const [keypadInput, setKeypadInput] = useState('')

  // Bulk selection state
  const bulkSelection = usePortalBulkSelection<string>()
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkOutcomeOpen, setBulkOutcomeOpen] = useState(false)
  const [bulkOutcome, setBulkOutcome] = useState('follow_up')

  // Audio playback synchronization
  const [targetSeekTime, setTargetSeekTime] = useState<number | null>(null)
  const [currentPlayheadTime, setCurrentPlayheadTime] = useState(0)

  const loadCalls = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch('/api/twilio/calls?limit=500', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      const payload = (await response.json().catch(() => [])) as LuxorCall[] | { error?: string }
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(!Array.isArray(payload) ? payload.error : 'Unable to load calls.')
      }
      setCalls(payload)
      setSelectedId((current) =>
        current && payload.some((call) => call.id === current) ? current : payload[0]?.id || null,
      )
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

  const unreadMissedCount = useMemo(
    () => calls.filter((c) => isMissed(c) && !c.is_read).length,
    [calls],
  )
  const unreadVoicemailCount = useMemo(
    () => calls.filter((c) => c.is_voicemail && !c.is_read).length,
    [calls],
  )

  const filteredCalls = useMemo(() => {
    const query = search.trim().toLowerCase()
    return calls.filter((call) => {
      if (activeTab === 'voicemail' && !call.is_voicemail) return false
      if (activeTab === 'recents' && recentsFilter === 'missed' && !isMissed(call)) return false
      if (!query) return true
      return [
        call.contact_name,
        call.caller_number,
        call.callee_number,
        call.outcome,
        call.notes,
        call.summary_text,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [calls, activeTab, recentsFilter, search])

  const selectedCall = useMemo(
    () => calls.find((call) => call.id === selectedId) || null,
    [calls, selectedId],
  )
  const matchingCallIds = useMemo(() => filteredCalls.map((call) => call.id), [filteredCalls])
  const bulkSelectedCount = bulkSelection.selectedCount(matchingCallIds.length)

  // Match typed keypad number against known call history contacts
  const keypadMatchedContact = useMemo(() => {
    const e164 = toUsE164(keypadInput)
    if (!e164) return null
    const match = calls.find((c) => {
      const other = c.direction === 'inbound' ? c.caller_number : c.callee_number
      return toUsE164(other) === e164 && c.contact_name
    })
    if (!match) return null
    return {
      name: match.contact_name!,
      inquiryId: match.inquiry_id,
      phoneNumber: e164,
    }
  }, [keypadInput, calls])

  async function runCallBulkAction(
    action: 'mark_read' | 'mark_unread' | 'set_outcome' | 'delete',
    value?: string,
  ) {
    const ids = bulkSelection.resolveIds(matchingCallIds)
    if (!ids.length) return
    const busyId = action === 'set_outcome' ? value || action : action
    setBulkBusy(busyId)
    try {
      const response = await fetch('/api/portal/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'calls', action, ids, value }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to update the selected calls.')
      if (action === 'delete') setCalls((current) => current.filter((call) => !ids.includes(call.id)))
      if (action === 'mark_read')
        setCalls((current) =>
          current.map((call) => (ids.includes(call.id) ? { ...call, is_read: true } : call)),
        )
      if (action === 'mark_unread')
        setCalls((current) =>
          current.map((call) => (ids.includes(call.id) ? { ...call, is_read: false } : call)),
        )
      if (action === 'set_outcome')
        setCalls((current) =>
          current.map((call) => (ids.includes(call.id) ? { ...call, outcome: value || null } : call)),
        )
      bulkSelection.clear()
      setConfirmBulkDelete(false)
      setIsEditingList(false)
      notify({
        title: 'Calls updated',
        description: `${ids.length} call record${ids.length === 1 ? '' : 's'} updated.`,
        variant: 'success',
      })
    } catch (bulkError) {
      notify({
        title: 'Bulk action failed',
        description: bulkError instanceof Error ? bulkError.message : 'Unable to update calls.',
        variant: 'error',
      })
      void loadCalls(true)
    } finally {
      setBulkBusy(null)
    }
  }

  useEffect(() => {
    if (!selectedCall) return
    setNotes(selectedCall.notes || '')
    setOutcome(selectedCall.outcome || '')
    setTargetSeekTime(null)
    setCurrentPlayheadTime(0)
    if (selectedCall.direction === 'inbound' && !selectedCall.is_read) {
      void updateCall(selectedCall.id, { isRead: true }, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCall?.id])

  async function updateCall(
    id: string,
    updates: { isRead?: boolean; notes?: string | null; outcome?: string | null },
    showToast = true,
  ) {
    setSaving(true)
    try {
      const response = await fetch('/api/twilio/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      const updated = (await response.json()) as LuxorCall & { error?: string }
      if (!response.ok) throw new Error(updated.error || 'Unable to update call.')
      setCalls((current) =>
        current.map((call) =>
          call.id === id
            ? { ...updated, transcript_segments: call.transcript_segments }
            : call,
        ),
      )
      window.dispatchEvent(new Event('luxor-call-history-refresh'))
      if (showToast) {
        notify({
          title: 'Saved',
          description: 'Call details updated.',
          variant: 'success',
        })
      }
    } catch (error) {
      notify({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unable to update call.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateSummary(call: LuxorCall) {
    setReaderTab('summary')
    if (call.summary_text || generatingSummary) return
    setGeneratingSummary(true)
    try {
      const query = call.inquiry_id ? `?inquiryId=${encodeURIComponent(call.inquiry_id)}` : ''
      const endpoint = `/api/portal/calls/${encodeURIComponent(call.id)}/summary${query}`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: call.inquiry_id || '' }),
      })
      let payload = (await response.json().catch(() => ({}))) as {
        status?: LuxorCall['summary_status']
        summary?: string | null
        error?: string
      }
      if (!response.ok) throw new Error(payload.error || 'Unable to summarize this call.')

      for (let attempt = 0; attempt < 8 && payload.status === 'generating'; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500))
        const statusResponse = await fetch(endpoint, { cache: 'no-store' })
        payload = (await statusResponse.json().catch(() => ({}))) as {
          status?: LuxorCall['summary_status']
          summary?: string | null
          error?: string
        }
        if (!statusResponse.ok) throw new Error(payload.error || 'Unable to load summary.')
      }

      if (payload.summary) {
        setCalls((current) =>
          current.map((item) =>
            item.id === call.id
              ? { ...item, summary_status: 'completed', summary_text: payload.summary }
              : item,
          ),
        )
      }
    } catch (error) {
      notify({
        title: 'Summary unavailable',
        description: error instanceof Error ? error.message : 'Unable to generate summary.',
        variant: 'error',
      })
    } finally {
      setGeneratingSummary(false)
    }
  }

  const callSummary = selectedCall
    ? selectedCall.summary_text ||
      (selectedCall.metadata?.summary as string | undefined) ||
      (selectedCall.metadata?.call_summary as string | undefined) ||
      null
    : null

  const voicemailTranscript = selectedCall
    ? (selectedCall.metadata?.voicemail_transcript as string | undefined) ||
      (selectedCall.metadata?.transcript as string | undefined) ||
      null
    : null

  const targetPhoneNumber = selectedCall
    ? selectedCall.direction === 'inbound'
      ? selectedCall.caller_number
      : selectedCall.callee_number
    : null

  const hasDirtyDetails = selectedCall
    ? (notes.trim() || '') !== (selectedCall.notes?.trim() || '') ||
      (outcome || '') !== (selectedCall.outcome || '')
    : false

  function handleCallNumber(phone: string | null, name?: string | null, inquiryId?: string | null) {
    if (!phone) {
      openPanel()
      return
    }
    void startCall({
      phoneNumber: phone,
      contactName: name || undefined,
      inquiryId: inquiryId || undefined,
    })
  }

  function handleKeypadDigit(digit: string) {
    setKeypadInput((current) => formatUsDialInput(`${current}${digit}`))
  }

  function handleKeypadCall() {
    const e164 = toUsE164(keypadInput)
    if (!e164) return
    void startCall({
      phoneNumber: e164,
      contactName: keypadMatchedContact?.name,
      inquiryId: keypadMatchedContact?.inquiryId,
    })
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Main Phone App Shell: Edge-to-edge on Mobile & iPad, Contained rounded container on Desktop */}
      <div
        className="grid grid-cols-1 md:grid-cols-[20.5rem_minmax(0,1fr)] lg:grid-cols-[23.5rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)] h-full min-h-0 w-full flex-1 overflow-hidden bg-[color:var(--portal-card)] rounded-none border-0 lg:rounded-2xl lg:border lg:border-[color:var(--portal-border)] lg:shadow-xs"
      >
        {/* ============================================================
            LEFT COLUMN: Native Phone App (Recents / Voicemail / Keypad)
           ============================================================ */}
        <section
          className={`flex flex-col min-h-0 overflow-hidden md:border-r md:border-[color:var(--portal-border)] ${
            mobileDetailOpen && !showCall ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Top Navigation Bar (iOS style) */}
          {!showCall && activeTab !== 'keypad' && (
            <div className="shrink-0 px-4 pt-3.5 pb-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/90 backdrop-blur-md space-y-2.5">
              {/* Top Utility Row: Edit | Segmented Control | Refresh */}
              <div className="flex items-center justify-between gap-2 min-h-8">
                <button
                  type="button"
                  onClick={() => {
                    if (isEditingList) bulkSelection.clear()
                    setIsEditingList((prev) => !prev)
                  }}
                  className="text-xs font-semibold text-[#a8792f] dark:text-[#f1d27a] hover:opacity-80 transition-opacity cursor-pointer px-1 py-0.5"
                >
                  {isEditingList ? 'Done' : 'Edit'}
                </button>

                {activeTab === 'recents' ? (
                  <div
                    className="inline-flex rounded-lg bg-[color:var(--portal-soft)] p-0.5 border border-[color:var(--portal-border)]"
                    role="tablist"
                    aria-label="Filter recent calls"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={recentsFilter === 'all'}
                      onClick={() => setRecentsFilter('all')}
                      className={`w-16 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        recentsFilter === 'all'
                          ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xs'
                          : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={recentsFilter === 'missed'}
                      onClick={() => setRecentsFilter('missed')}
                      className={`w-16 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        recentsFilter === 'missed'
                          ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xs'
                          : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                      }`}
                    >
                      Missed
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-[color:var(--portal-muted)]">
                    {unreadVoicemailCount > 0 ? `${unreadVoicemailCount} unread` : 'All messages'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => void loadCalls()}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
                  aria-label="Refresh calls"
                  title="Refresh"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* Large iOS Title */}
              <div className="flex items-baseline justify-between pt-0.5">
                <h1 className="text-2xl font-bold tracking-tight text-[color:var(--portal-text)]">
                  {activeTab === 'voicemail' ? 'Voicemail' : 'Recents'}
                </h1>
                {isEditingList && matchingCallIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <PortalBulkHeaderSelector
                      state={bulkSelection.pageSelectionState(matchingCallIds)}
                      onChange={() => bulkSelection.selectPage(matchingCallIds)}
                      label="Select all visible calls"
                    />
                    <span className="text-xs font-medium text-[color:var(--portal-muted)]">
                      Select all
                    </span>
                  </div>
                )}
              </div>

              {/* Clean Search Field */}
              <div className="flex items-center gap-2 rounded-xl bg-[color:var(--portal-soft)] px-3 h-9 border border-transparent focus-within:border-[#caa24c]/35 transition-colors">
                <Search size={14} className="text-[color:var(--portal-muted)] shrink-0" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  className="portal-input-transparent h-full min-w-0 flex-1 bg-transparent text-[13px] text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="rounded-full p-0.5 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]"
                    aria-label="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Middle Body: Either Keypad OR Scrollable Call/Voicemail List */}
          <AnimatePresence mode="wait" initial={false}>
          {activeCall ? (
            <motion.div key="live-call" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }} transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }} className="flex min-h-0 flex-1 flex-col overflow-y-auto portal-scrollbar">
              <LivePhoneCall call={activeCall} />
            </motion.div>
          ) : isStartingCall ? (
            <motion.div key="starting-call" initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }} className="flex min-h-0 flex-1 flex-col overflow-y-auto portal-scrollbar">
              <StartingPhoneCall target={startingCallTarget} />
            </motion.div>
          ) : activeTab === 'keypad' ? (
            <motion.div key="keypad" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }} transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }} className="flex-1 min-h-0 flex flex-col justify-between px-6 py-5 overflow-y-auto portal-scrollbar">
              {/* Softphone status pill */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[color:var(--portal-muted)]">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      phoneState === 'ready'
                        ? 'bg-emerald-500'
                        : phoneState === 'starting'
                          ? 'bg-amber-500'
                          : 'bg-[color:var(--portal-faint)]'
                    }`}
                  />
                  {phoneState === 'ready'
                    ? 'Luxor Line Ready'
                    : phoneState === 'starting'
                      ? 'Connecting…'
                      : 'Browser Phone Offline'}
                </span>
                {phoneState !== 'ready' && (
                  <button
                    type="button"
                    onClick={() => void enablePhone()}
                    className="text-xs font-semibold text-[#a8792f] dark:text-[#f1d27a] hover:underline cursor-pointer"
                  >
                    Enable Audio
                  </button>
                )}
              </div>

              {/* Number Display & Contact Match */}
              <div className="my-auto py-4 text-center min-h-[5.5rem] flex flex-col items-center justify-center">
                <input
                  type="tel"
                  value={keypadInput}
                  onChange={(e) => setKeypadInput(formatUsDialInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && toUsE164(keypadInput)) handleKeypadCall()
                  }}
                  placeholder="(000) 000-0000"
                  aria-label="Phone number to dial"
                  className="portal-input-transparent w-full bg-transparent text-center text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]/50"
                />
                {keypadMatchedContact ? (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#a8792f] dark:text-[#f1d27a]">
                    <span>{keypadMatchedContact.name}</span>
                    {keypadMatchedContact.inquiryId && (
                      <Link
                        href={`/portal/leads/${keypadMatchedContact.inquiryId}`}
                        className="underline hover:opacity-80"
                      >
                        View Lead
                      </Link>
                    )}
                  </div>
                ) : (
                  <span className="mt-1.5 text-xs text-[color:var(--portal-muted)]">
                    {keypadInput ? 'Outbound via Luxor line' : 'Enter a number to call'}
                  </span>
                )}
              </div>

              {/* 3x4 Tactile Keypad Grid */}
              <div className="mx-auto w-full max-w-[16.5rem] space-y-3">
                <div className="grid grid-cols-3 gap-x-5 gap-y-3 justify-items-center">
                  {KEYPAD_KEYS.map((item) => (
                    <button
                      key={item.digit}
                      type="button"
                      onClick={() => handleKeypadDigit(item.digit)}
                      className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] transition-transform duration-75 active:scale-92 hover:bg-[color:var(--portal-border)]/60 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"
                    >
                      <span className="text-2xl font-medium leading-none">{item.digit}</span>
                      {item.letters !== undefined && (
                        <span className="mt-0.5 text-[9px] font-semibold tracking-[0.16em] text-[color:var(--portal-muted)] min-h-[11px]">
                          {item.letters}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Call & Delete Row */}
                <div className="grid grid-cols-3 items-center justify-items-center pt-1">
                  <div />
                  <button
                    type="button"
                    onClick={handleKeypadCall}
                    disabled={!toUsE164(keypadInput)}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-transform duration-100 active:scale-95 hover:bg-emerald-400 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    aria-label="Place call"
                  >
                    <Phone size={24} className="fill-current" />
                  </button>
                  {keypadInput ? (
                    <button
                      type="button"
                      onClick={() => setKeypadInput((curr) => removeLastDialDigit(curr))}
                      className="flex h-12 w-12 items-center justify-center rounded-full text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-transform active:scale-90 cursor-pointer"
                      aria-label="Delete last digit"
                    >
                      <Delete size={20} />
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="call-list" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }} className="flex-1 min-h-0 overflow-y-auto portal-scrollbar divide-y divide-[color:var(--portal-border)]/70">
              {loading ? (
                <div className="p-4 space-y-3.5">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5">
                      <div className="h-10 w-10 rounded-full luxor-skeleton shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-32 rounded luxor-skeleton" />
                        <div className="h-2.5 w-24 rounded luxor-skeleton" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredCalls.length === 0 ? (
                <div className="flex h-full min-h-60 flex-col items-center justify-center px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]">
                    {activeTab === 'voicemail' ? <Voicemail size={22} /> : <Phone size={22} />}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">
                    {activeTab === 'voicemail' ? 'No Voicemails' : 'No Recent Calls'}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                    {search
                      ? 'Try a different name or phone number.'
                      : activeTab === 'voicemail'
                        ? 'Voicemail messages left by callers will appear here.'
                        : 'Inbound and outbound calls will appear here.'}
                  </p>
                </div>
              ) : (
                filteredCalls.map((call, rowIndex) => {
                  const isSelected = selectedId === call.id
                  const missed = isMissed(call)
                  const unreadInbound = !call.is_read && call.direction === 'inbound'
                  const phoneNum =
                    call.direction === 'inbound' ? call.caller_number : call.callee_number
                  const namedContact = getNamedContact(call.contact_name)
                  const displayName = namedContact || formatPhoneDisplay(phoneNum)
                  const isVoicemailExpanded =
                    activeTab === 'voicemail' && expandedVoicemailId === call.id
                  const inlineVmTranscript =
                    (call.metadata?.voicemail_transcript as string | undefined) ||
                    (call.metadata?.transcript as string | undefined) ||
                    call.summary_text ||
                    null

                  return (
                    <div
                      key={call.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'md:bg-[color:var(--portal-soft)]'
                          : 'hover:bg-[color:var(--portal-soft)]/50'
                      }`}
                    >
                      <div className="flex items-center">
                        {isEditingList && (
                          <div className="pl-3.5 pr-1 py-3 shrink-0">
                            <PortalBulkRowSelector
                              checked={bulkSelection.isSelected(call.id)}
                              index={rowIndex + 1}
                              onChange={() => bulkSelection.toggle(call.id)}
                              label={displayName}
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(call.id)
                            if (activeTab === 'voicemail') {
                              setExpandedVoicemailId((curr) => (curr === call.id ? null : call.id))
                            } else {
                              setMobileDetailOpen(true)
                            }
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3.5 pl-3 text-left cursor-pointer"
                        >
                          {/* Unread indicator dot */}
                          <span className="flex w-2 shrink-0 justify-center">
                            {unreadInbound && (
                              <span className="h-2 w-2 rounded-full bg-[#caa24c]" />
                            )}
                          </span>

                          {/* Contact Avatar */}
                          {namedContact ? (
                            <PortalContactAvatar
                              name={namedContact}
                              size="sm"
                              className="shrink-0"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]">
                              <User size={14} />
                            </div>
                          )}

                          {/* Primary & Secondary Labels */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p
                                className={`truncate text-[15px] tracking-[-0.01em] ${
                                  unreadInbound ? 'font-semibold' : 'font-medium'
                                } ${
                                  missed
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-[color:var(--portal-text)]'
                                }`}
                              >
                                {displayName}
                              </p>
                              <span className="shrink-0 text-xs tabular-nums text-[color:var(--portal-muted)]">
                                {formatPhoneListTime(call.created_at)}
                              </span>
                            </div>

                            <div className="mt-0.5 flex items-center justify-between gap-2 text-[13px] text-[color:var(--portal-muted)]">
                              <span className="flex items-center gap-1.5 truncate">
                                {call.is_voicemail ? (
                                  <Voicemail size={12} className="shrink-0 text-[#caa24c]" />
                                ) : missed ? (
                                  <PhoneMissed size={12} className="shrink-0 text-red-500" />
                                ) : call.direction === 'inbound' ? (
                                  <PhoneIncoming size={12} className="shrink-0" />
                                ) : (
                                  <PhoneOutgoing size={12} className="shrink-0" />
                                )}
                                <span className="truncate">
                                  {namedContact
                                    ? formatPhoneDisplay(phoneNum)
                                    : call.is_voicemail
                                      ? 'Voicemail'
                                      : missed
                                        ? 'Missed Call'
                                        : call.direction === 'inbound'
                                          ? 'Inbound Call'
                                          : 'Outbound Call'}
                                </span>
                              </span>

                              {call.recording_duration_seconds != null ? (
                                <span className="shrink-0 text-xs tabular-nums text-[color:var(--portal-muted)]">
                                  {formatDuration(call.recording_duration_seconds)}
                                </span>
                              ) : call.duration_seconds ? (
                                <span className="shrink-0 text-xs tabular-nums text-[color:var(--portal-muted)]">
                                  {formatDuration(call.duration_seconds)}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <ChevronRight
                            size={15}
                            className={`shrink-0 text-[color:var(--portal-faint)] transition-transform ${
                              isVoicemailExpanded ? 'rotate-90 md:rotate-0' : ''
                            }`}
                          />
                        </button>
                      </div>

                      {/* Mobile Inline Visual Voicemail Expansion */}
                      {isVoicemailExpanded && call.recording_sid && (
                        <div className="md:hidden px-4 pb-4 pt-1 space-y-3 bg-[color:var(--portal-soft)]/35">
                          <PortalAudioPlayer
                            variant="compact"
                            src={`/api/twilio/recordings/${call.recording_sid}${
                              call.inquiry_id
                                ? `?inquiryId=${encodeURIComponent(call.inquiry_id)}`
                                : ''
                            }`}
                            durationSeconds={call.recording_duration_seconds}
                            downloadFilename={`voicemail-${call.id}.mp3`}
                          />
                          {inlineVmTranscript && (
                            <p className="text-xs leading-relaxed text-[color:var(--portal-text)] px-1">
                              &ldquo;{inlineVmTranscript}&rdquo;
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleCallNumber(phoneNum, call.contact_name, call.inquiry_id)
                              }
                              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#caa24c] py-2 text-xs font-semibold text-white cursor-pointer"
                            >
                              <Phone size={13} /> Call Back
                            </button>
                            <Link
                              href={`/portal/messages?phone=${encodeURIComponent(phoneNum)}`}
                              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] py-2 text-xs font-semibold text-[color:var(--portal-text)]"
                            >
                              <MessageSquare size={13} /> Message
                            </Link>
                            <button
                              type="button"
                              onClick={() => setMobileDetailOpen(true)}
                              className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-xs font-semibold text-[color:var(--portal-muted)]"
                            >
                              Details
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </motion.div>
          )}
          </AnimatePresence>

          {/* Bottom Tab Bar (Recents | Voicemail | Keypad) */}
          {!showCall && <nav
            aria-label="Phone navigation"
            className="shrink-0 grid grid-cols-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/90 backdrop-blur-xl px-2 py-1.5"
          >
            <button
              type="button"
              onClick={() => setActiveTab('recents')}
              className={`relative flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'recents'
                  ? 'text-[#a8792f] dark:text-[#f1d27a]'
                  : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
              }`}
            >
              <div className="relative">
                <Clock3 size={19} />
                {unreadMissedCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {unreadMissedCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">Recents</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('voicemail')}
              className={`relative flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'voicemail'
                  ? 'text-[#a8792f] dark:text-[#f1d27a]'
                  : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
              }`}
            >
              <div className="relative">
                <Voicemail size={19} />
                {unreadVoicemailCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#caa24c] px-1 text-[9px] font-bold text-white">
                    {unreadVoicemailCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold">Voicemail</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('keypad')}
              className={`flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-colors cursor-pointer ${
                activeTab === 'keypad'
                  ? 'text-[#a8792f] dark:text-[#f1d27a]'
                  : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
              }`}
            >
              <Grid size={19} />
              <span className="text-[10px] font-semibold">Keypad</span>
            </button>
          </nav>}
        </section>

        {/* ============================================================
            RIGHT COLUMN: Calm Call & Recording Inspector
           ============================================================ */}
        <section
          className={`flex-1 min-h-0 overflow-y-auto portal-scrollbar bg-[color:var(--portal-bg)]/35 ${
            mobileDetailOpen && !showCall ? 'flex flex-col' : 'hidden md:flex md:flex-col'
          }`}
        >
          {selectedCall ? (
            <div className="mx-auto w-full max-w-2xl p-5 sm:p-7 lg:p-8 space-y-6">
              {/* Mobile Back Bar (< Recents) */}
              <div className="md:hidden flex items-center justify-between pb-2">
                <button
                  type="button"
                  onClick={() => setMobileDetailOpen(false)}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#a8792f] dark:text-[#f1d27a] cursor-pointer"
                >
                  <ArrowLeft size={16} />
                  {activeTab === 'voicemail' ? 'Voicemail' : 'Recents'}
                </button>
              </div>

              {/* 1. Calm Contact Poster Header */}
              <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {getNamedContact(selectedCall.contact_name) ? (
                    selectedCall.inquiry_id ? (
                      <Link
                        href={`/portal/leads/${selectedCall.inquiry_id}`}
                        className="shrink-0 no-underline"
                        aria-label={`Open ${getNamedContact(selectedCall.contact_name)} lead profile`}
                      >
                        <PortalContactAvatar
                          name={getNamedContact(selectedCall.contact_name)!}
                          size="lg"
                          className="shrink-0"
                        />
                      </Link>
                    ) : (
                      <PortalContactAvatar
                        name={getNamedContact(selectedCall.contact_name)!}
                        size="lg"
                        className="shrink-0"
                      />
                    )
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]">
                      <User size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedCall.inquiry_id ? (
                        <Link
                          href={`/portal/leads/${selectedCall.inquiry_id}`}
                          className="text-xl sm:text-2xl font-semibold tracking-tight text-[color:var(--portal-text)] truncate no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]"
                        >
                          {getNamedContact(selectedCall.contact_name) || formatPhoneDisplay(targetPhoneNumber)}
                        </Link>
                      ) : (
                        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[color:var(--portal-text)] truncate">
                          {getNamedContact(selectedCall.contact_name) || formatPhoneDisplay(targetPhoneNumber)}
                        </h2>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          isMissed(selectedCall)
                            ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                            : selectedCall.is_voicemail
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
                        }`}
                      >
                        {selectedCall.is_voicemail
                          ? 'Voicemail'
                          : isMissed(selectedCall)
                            ? 'Missed'
                            : selectedCall.direction === 'inbound'
                              ? 'Inbound'
                              : 'Outbound'}
                      </span>
                    </div>

                    {getNamedContact(selectedCall.contact_name) && (
                      <p className="mt-0.5 text-sm tabular-nums text-[color:var(--portal-muted)]">
                        {formatPhoneDisplay(targetPhoneNumber)}
                      </p>
                    )}

                    <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                      {formatDateTime(selectedCall.started_at)}
                      {selectedCall.duration_seconds != null &&
                        ` · ${formatDuration(selectedCall.duration_seconds)}`}
                    </p>
                  </div>
                </div>

                {/* iOS Contact Action Row */}
                <div className="mt-5 grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleCallNumber(
                        targetPhoneNumber,
                        selectedCall.contact_name,
                        selectedCall.inquiry_id,
                      )
                    }
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[color:var(--portal-soft)] py-3 px-2 text-xs font-medium text-[color:var(--portal-text)] transition-transform active:scale-97 hover:bg-[#caa24c]/12 hover:text-[#a8792f] dark:hover:text-[#f1d27a] cursor-pointer"
                  >
                    <Phone size={17} className="text-[#caa24c]" />
                    <span>call</span>
                  </button>

                  {targetPhoneNumber ? (
                    <Link
                      href={`/portal/messages?phone=${encodeURIComponent(targetPhoneNumber)}`}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[color:var(--portal-soft)] py-3 px-2 text-xs font-medium text-[color:var(--portal-text)] transition-transform active:scale-97 hover:bg-[#caa24c]/12 hover:text-[#a8792f] dark:hover:text-[#f1d27a]"
                    >
                      <MessageSquare size={17} className="text-[#caa24c]" />
                      <span>message</span>
                    </Link>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[color:var(--portal-soft)]/50 py-3 px-2 text-xs text-[color:var(--portal-faint)]">
                      <MessageSquare size={17} />
                      <span>message</span>
                    </div>
                  )}

                  {selectedCall.inquiry_id ? (
                    <Link
                      href={`/portal/leads/${selectedCall.inquiry_id}`}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[color:var(--portal-soft)] py-3 px-2 text-xs font-medium text-[color:var(--portal-text)] transition-transform active:scale-97 hover:bg-[#caa24c]/12 hover:text-[#a8792f] dark:hover:text-[#f1d27a]"
                    >
                      <User size={17} className="text-[#caa24c]" />
                      <span>lead profile</span>
                    </Link>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[color:var(--portal-soft)]/50 py-3 px-2 text-xs text-[color:var(--portal-faint)]">
                      <User size={17} />
                      <span>unlinked</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void updateCall(selectedCall.id, { isRead: !selectedCall.is_read })
                    }
                    className="hidden sm:flex flex-col items-center justify-center gap-1.5 rounded-xl bg-[color:var(--portal-soft)] py-3 px-2 text-xs font-medium text-[color:var(--portal-text)] transition-transform active:scale-97 hover:bg-[#caa24c]/12 hover:text-[#a8792f] dark:hover:text-[#f1d27a] cursor-pointer"
                  >
                    {selectedCall.is_read ? (
                      <Circle size={17} className="text-[color:var(--portal-muted)]" />
                    ) : (
                      <CheckCheck size={17} className="text-[#caa24c]" />
                    )}
                    <span>{selectedCall.is_read ? 'mark unread' : 'mark read'}</span>
                  </button>
                </div>
              </div>

              {/* 2. Cohesive Audio Player + Transcript & Summary Surface */}
              {(selectedCall.recording_sid ||
                (selectedCall.transcript_segments &&
                  selectedCall.transcript_segments.length > 0) ||
                voicemailTranscript ||
                callSummary) && (
                <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] overflow-hidden">
                  {/* Shared React Audio Player */}
                  {selectedCall.recording_sid && (
                    <div className="p-4 sm:p-5">
                      <PortalAudioPlayer
                        variant="full"
                        className="!border-0 !p-0 !bg-transparent"
                        src={`/api/twilio/recordings/${selectedCall.recording_sid}${
                          selectedCall.inquiry_id
                            ? `?inquiryId=${encodeURIComponent(selectedCall.inquiry_id)}`
                            : ''
                        }`}
                        title={
                          selectedCall.is_voicemail ? 'Voicemail Recording' : 'Call Recording'
                        }
                        subtitle={
                          selectedCall.recording_duration_seconds != null
                            ? formatDuration(selectedCall.recording_duration_seconds)
                            : undefined
                        }
                        durationSeconds={selectedCall.recording_duration_seconds}
                        downloadFilename={`${
                          selectedCall.is_voicemail ? 'voicemail' : 'call'
                        }-${selectedCall.id}.mp3`}
                        seekToSeconds={targetSeekTime}
                        onTimeUpdate={(curr) => setCurrentPlayheadTime(curr)}
                      />
                    </div>
                  )}

                  {/* Transcript & Summary Reader */}
                  {((selectedCall.transcript_segments &&
                    selectedCall.transcript_segments.length > 0) ||
                    voicemailTranscript ||
                    callSummary) && (
                    <div className="border-t border-[color:var(--portal-border)]">
                      {/* Reader Header with Transcript | Summary Switcher */}
                      <div className="flex items-center justify-between gap-2 px-5 py-3 bg-[color:var(--portal-soft)]/40 border-b border-[color:var(--portal-border)]">
                        <div
                          className="inline-flex rounded-lg bg-[color:var(--portal-soft)] p-0.5 border border-[color:var(--portal-border)]"
                          role="tablist"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={readerTab === 'transcript'}
                            onClick={() => setReaderTab('transcript')}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                              readerTab === 'transcript'
                                ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xs'
                                : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                            }`}
                          >
                            <FileText size={12} /> Transcript
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={readerTab === 'summary'}
                            onClick={() => void handleGenerateSummary(selectedCall)}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                              readerTab === 'summary'
                                ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-2xs'
                                : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                            }`}
                          >
                            <Sparkles size={12} className="text-[#caa24c]" /> Summary
                          </button>
                        </div>

                        {readerTab === 'transcript' &&
                          selectedCall.transcript_segments &&
                          selectedCall.transcript_segments.length > 0 && (
                            <span className="text-[11px] text-[color:var(--portal-muted)]">
                              Tap time to jump
                            </span>
                          )}
                      </div>

                      {/* Reader Content */}
                      {readerTab === 'summary' ? (
                        <div className="p-5">
                          {generatingSummary || selectedCall.summary_status === 'generating' ? (
                            <div className="flex items-center gap-2 text-sm text-[color:var(--portal-muted)] py-4">
                              <Loader2 size={15} className="animate-spin text-[#caa24c]" />
                              <span>Summarizing call transcript…</span>
                            </div>
                          ) : callSummary ? (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--portal-text)]">
                              {callSummary}
                            </p>
                          ) : (
                            <div className="py-4 text-sm text-[color:var(--portal-muted)] flex items-center justify-between gap-3">
                              <span>
                                {selectedCall.transcription_status === 'completed'
                                  ? 'Generate a concise summary of event needs and next steps.'
                                  : 'A summary can be generated once a call transcript is available.'}
                              </span>
                              {selectedCall.transcription_status === 'completed' && (
                                <button
                                  type="button"
                                  onClick={() => void handleGenerateSummary(selectedCall)}
                                  className="shrink-0 rounded-lg bg-[#caa24c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#b98a3d] cursor-pointer"
                                >
                                  Summarize
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : selectedCall.transcript_segments &&
                        selectedCall.transcript_segments.length > 0 ? (
                        <div className="max-h-72 overflow-y-auto divide-y divide-[color:var(--portal-border)]/50 p-3 sm:p-4 portal-scrollbar">
                          {selectedCall.transcript_segments.map((segment) => {
                            const isSpokenNow =
                              segment.startSeconds != null &&
                              currentPlayheadTime >= segment.startSeconds &&
                              currentPlayheadTime < segment.startSeconds + 4
                            const isCustomer =
                              segment.track === 'inbound' ||
                              segment.track === 'caller' ||
                              segment.track === 'customer' ||
                              (selectedCall.direction === 'inbound'
                                ? segment.track === 'outbound_track'
                                : segment.track === 'inbound_track')

                            return (
                              <button
                                key={segment.id}
                                type="button"
                                onClick={() => {
                                  if (segment.startSeconds != null) {
                                    setTargetSeekTime(segment.startSeconds)
                                  }
                                }}
                                className={`w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer ${
                                  isSpokenNow
                                    ? 'bg-[#caa24c]/12'
                                    : 'hover:bg-[color:var(--portal-soft)]/70'
                                }`}
                              >
                                <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums font-medium text-[#a8792f] dark:text-[#f1d27a]">
                                  {segment.startSeconds != null
                                    ? formatDuration(Math.floor(segment.startSeconds))
                                    : '—'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-semibold text-[color:var(--portal-muted)]">
                                    {isCustomer
                                      ? selectedCall.contact_name || 'Caller'
                                      : 'Luxor'}
                                  </span>
                                  <p className="mt-0.5 text-sm leading-relaxed text-[color:var(--portal-text)]">
                                    {segment.text}
                                  </p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      ) : voicemailTranscript ? (
                        <div className="p-5">
                          <p className="text-sm leading-relaxed text-[color:var(--portal-text)]">
                            &ldquo;{voicemailTranscript}&rdquo;
                          </p>
                        </div>
                      ) : (
                        <div className="p-5 text-sm text-[color:var(--portal-muted)]">
                          No transcript available for this recording.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Quiet Call Log Card (Outcome & Notes) */}
              <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-[color:var(--portal-muted)]">
                    Call Outcome & Notes
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      void updateCall(selectedCall.id, {
                        notes: notes.trim() || null,
                        outcome: outcome || null,
                      })
                    }
                    disabled={saving || !hasDirtyDetails}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      hasDirtyDetails
                        ? 'bg-[#caa24c] text-white hover:bg-[#b98a3d]'
                        : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] opacity-60 cursor-default'
                    }`}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <PortalSelect
                    value={outcome}
                    onChange={setOutcome}
                    options={OUTCOME_OPTIONS}
                  />
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    placeholder="Add a note about what was discussed or the next follow-up step…"
                    className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-3.5 py-2.5 text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)] focus:border-[#caa24c]/45 transition-colors resize-y"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]">
                <PhoneCall size={22} />
              </div>
              <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">
                No Call Selected
              </p>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)] max-w-xs">
                Choose a recent call or voicemail on the left to listen to recordings, read transcripts, or log notes.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Bulk Action Deck (Only visible when Edit mode has selected items) */}
      <PortalBulkActionDeck
        selectedCount={bulkSelectedCount}
        pageCount={matchingCallIds.length}
        totalCount={matchingCallIds.length}
        allMatching={bulkSelection.allMatching}
        busyAction={bulkBusy}
        noun="call"
        onSelectAll={bulkSelection.selectAllMatching}
        onClear={bulkSelection.clear}
        onAction={(action) => {
          if (action === 'read') void runCallBulkAction('mark_read')
          if (action === 'unread') void runCallBulkAction('mark_unread')
          if (action === 'outcome') setBulkOutcomeOpen(true)
          if (action === 'delete') setConfirmBulkDelete(true)
        }}
        actions={[
          { id: 'read', label: 'Mark read', icon: <CheckCheck size={13} /> },
          { id: 'unread', label: 'Mark unread', icon: <Circle size={13} /> },
          { id: 'outcome', label: 'Set outcome', icon: <Tags size={13} /> },
          { id: 'delete', label: 'Delete', icon: <Trash2 size={13} />, tone: 'danger' },
        ]}
      />
      <PortalBulkChoiceDialog
        open={bulkOutcomeOpen}
        title="Set call outcome"
        description={`Apply one outcome to ${bulkSelectedCount} selected ${
          bulkSelectedCount === 1 ? 'call' : 'calls'
        }.`}
        label="Outcome"
        value={bulkOutcome}
        options={OUTCOME_OPTIONS.filter((option) => option.value)}
        confirmLabel="Update calls"
        busy={Boolean(bulkBusy)}
        onValueChange={setBulkOutcome}
        onConfirm={() => {
          setBulkOutcomeOpen(false)
          void runCallBulkAction('set_outcome', bulkOutcome)
        }}
        onClose={() => setBulkOutcomeOpen(false)}
      />
      <PortalBulkConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${bulkSelectedCount} call record${bulkSelectedCount === 1 ? '' : 's'}?`}
        description="This permanently removes the selected call history, including saved notes and recording references. It does not delete the related lead."
        confirmLabel="Delete call records"
        busy={bulkBusy === 'delete'}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => void runCallBulkAction('delete')}
      />
    </div>
  )
}

function CallAvatar({ name, connecting = false }: { name: string; connecting?: boolean }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="relative inline-flex items-center justify-center p-1.5">
      <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border border-[#caa24c]/50" initial={false} animate={connecting && !reduceMotion ? { scale: [1, 1.07, 1], opacity: [0.45, 0.9, 0.45] } : { scale: 1, opacity: 0.65 }} transition={connecting && !reduceMotion ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }} />
      <PortalContactAvatar name={name} size="xl" />
    </div>
  )
}

function StartingPhoneCall({ target }: { target: ReturnType<typeof usePortalVoice>['startingCallTarget'] }) {
  const { minimizeCall } = usePortalVoice()
  const number = target?.phoneNumber ? formatPhoneDisplay(target.phoneNumber) : ''
  const name = target?.contactName?.trim()
  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-6 py-6 text-center">
      <div className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-[color:var(--portal-muted)]"><p role="status" aria-live="polite"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#caa24c]" />Preparing call</p><button type="button" onClick={minimizeCall} aria-label="Collapse call view" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 md:hidden"><ChevronDown size={19} /></button></div>
      <div className="flex w-full flex-1 flex-col items-center justify-center py-6">
        <CallAvatar name={name || number || 'Call'} connecting />
        <p className="mt-5 font-serif text-3xl font-semibold leading-tight text-[color:var(--portal-text)]">{name || number || 'Starting call'}</p>
        {name && number && <p className="mt-1 text-sm tabular-nums text-[color:var(--portal-muted)]">{number}</p>}
        <p className="mt-3 text-sm text-[color:var(--portal-muted)]">Connecting your call…</p>
      </div>
      <div className="h-[72px] shrink-0" aria-hidden="true" />
    </div>
  )
}

function LivePhoneCall({ call }: { call: NonNullable<ReturnType<typeof usePortalVoice>['activeCall']> }) {
  const { isMuted, toggleMute, hangUp, sendDigit, dismissBridgeNotice, minimizeCall, canViewLeadDetails } = usePortalVoice()
  const [showKeypad, setShowKeypad] = useState(false)
  const [showLeadDetails, setShowLeadDetails] = useState(false)
  const leadDetailsId = useId()
  const reduceMotion = useReducedMotion()
  const [now, setNow] = useState(() => Date.now())
  const isBrowserCall = call.mode === 'browser'
  const incomingRinging = call.direction === 'inbound' && call.phase === 'ringing'

  useEffect(() => {
    if (!isBrowserCall || call.phase !== 'active') return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [call.phase, isBrowserCall])

  const status = !isBrowserCall
    ? call.bridgeStatusUnavailable ? 'Call status unavailable' : call.phase === 'active' ? 'Connected' : call.phase === 'ringing' ? 'Ringing…' : call.bridgeStage === 'calling_phone' ? 'Calling your phone…' : call.bridgeStage === 'connecting_client' ? 'Connecting client…' : 'Starting call…'
    : incomingRinging
      ? 'Incoming call'
      : call.phase === 'active'
        ? 'Connected to Luxor line'
        : call.phase === 'ringing' ? 'Ringing…' : 'Calling…'

  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-6 py-6 text-center">
      <div className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-[color:var(--portal-muted)]">
        <div className="flex min-w-0 items-center gap-2"><p role="status" aria-live="polite"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${call.phase === 'active' && !call.bridgeStatusUnavailable ? 'bg-emerald-500' : 'bg-[#caa24c]'}`} />{status}</p>
        {isBrowserCall && call.phase === 'active' && <span role="timer" aria-label="Call duration" aria-live="off">{formatDuration(Math.max(0, Math.floor((now - call.startedAt) / 1000)))}</span>}</div>
        <button type="button" onClick={minimizeCall} aria-label="Collapse call view" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 md:hidden"><ChevronDown size={19} /></button>
      </div>
      <div className="flex w-full flex-1 flex-col items-center justify-center py-6">
        <CallAvatar name={call.contactName} />
        {call.inquiryId && canViewLeadDetails ? (
          <Link href={`/portal/leads/${call.inquiryId}`} className="mt-5 font-serif text-3xl font-semibold leading-tight text-[color:var(--portal-text)] hover:text-[#a8792f] dark:hover:text-[#f1d27a]">{call.contactName}</Link>
        ) : <p className="mt-5 font-serif text-3xl font-semibold leading-tight text-[color:var(--portal-text)]">{call.contactName}</p>}
        <p className="mt-1 text-sm tabular-nums text-[color:var(--portal-muted)]">{formatPhoneDisplay(call.phoneNumber)}</p>
        {!isBrowserCall && <p className="mt-3 max-w-64 text-sm leading-5 text-[color:var(--portal-muted)]">{call.bridgeStatusUnavailable ? 'Unable to refresh call status. Check your phone.' : call.bridgeStage === 'calling_phone' ? `Answer ${call.ringToNumber ? formatPhoneDisplay(call.ringToNumber) : 'your phone'} to connect this call.` : call.phase === 'active' ? 'Continue this call on your phone.' : call.phase === 'ringing' ? 'Waiting for the client to answer.' : 'Connecting the client now.'}</p>}
        {incomingRinging && <p className="mt-3 text-sm text-[color:var(--portal-muted)]">Use the incoming call prompt to answer or decline.</p>}

        {isBrowserCall && call.phase === 'active' && showKeypad && (
          <div className="mt-5 grid w-full max-w-52 grid-cols-3 gap-2" aria-label="Call keypad">
            {KEYPAD_KEYS.map(({ digit }) => <button key={digit} type="button" onClick={() => sendDigit(digit)} aria-label={`Send ${digit}`} className="flex h-11 items-center justify-center rounded-lg bg-[color:var(--portal-soft)] text-lg font-semibold text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">{digit}</button>)}
          </div>
        )}
      </div>

      {isBrowserCall && !incomingRinging ? (
        <div className="flex items-start justify-center gap-5 pb-4">
          <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'} aria-pressed={isMuted} className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 ${isMuted ? 'bg-[#caa24c]/20 text-[#a8792f] dark:text-[#f1d27a]' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'}`}>{isMuted ? <MicOff size={20} /> : <Mic size={20} />}</button>
          {call.phase === 'active' && <button type="button" onClick={() => setShowKeypad(current => !current)} aria-label={showKeypad ? 'Hide call keypad' : 'Show call keypad'} aria-pressed={showKeypad} className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 ${showKeypad ? 'bg-[#caa24c]/20 text-[#a8792f] dark:text-[#f1d27a]' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'}`}><Grid size={20} /></button>}
          <button type="button" onClick={hangUp} aria-label="End call" className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"><PhoneOff size={21} /></button>
        </div>
      ) : !isBrowserCall && call.bridgeStatusUnavailable ? <button type="button" onClick={dismissBridgeNotice} className="mb-4 min-h-11 rounded-lg bg-[color:var(--portal-soft)] px-6 text-sm font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">Dismiss status</button> : null}
      {call.inquiryId && canViewLeadDetails && <div className="w-full pb-2 text-left">
        <button type="button" aria-expanded={showLeadDetails} aria-controls={leadDetailsId} onClick={() => setShowLeadDetails(current => !current)} className="flex min-h-11 w-full items-center justify-between rounded-xl bg-[color:var(--portal-soft)] px-4 text-sm font-semibold text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-border)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">Lead details <ChevronDown size={16} className={`text-[color:var(--portal-muted)] transition-transform motion-reduce:transition-none ${showLeadDetails ? 'rotate-180' : ''}`} /></button>
        <AnimatePresence initial={false}>{showLeadDetails && <motion.div id={leadDetailsId} key={call.inquiryId} initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }} className="overflow-hidden"><CallLeadDetails inquiryId={call.inquiryId} /></motion.div>}</AnimatePresence>
      </div>}
    </div>
  )
}

type CallLeadContext = {
  id: string
  fullName: string
  phone: string | null
  email: string | null
  eventType: string | null
  targetDate: string | null
  guestCount: number | null
  packageInterest: string | null
  status: string | null
  pipelineStage: string | null
  preferredTourDate: string | null
  preferredTourTime: string | null
  message: string | null
}

function CallLeadDetails({ inquiryId }: { inquiryId: string }) {
  const { canText, canEmail } = usePortalVoice()
  const [lead, setLead] = useState<CallLeadContext | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/twilio/calls/lead-context?id=${encodeURIComponent(inquiryId)}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Lead details are unavailable right now.')
        const result = await response.json() as CallLeadContext
        if (result.id !== inquiryId) throw new Error('Lead details are unavailable right now.')
        if (!controller.signal.aborted) setLead(result)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Lead details are unavailable right now.')
      }
    })()
    return () => controller.abort()
  }, [inquiryId, retry])

  if (error) return <div className="px-1 py-3 text-xs text-[color:var(--portal-muted)]"><span role="status">{error}</span> <button type="button" onClick={() => { setError(''); setRetry(current => current + 1) }} className="font-semibold text-[#a8792f] underline dark:text-[#f1d27a]">Try again</button> <Link className="ml-2 font-semibold text-[#a8792f] underline dark:text-[#f1d27a]" href={`/portal/leads/${encodeURIComponent(inquiryId)}`}>Open lead</Link></div>
  if (!lead) return <p className="px-1 py-4 text-xs text-[color:var(--portal-muted)]" role="status">Loading lead details…</p>

  const rows = [
    { label: 'Event', value: lead.eventType },
    { label: 'Event date', value: formatCallLeadDate(lead.targetDate) },
    { label: 'Guests', value: lead.guestCount != null ? String(lead.guestCount) : null },
    { label: 'Stage', value: (lead.pipelineStage || lead.status || '').replace(/_/g, ' ') || null },
    { label: 'Package interest', value: lead.packageInterest },
    { label: 'Preferred tour', value: [formatCallLeadDate(lead.preferredTourDate), formatCallLeadTime(lead.preferredTourTime)].filter(Boolean).join(' · ') || null },
  ].filter((row) => row.value)

  return (
    <div className="px-1 pb-2 pt-3 text-left">
      {rows.length ? <dl className="space-y-2.5">{rows.map(row => <div key={row.label} className="flex items-start justify-between gap-4 text-xs"><dt className="text-[color:var(--portal-muted)]">{row.label}</dt><dd className="min-w-0 text-right font-semibold text-[color:var(--portal-text)] first-letter:uppercase">{row.value}</dd></div>)}</dl> : <p className="text-xs text-[color:var(--portal-muted)]">No event details captured yet.</p>}
      {lead.message && <div className="mt-4 border-t border-[color:var(--portal-border)] pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Inquiry</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-[color:var(--portal-text)]">{lead.message}</p></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {canText && lead.phone && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('luxor-open-text', { detail: { inquiryId: lead.id, phone: lead.phone, contactName: lead.fullName } }))} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[color:var(--portal-soft)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-border)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"><MessageSquare size={14} /> Text</button>}
        {canEmail && lead.email && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead: { id: lead.id, full_name: lead.fullName, email: lead.email, event_type: lead.eventType } } }))} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[color:var(--portal-soft)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-border)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"><Mail size={14} /> Email</button>}
        <Link href={`/portal/leads/${encodeURIComponent(lead.id)}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#a8792f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#f1d27a]">Open lead <ChevronRight size={14} /></Link>
      </div>
    </div>
  )
}

function formatCallLeadDate(value: string | null) {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCallLeadTime(value: string | null) {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!match) return value
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return value
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`
}

function getNamedContact(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  if (lower === 'unknown caller' || lower === 'unknown' || lower === 'caller') return null
  if (/^[\d+\-()\s.]+$/.test(trimmed)) return null
  return trimmed
}

function isMissed(call: LuxorCall) {
  return (
    call.direction === 'inbound' &&
    ['busy', 'failed', 'no-answer', 'canceled'].includes(call.status)
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

function formatPhoneListTime(value: string) {
  const date = new Date(value)
  const timestamp = date.getTime()
  if (Number.isNaN(timestamp)) return ''
  const now = new Date()
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  if (isYesterday) return 'Yesterday'

  const diffDays = Math.floor((now.getTime() - timestamp) / 86_400_000)
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
