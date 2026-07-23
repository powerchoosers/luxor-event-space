'use client'

import React, { useState, useMemo } from 'react'
import {
  Phone,
  MessageSquare,
  Mail,
  Users,
  Clock,
  Check,
  Calendar,
  UserPlus,
  Send,
  Loader2,
  CalendarCheck
} from 'lucide-react'
import { PortalSelect, PortalDatePicker } from '@/components/portal/PortalUI'
import { LuxorInquiry, LuxorInquiryStatus } from '@/lib/luxorInquiryTypes'
import { useToast } from '@/components/portal/ToastProvider'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'

interface CallCenterTabProps {
  inquiries: LuxorInquiry[]
  onUpdateInquiryStatus: (id: string, status: LuxorInquiryStatus, updates?: Partial<LuxorInquiry>) => Promise<void>
  onAddNote: (id: string, noteText: string) => Promise<void>
}

type Outcome =
  | 'no_answer'
  | 'left_voicemail'
  | 'interested'
  | 'tour_scheduled'
  | 'proposal_sent'
  | 'contract_sent'
  | 'booked'
  | 'not_interested'
  | 'wrong_number'
  | 'follow_up_tomorrow'
  | 'follow_up_next_week'

export function CallCenterTab({
  inquiries,
  onUpdateInquiryStatus,
  onAddNote
}: CallCenterTabProps) {
  const { notify } = useToast()

  // Filter to leads needing a call (status in: new, contacted, tour_requested)
  const queueLeads = useMemo(() => {
    return inquiries
      .filter((inq) => inq.status === 'new' || inq.status === 'contacted' || inq.status === 'tour_requested')
      .map((inq) => {
        const created = new Date(inq.created_at)
        const diffMs = Date.now() - created.getTime()
        const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)))
        const diffHours = Math.floor(diffMinutes / 60)
        
        let waitStr = diffMinutes <= 0 ? 'Just now' : `${diffMinutes} Min${diffMinutes === 1 ? '' : 's'}`
        if (diffHours >= 24) {
          const days = Math.floor(diffHours / 24)
          waitStr = `${days} Day${days > 1 ? 's' : ''}`
        } else if (diffHours > 0) {
          waitStr = `${diffHours} Hour${diffHours > 1 ? 's' : ''}`
        }

        return {
          ...inq,
          waitStr
        }
      })
  }, [inquiries])

  // Active Selected Lead
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
    queueLeads.length > 0 ? queueLeads[0].id : null
  )

  const selectedLead = useMemo(() => {
    return queueLeads.find((l) => l.id === selectedLeadId) || queueLeads[0] || null
  }, [queueLeads, selectedLeadId])

  // Active call notes & outcome states
  const [activeOutcome, setActiveOutcome] = useState<Outcome | null>(null)
  const [callNotes, setCallNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [assignedStaff, setAssignedStaff] = useState('Elena AI Coordinator')
  const [savingOutcome, setSavingOutcome] = useState(false)

  // Outcome labels mapping
  const outcomesList: { value: Outcome; label: string }[] = [
    { value: 'no_answer', label: 'No Answer' },
    { value: 'left_voicemail', label: 'Left Voicemail' },
    { value: 'interested', label: 'Interested' },
    { value: 'tour_scheduled', label: 'Tour Scheduled' },
    { value: 'proposal_sent', label: 'Proposal Sent' },
    { value: 'contract_sent', label: 'Contract Sent' },
    { value: 'booked', label: 'Booked' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'wrong_number', label: 'Wrong Number' },
    { value: 'follow_up_tomorrow', label: 'Follow Up Tomorrow' },
    { value: 'follow_up_next_week', label: 'Follow Up Next Week' }
  ]

  async function handleLogOutcome() {
    if (!selectedLead) return
    if (!activeOutcome) {
      notify({ title: 'Select outcome', description: 'Please select a call outcome before logging.', variant: 'error' })
      return
    }

    setSavingOutcome(true)
    try {
      // Map Outcome check state to inquiry status
      let nextStatus: LuxorInquiryStatus = selectedLead.status
      if (activeOutcome === 'booked') nextStatus = 'booked'
      else if (activeOutcome === 'tour_scheduled') nextStatus = 'tour_confirmed'
      else if (activeOutcome === 'proposal_sent') nextStatus = 'proposal_sent'
      else if (activeOutcome === 'not_interested' || activeOutcome === 'wrong_number') nextStatus = 'closed_lost'
      else nextStatus = 'contacted' // Defaults (voicemail, interested, etc.)

      // 1. Update Inquiry Status
      const outcomeLabel = outcomesList.find(o => o.value === activeOutcome)?.label || activeOutcome
      await onUpdateInquiryStatus(selectedLead.id, nextStatus)

      // 2. Add Outcome Note
      let noteText = `Call outcome logged: ${outcomeLabel}.`
      if (callNotes.trim()) {
        noteText += ` Notes: ${callNotes}`
      }
      if (followUpDate) {
        noteText += ` Follow-up scheduled on ${followUpDate}.`
      }
      await onAddNote(selectedLead.id, noteText)

      notify({
        title: 'Outcome Logged',
        description: `Lead status updated to ${nextStatus.replace('_', ' ')}.`,
        variant: 'success'
      })

      // Clean form states
      setCallNotes('')
      setActiveOutcome(null)
      setFollowUpDate('')

      // Select next lead in queue automatically if available
      const currentIndex = queueLeads.findIndex(l => l.id === selectedLead.id)
      if (currentIndex !== -1 && queueLeads[currentIndex + 1]) {
        setSelectedLeadId(queueLeads[currentIndex + 1].id)
      } else if (queueLeads.length > 1) {
        setSelectedLeadId(queueLeads[0].id)
      } else {
        setSelectedLeadId(null)
      }

    } catch (err) {
      notify({
        title: 'Failed to log call',
        description: err instanceof Error ? err.message : 'Unable to submit call outcome.',
        variant: 'error'
      })
    } finally {
      setSavingOutcome(false)
    }
  }

  // Pre-formatted followups
  function sendFollowUpEmail() {
    if (!selectedLead) return
    window.dispatchEvent(new CustomEvent('luxor-compose-email', {
      detail: {
        lead: selectedLead,
        email: selectedLead.email
      }
    }))
  }

  function sendFollowUpText() {
    if (!selectedLead) return
    window.location.assign(`/portal/leads/${selectedLead.id}?tab=messages`)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-h-0 flex-grow overflow-hidden">
      {/* Left Column: Call Queue list */}
      <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 flex flex-col space-y-4 min-h-0">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Call Queue</h3>
          <p className="text-[10px] text-zinc-500 mt-0.5">{queueLeads.length} leads waiting for contact</p>
        </div>

        <div className="flex-1 overflow-y-auto portal-scrollbar space-y-2.5 pr-1">
          {queueLeads.length > 0 ? (
            queueLeads.map((lead) => {
              const active = selectedLead?.id === lead.id
              return (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all flex flex-col justify-between ${
                    active
                      ? 'border-[#caa24c]/40 bg-[#caa24c]/5 shadow-[0_0_15px_rgba(202,162,76,0.06)]'
                      : 'border-zinc-900 bg-zinc-950/40 hover:border-zinc-800'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="text-xs font-black text-white">{lead.full_name}</h4>
                      <p className="text-[9px] uppercase tracking-widest text-[#caa24c] font-mono mt-1">
                        {lead.event_type || 'Event'} Inquiry
                      </p>
                    </div>
                    <span className="rounded bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[8px] font-bold text-blue-400 font-mono">
                      {lead.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-4 text-[9px] text-zinc-550 font-semibold font-mono border-t border-zinc-900/60 pt-3">
                    <span className="flex items-center gap-1">
                      <Clock size={10} className="text-[#caa24c]" />
                      Waiting: {lead.waitStr}
                    </span>
                    <span className="truncate max-w-[120px]">{lead.source}</span>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-12 text-xs text-zinc-650 font-medium">
              Call queue empty. All new inquiries contacted!
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Dossier, Call outcomes checkboxes, Follow-ups */}
      <div className="md:col-span-2 flex flex-col min-h-0">
        {selectedLead ? (
          <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-6 flex flex-col justify-between space-y-6 flex-1 min-h-0 overflow-hidden">
            {/* Dossier Header Info */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-zinc-900/60 pb-5">
              <div>
                <h2 className="text-base font-black text-white">{selectedLead.full_name}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-zinc-500 mt-1 font-semibold">
                  <span className="font-mono">{selectedLead.email}</span>
                  {selectedLead.phone && <button type="button" onClick={() => startLuxorBrowserCall({ phoneNumber: selectedLead.phone!, contactName: selectedLead.full_name, inquiryId: selectedLead.id })} className="font-mono transition-colors hover:text-emerald-400" title="Call from Luxor">{formatPhoneDisplay(selectedLead.phone)}</button>}
                  <span>Source: <strong className="text-zinc-400">{selectedLead.source}</strong></span>
                </div>
              </div>

              {/* Action Circle Buttons */}
              <div className="flex items-center gap-2">
                {selectedLead.phone && (
                  <button
                    type="button"
                    onClick={() => startLuxorBrowserCall({
                      phoneNumber: selectedLead.phone!,
                      contactName: selectedLead.full_name,
                      inquiryId: selectedLead.id,
                    })}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
                    title={`Call ${selectedLead.full_name}`}
                  >
                    <Phone size={14} />
                  </button>
                )}
                {selectedLead.phone && (
                  <button
                    onClick={sendFollowUpText}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
                    title={`Text ${selectedLead.full_name}`}
                  >
                    <MessageSquare size={14} />
                  </button>
                )}
                {selectedLead.email && (
                  <button
                    onClick={sendFollowUpEmail}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
                    title={`Email ${selectedLead.full_name}`}
                  >
                    <Mail size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Content: Outcome checklists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0 overflow-y-auto portal-scrollbar">
              {/* Outcomes Box */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Call Outcome</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  {outcomesList.map((out) => {
                    const checked = activeOutcome === out.value
                    return (
                      <button
                        type="button"
                        key={out.value}
                        onClick={() => setActiveOutcome(out.value)}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          checked
                            ? 'border-[#caa24c]/40 bg-[#caa24c]/5 text-[#dfbd68] font-bold'
                            : 'border-zinc-900 bg-zinc-950/40 text-zinc-400 hover:border-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                          checked ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-zinc-800 bg-zinc-900'
                        }`}>
                          {checked && <Check size={10} strokeWidth={3} />}
                        </div>
                        <span className="truncate">{out.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* After call notes / followup */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#caa24c]">After Call Actions</h4>
                
                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-zinc-550">Call Notes</label>
                  <textarea
                    rows={3}
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    placeholder="Provide a short brief of client requirements..."
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
                  />
                </div>

                {/* Follow up Date */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-zinc-550">Schedule Follow-up</label>
                  <PortalDatePicker
                    value={followUpDate}
                    onChange={setFollowUpDate}
                  />
                </div>

                {/* Assign to Staff */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-zinc-550">Assign Planner</label>
                  <PortalSelect
                    value={assignedStaff}
                    onChange={setAssignedStaff}
                    options={[
                      { value: 'Elena AI Coordinator', label: 'Elena AI Coordinator' },
                      { value: 'Portal Owner', label: 'Portal Owner' }
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-900/60 pt-5 mt-auto">
              {/* Follow-up Quick Action Links */}
              <div className="flex items-center gap-3">
                <button
                  onClick={sendFollowUpEmail}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[#caa24c] hover:text-[#dfbd68]"
                >
                  <Mail size={11} /> Send Email Follow-up
                </button>
                <span className="text-zinc-850">|</span>
                <button
                  onClick={sendFollowUpText}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[#caa24c] hover:text-[#dfbd68]"
                >
                  <MessageSquare size={11} /> Send SMS Follow-up
                </button>
              </div>

              {/* Save Outcome Button */}
              <button
                onClick={handleLogOutcome}
                disabled={savingOutcome || !activeOutcome}
                className="flex items-center gap-2 rounded-xl bg-[#caa24c] disabled:bg-zinc-800 disabled:text-zinc-600 disabled:opacity-50 px-5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-white shadow-xl shadow-[#caa24c]/10 hover:bg-[#dfbd68] transition-all hover:scale-105 active:scale-95"
              >
                {savingOutcome ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Saving Outcome...
                  </>
                ) : (
                  <>
                    <CalendarCheck size={13} />
                    Log Outcome & Next
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-12 text-center text-xs text-zinc-650 flex-1 flex flex-col justify-center">
            <Users size={32} className="mx-auto text-zinc-800 mb-3" />
            No active lead selected. Click any lead in the left queue to open details.
          </div>
        )}
      </div>
    </div>
  )
}
