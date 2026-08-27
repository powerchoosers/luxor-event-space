'use client'

import React from 'react'
import { CalendarPlus, CheckCircle2, Download, Loader2, Mail, Send, ShieldCheck } from 'lucide-react'
import { PortalButton, PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

const LOCATION = 'Luxor at Las Palmas Events, 803 Castroville Rd #402, San Antonio, TX 78237'
const TIME_OPTIONS = Array.from({ length: 27 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  const labelHours = hours % 12 || 12
  return { value, label: `${labelHours}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}` }
})

const DURATION_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1 hour 30 minutes' },
]

type ConfigResponse = {
  configured?: boolean
  provider?: 'zoho'
  fromAddress?: string
  organizerEmail?: string
  timezone?: string
  error?: string
}

function tomorrowDateValue() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fieldClassName() {
  return 'h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-xs font-semibold text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 focus:ring-2 focus:ring-[#caa24c]/10'
}

function displayDate(dateValue: string, timeValue: string) {
  const date = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Choose a date'
  const time = TIME_OPTIONS.find((option) => option.value === timeValue)?.label || timeValue
  return `${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)} at ${time} CT`
}

export function CustomCalendarInviteTester({ defaultRecipientEmail = '' }: { defaultRecipientEmail?: string }) {
  const { notify } = useToast()
  const [config, setConfig] = React.useState<ConfigResponse | null>(null)
  const [attendeeEmail, setAttendeeEmail] = React.useState(defaultRecipientEmail)
  const [attendeeName, setAttendeeName] = React.useState('Calendar Test Guest')
  const [title, setTitle] = React.useState('Private Venue Tour — Luxor Event Space')
  const [date, setDate] = React.useState(tomorrowDateValue)
  const [startTime, setStartTime] = React.useState('10:00')
  const [durationMinutes, setDurationMinutes] = React.useState('30')
  const [location, setLocation] = React.useState(LOCATION)
  const [description, setDescription] = React.useState('A private appointment to tour Luxor Event Space and discuss your upcoming celebration.')
  const [eventUid, setEventUid] = React.useState('')
  const [busyAction, setBusyAction] = React.useState<'send' | 'download' | null>(null)
  const [lastMessageId, setLastMessageId] = React.useState('')
  const effectiveAttendeeEmail = attendeeEmail || defaultRecipientEmail

  React.useEffect(() => {
    fetch('/api/portal/calendar-invite-test', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as ConfigResponse
        if (!response.ok) throw new Error(payload.error || 'Could not check Zoho Mail configuration.')
        setConfig(payload)
      })
      .catch((error) => setConfig({ configured: false, error: error instanceof Error ? error.message : 'Could not check Zoho Mail configuration.' }))
  }, [])

  const requestInvite = async (mode: 'send' | 'download') => {
    setBusyAction(mode)
    try {
      const response = await fetch('/api/portal/calendar-invite-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          mode,
          attendeeEmail: effectiveAttendeeEmail,
          attendeeName,
          title,
          date,
          startTime,
          durationMinutes: Number(durationMinutes),
          location,
          description,
          uid: eventUid,
        }),
      })
      const payload = await response.json().catch(() => ({})) as {
        error?: string
        calendarContent?: string
        filename?: string
        uid?: string
        messageId?: string
      }
      if (!response.ok) throw new Error(payload.error || 'Could not create the calendar invitation.')
      if (payload.uid) setEventUid(payload.uid)

      if (mode === 'download') {
        const blob = new Blob([payload.calendarContent || ''], { type: 'text/calendar;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = payload.filename || 'luxor-event-space-invitation.ics'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
        notify({ title: 'Calendar file downloaded.', description: 'Open it to inspect the exact invitation Luxor will send.', variant: 'success' })
        return
      }

      setLastMessageId(payload.messageId || 'sent')
      notify({ title: 'Test invitation sent.', description: `Check ${effectiveAttendeeEmail} in Gmail, Outlook, or Apple Mail.`, variant: 'success' })
    } catch (error) {
      notify({
        title: mode === 'send' ? 'Test invitation not sent' : 'Calendar file not created',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setBusyAction(null)
    }
  }

  const zohoReady = config?.configured === true

  return (
    <section data-testid="calendar-invite-tester" className="luxor-glass-card min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6 xl:col-span-2">
      <div className="flex min-w-0 flex-col gap-3 border-b border-[color:var(--portal-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <CalendarPlus size={17} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Custom Calendar Invite Test</h3>
          </div>
          <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-[color:var(--portal-muted)]">
            Creates Luxor&apos;s own RFC 5545 meeting request and sends the .ics file through Zoho Mail. This test does not create, update, or remove a Zoho Calendar event.
          </p>
        </div>
        <div className={`inline-flex min-h-8 shrink-0 items-center gap-2 self-start rounded-lg border px-3 text-[9px] font-black uppercase tracking-wider ${
          config === null
            ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
            : zohoReady
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        }`}>
          {config === null ? <Loader2 size={12} className="animate-spin" /> : zohoReady ? <CheckCircle2 size={12} /> : <Mail size={12} />}
          {config === null ? 'Checking Zoho Mail' : zohoReady ? 'Zoho Mail ready' : 'Zoho Mail unavailable'}
        </div>
      </div>

      <div className="grid min-w-0 gap-6 pt-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:gap-8">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="min-w-0 space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Recipient email</span>
              <input type="email" value={effectiveAttendeeEmail} onChange={(event) => setAttendeeEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" className={fieldClassName()} />
            </label>
            <label className="min-w-0 space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Recipient name</span>
              <input value={attendeeName} onChange={(event) => setAttendeeName(event.target.value)} placeholder="Test guest" autoComplete="name" className={fieldClassName()} />
            </label>
          </div>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Invitation title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClassName()} />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Date</span>
              <PortalDatePicker value={date} onChange={setDate} className="w-full" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Start time</span>
              <PortalSelect value={startTime} onChange={setStartTime} options={TIME_OPTIONS} className="w-full min-w-0" buttonClassName="h-10" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Duration</span>
              <PortalSelect value={durationMinutes} onChange={setDurationMinutes} options={DURATION_OPTIONS} className="w-full min-w-0" buttonClassName="h-10" />
            </div>
          </div>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Location</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} className={fieldClassName()} />
          </label>

          <label className="block min-w-0 space-y-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className={`${fieldClassName()} h-auto min-h-24 resize-y py-3 leading-5`} />
          </label>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <PortalButton type="button" variant="primary" disabled={!zohoReady || busyAction !== null || !effectiveAttendeeEmail.trim()} onClick={() => void requestInvite('send')} className="w-full sm:w-auto">
              {busyAction === 'send' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {busyAction === 'send' ? 'Sending test' : 'Send test invite'}
            </PortalButton>
            <PortalButton type="button" disabled={busyAction !== null || !effectiveAttendeeEmail.trim()} onClick={() => void requestInvite('download')} className="w-full sm:w-auto">
              {busyAction === 'download' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {busyAction === 'download' ? 'Building file' : 'Download .ics'}
            </PortalButton>
          </div>
          {!zohoReady && config !== null ? (
            <p className="text-[10px] leading-5 text-amber-700 dark:text-amber-300">Downloading still works. Sending requires the existing Luxor Zoho Mail connection.</p>
          ) : null}
        </div>

        <aside className="min-w-0 border-t border-[color:var(--portal-border)] pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="flex items-center gap-2 text-[#a8792f]">
            <ShieldCheck size={15} aria-hidden="true" />
            <p className="text-[9px] font-black uppercase tracking-[0.16em]">Invitation preview</p>
          </div>
          <h4 className="mt-5 font-serif text-2xl font-semibold leading-tight text-[color:var(--portal-text)]">{title || 'Untitled invitation'}</h4>
          <p className="mt-3 text-sm font-bold leading-6 text-[color:var(--portal-text)]">{displayDate(date, startTime)}</p>
          <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{location || 'No location selected'}</p>
          <p className="mt-5 border-t border-[color:var(--portal-border)] pt-5 text-xs leading-5 text-[color:var(--portal-muted)]">{description || 'No description added.'}</p>
          <dl className="mt-6 space-y-3 text-[10px]">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <dt className="shrink-0 uppercase tracking-wider text-[color:var(--portal-faint)]">Organizer</dt>
              <dd className="min-w-0 break-all text-right font-semibold text-[color:var(--portal-text)]">{config?.organizerEmail || 'booking@luxoratlaspalmas.com'}</dd>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-4">
              <dt className="shrink-0 uppercase tracking-wider text-[color:var(--portal-faint)]">Delivery</dt>
              <dd className="text-right font-semibold text-[color:var(--portal-text)]">Zoho Mail · .ics request</dd>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-4">
              <dt className="shrink-0 uppercase tracking-wider text-[color:var(--portal-faint)]">Response</dt>
              <dd className="text-right font-semibold text-[color:var(--portal-text)]">Accept · Maybe · Decline</dd>
            </div>
          </dl>
          {lastMessageId ? (
            <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/8 p-3 text-[10px] leading-5 text-emerald-700 dark:text-emerald-300">
              Zoho Mail accepted the test message. Delivery ID: <span className="break-all font-mono">{lastMessageId}</span>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
