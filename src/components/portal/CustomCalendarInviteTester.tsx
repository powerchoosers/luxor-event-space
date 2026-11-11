'use client'

import React from 'react'
import { CalendarPlus, Download, Send, ShieldCheck } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalDatePicker, PortalSelect, PortalConstellationLoader, PortalSkeleton, PortalSkeletonTransition, PortalStatusBadge } from '@/components/portal/PortalUI'
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
  provider?: 'zoho-smtp' | 'resend-api'
  activeProvider?: 'zoho' | 'resend'
  providers?: Partial<Record<'zoho' | 'resend', { configured: boolean }>>
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

const fieldClass =
  'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15'

const labelClass = 'block text-xs font-medium text-[color:var(--portal-muted)]'

function displayDate(dateValue: string, timeValue: string) {
  const date = new Date(`${dateValue}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Choose a date'
  const time = TIME_OPTIONS.find((option) => option.value === timeValue)?.label || timeValue
  return `${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)} at ${time} CT`
}

export function CustomCalendarInviteTester({ defaultRecipientEmail = '' }: { defaultRecipientEmail?: string }) {
  const { notify } = useToast()
  const [config, setConfig] = React.useState<ConfigResponse | null>(null)
  const [provider, setProvider] = React.useState<'zoho' | 'resend'>('zoho')
  const [attendeeEmail, setAttendeeEmail] = React.useState(defaultRecipientEmail)
  const [emailEdited, setEmailEdited] = React.useState(false)
  const [attendeeName, setAttendeeName] = React.useState('Calendar Test Guest')
  const [title, setTitle] = React.useState('Private Venue Tour — Luxor Event Space')
  const [date, setDate] = React.useState(tomorrowDateValue)
  const [startTime, setStartTime] = React.useState('10:00')
  const [durationMinutes, setDurationMinutes] = React.useState('30')
  const [location, setLocation] = React.useState(LOCATION)
  const [description, setDescription] = React.useState('A private appointment to tour Luxor Event Space and discuss your upcoming celebration.')
  const inviteRevision = React.useRef<{ fingerprint: string; uid: string; stamp: string } | null>(null)
  const [busyAction, setBusyAction] = React.useState<'send' | 'download' | null>(null)
  const [lastMessageId, setLastMessageId] = React.useState('')

  React.useEffect(() => {
    if (!emailEdited && !attendeeEmail && defaultRecipientEmail) {
      setAttendeeEmail(defaultRecipientEmail)
    }
  }, [attendeeEmail, defaultRecipientEmail, emailEdited])

  React.useEffect(() => {
    fetch('/api/portal/calendar-invite-test', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as ConfigResponse
        if (!response.ok) throw new Error(payload.error || 'Could not check email configuration.')
        setConfig(payload)
        setProvider(payload.activeProvider || 'zoho')
      })
      .catch((error) => setConfig({ configured: false, error: error instanceof Error ? error.message : 'Could not check email configuration.' }))
  }, [])

  const requestInvite = async (mode: 'send' | 'download') => {
    setBusyAction(mode)
    try {
      const fingerprint = JSON.stringify({ provider, attendeeEmail, attendeeName, title, date, startTime, durationMinutes, location, description })
      if (inviteRevision.current?.fingerprint !== fingerprint) {
        inviteRevision.current = { fingerprint, uid: `settings-test-${crypto.randomUUID()}@luxoratlaspalmas.com`, stamp: new Date().toISOString() }
      }
      const response = await fetch('/api/portal/calendar-invite-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          mode,
          provider,
          attendeeEmail,
          attendeeName,
          title,
          date,
          startTime,
          durationMinutes: Number(durationMinutes),
          location,
          description,
          uid: inviteRevision.current.uid,
          stamp: inviteRevision.current.stamp,
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
      inviteRevision.current = null
      notify({ title: 'Test invitation sent.', description: `Check ${attendeeEmail} in Gmail, Outlook, or Apple Mail.`, variant: 'success' })
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

  const providerReady = config?.providers?.[provider]?.configured ?? config?.configured === true
  const providerLabel = provider === 'resend' ? 'Resend API' : 'Zoho SMTP'

  return (
    <section
      data-testid="calendar-invite-tester"
      className="min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarPlus size={17} className="shrink-0 text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
            <h3 className="text-base font-bold text-[color:var(--portal-text)]">Calendar invite test</h3>
          </div>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
            Send a sample invitation or download an .ics file without changing live mail settings.
          </p>
        </div>

        <PortalSkeletonTransition
          loading={config === null}
          overlap
          className="inline-flex items-center"
          skeleton={<PortalSkeleton className="h-5 w-28 rounded-md" />}
        >
          <PortalStatusBadge
            borderless
            tone={providerReady ? 'green' : 'gold'}
            status={providerReady ? `${providerLabel} ready` : `${providerLabel} unavailable`}
          />
        </PortalSkeletonTransition>
      </div>

      <div className="grid min-w-0 gap-6 pt-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)] xl:gap-8">
        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <span className={labelClass}>Test delivery provider</span>
            <PortalSelect
              value={provider}
              disabled={config === null || busyAction !== null}
              onChange={(value) => {
                setProvider(value === 'resend' ? 'resend' : 'zoho')
                setLastMessageId('')
              }}
              options={[
                { value: 'zoho', label: 'Zoho SMTP' },
                { value: 'resend', label: 'Resend API' },
              ]}
              buttonClassName="min-h-10"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="min-w-0 space-y-1.5">
              <span className={labelClass}>Recipient email</span>
              <input
                type="email"
                value={attendeeEmail}
                onChange={(event) => {
                  setEmailEdited(true)
                  setAttendeeEmail(event.target.value)
                }}
                placeholder="you@example.com"
                autoComplete="email"
                className={fieldClass}
              />
            </label>
            <label className="min-w-0 space-y-1.5">
              <span className={labelClass}>Recipient name</span>
              <input
                value={attendeeName}
                onChange={(event) => setAttendeeName(event.target.value)}
                placeholder="Test guest"
                autoComplete="name"
                className={fieldClass}
              />
            </label>
          </div>

          <label className="block min-w-0 space-y-1.5">
            <span className={labelClass}>Invitation title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <span className={labelClass}>Date</span>
              <PortalDatePicker value={date} onChange={setDate} className="w-full" triggerClassName="min-h-10" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <span className={labelClass}>Start time</span>
              <PortalSelect value={startTime} onChange={setStartTime} options={TIME_OPTIONS} className="w-full min-w-0" buttonClassName="min-h-10" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <span className={labelClass}>Duration</span>
              <PortalSelect value={durationMinutes} onChange={setDurationMinutes} options={DURATION_OPTIONS} className="w-full min-w-0" buttonClassName="min-h-10" />
            </div>
          </div>

          <label className="block min-w-0 space-y-1.5">
            <span className={labelClass}>Location</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} className={fieldClass} />
          </label>

          <label className="block min-w-0 space-y-1.5">
            <span className={labelClass}>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className={`${fieldClass} min-h-24 resize-y py-2.5 leading-5`}
            />
          </label>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <PortalButton
              type="button"
              variant="primary"
              disabled={!providerReady || busyAction !== null || !attendeeEmail.trim()}
              onClick={() => void requestInvite('send')}
              className="w-full sm:w-auto"
            >
              {busyAction === 'send' ? <PortalConstellationLoader size={13} tone="white" /> : <Send size={13} />}
              {busyAction === 'send' ? 'Sending test' : 'Send test invite'}
            </PortalButton>
            <PortalButton
              type="button"
              disabled={busyAction !== null || !attendeeEmail.trim()}
              onClick={() => void requestInvite('download')}
              className="w-full sm:w-auto"
            >
              {busyAction === 'download' ? <PortalConstellationLoader size={13} /> : <Download size={13} />}
              {busyAction === 'download' ? 'Building file' : 'Download .ics'}
            </PortalButton>
          </div>

          {!providerReady && config !== null ? (
            <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
              Downloading still works. Sending requires {provider === 'resend' ? 'RESEND_API_KEY and a verified domain' : 'the Zoho SMTP configuration'}.
            </p>
          ) : null}
        </div>

        <aside className="min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-[#a8792f] dark:text-[#caa24c]">
            <ShieldCheck size={15} aria-hidden="true" />
            <p className="text-xs font-semibold">Invitation preview</p>
          </div>
          <h4 className="mt-4 font-serif text-2xl font-semibold leading-tight text-[color:var(--portal-text)]">
            {title || 'Untitled invitation'}
          </h4>
          <p className="mt-2.5 text-sm font-semibold leading-6 tabular-nums text-[color:var(--portal-text)]">
            {displayDate(date, startTime)}
          </p>
          <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">
            {location || 'No location selected'}
          </p>
          <p className="mt-4 border-t border-[color:var(--portal-border)] pt-4 text-xs leading-5 text-[color:var(--portal-muted)]">
            {description || 'No description added.'}
          </p>
          <dl className="mt-5 space-y-2.5 text-xs">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <dt className="shrink-0 text-[color:var(--portal-muted)]">Organizer</dt>
              <dd className="min-w-0 break-all text-right font-semibold text-[color:var(--portal-text)]">
                {config?.organizerEmail || 'booking@luxoratlaspalmas.com'}
              </dd>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-4">
              <dt className="shrink-0 text-[color:var(--portal-muted)]">Delivery</dt>
              <dd className="text-right font-semibold text-[color:var(--portal-text)]">{providerLabel}</dd>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-4">
              <dt className="shrink-0 text-[color:var(--portal-muted)]">RSVP options</dt>
              <dd className="text-right font-semibold text-[color:var(--portal-text)]">Accept · Maybe · Decline</dd>
            </div>
          </dl>
          {lastMessageId ? (
            <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
              {providerLabel} accepted the test message. ID: <span className="break-all font-mono">{lastMessageId}</span>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
