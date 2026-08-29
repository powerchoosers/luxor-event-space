'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useLuxorTourSlots } from '@/hooks/useLuxorTourSlots'
import { formatTourSlotTime, LUXOR_TOUR_TIME_OPTIONS } from '@/lib/luxorTourSlots'
import { isGuestCountOverCapacity, LUXOR_EVENT_TYPES, LUXOR_GUEST_CAPACITY_MESSAGE, LUXOR_GUEST_CAPACITY_MESSAGE_ES, type LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import { PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'

type Locale = 'en' | 'es'

const WINDOWS = [
  ['Weekday morning', 'Weekday morning'],
  ['Weekday afternoon', 'Weekday afternoon'],
  ['Weekday evening', 'Weekday evening'],
  ['Weekend', 'Weekend'],
  ['Flexible', 'I am flexible'],
] as const

const BUDGET_OPTIONS = [
  ['Under $5,000', 'Under $5,000'],
  ['$5,000–$10,000', '$5,000–$10,000'],
  ['$10,000–$15,000', '$10,000–$15,000'],
  ['$15,000–$20,000', '$15,000–$20,000'],
  ['$20,000+', '$20,000+'],
  ['Not sure yet', 'Not sure yet'],
] as const

const publicDatePickerClass = 'w-full [&>button]:min-h-12 [&>button]:rounded-lg [&>button]:bg-[#fffdfa] [&>button]:px-3 [&>button]:text-sm [&>button]:normal-case [&>button]:tracking-normal'

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function TourRequestForm({ locale = 'en' }: { locale?: Locale }) {
  const spanish = locale === 'es'
  const { slots, loading: slotsLoading, error: slotsError } = useLuxorTourSlots()
  const [eventType, setEventType] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [budget, setBudget] = useState('')
  const [slotId, setSlotId] = useState('')
  const [customTourTime, setCustomTourTime] = useState('')
  const [tourWindow, setTourWindow] = useState('')
  const [tourLanguage, setTourLanguage] = useState<Locale | 'none'>(locale)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dateSlots = useMemo(() => slots.filter((slot) => slot.date === targetDate), [slots, targetDate])
  const selectedSlot = slots.find((slot) => slot.id === slotId)

  function changeDate(value: string) {
    setTargetDate(value)
    setSlotId('')
    setCustomTourTime('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!eventType || !fullName.trim() || !email.trim()) {
      setError(spanish ? 'Agrega el tipo de evento, tu nombre y tu correo para recibir la invitación del calendario.' : 'Add your event type, full name, and email so we can send your calendar invitation.')
      return
    }
    if (!targetDate || (!slotId && !customTourTime)) {
      setError(spanish ? 'Elige la fecha y hora de tu recorrido para que podamos enviar la invitación del calendario.' : 'Choose your tour date and time so we can send the calendar invitation.')
      return
    }
    if (isGuestCountOverCapacity(guestCount)) {
      setError(spanish ? LUXOR_GUEST_CAPACITY_MESSAGE_ES : LUXOR_GUEST_CAPACITY_MESSAGE)
      return
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(spanish ? 'Revisa tu correo electrónico.' : 'Please check your email address.')
      return
    }
    setSubmitting(true)
    const preferredTourDate = selectedSlot?.date || targetDate
    const preferredTourTime = selectedSlot?.time || (customTourTime ? formatTourSlotTime(`${customTourTime}:00`) : tourWindow)
    const payload: LuxorInquiryInput = {
      fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), eventType,
      targetDate: eventDate, guestCount, budget, preferredTourDate, preferredTourTime, message: message.trim(),
      source: 'tour_page', flow: 'tour_request', marketingOptIn,
      pagePath: typeof window === 'undefined' ? '/tour' : window.location.pathname,
      metadata: {
        selectedTourSlotId: slotId || null,
        preferredTourWindow: tourWindow || null,
        customTourTime: customTourTime || null,
        websiteLocale: locale,
        tourLanguagePreference: tourLanguage,
        autoScheduleTour: true,
      },
    }
    try {
      const response = await fetch('/api/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'The tour request could not be submitted.')
      setSubmitted(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The tour request could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return <div className="rounded-2xl border border-[#b98a3d]/35 bg-white p-6 shadow-[0_25px_80px_-44px_rgba(56,38,20,0.45)] sm:p-9"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#b98a3d] text-white"><Check size={22} /></div><h2 className="mt-6 font-serif text-4xl">{spanish ? 'Tu recorrido está programado.' : 'Your tour is scheduled.'}</h2><p className="mt-3 text-sm leading-6 text-[#665a4e]">{spanish ? 'Enviamos la invitación a tu calendario y los detalles del recorrido a tu correo. Puedes usar el enlace de ese correo si necesitas reprogramarlo.' : 'We sent your calendar invitation and tour details to your email. Use the link in that email if you need to reschedule.'}</p></div>
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#b98a3d]/30 bg-white p-5 shadow-[0_25px_80px_-44px_rgba(56,38,20,0.45)] sm:p-8">
      <div className="border-b border-[#b98a3d]/20 pb-5"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#8d672b]">{spanish ? 'Solicita un recorrido' : 'Schedule a tour'}</p><h2 className="mt-2 font-serif text-3xl text-[#241d17]">{spanish ? 'Cuéntanos cuándo te gustaría venir.' : 'Tell us when you would like to come.'}</h2></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label={spanish ? 'Tipo de evento' : 'Event type'}><PortalSelect theme="light" value={eventType} onChange={setEventType} options={LUXOR_EVENT_TYPES.map((type) => ({ value: type, label: type }))} placeholder={spanish ? 'Selecciona una opción' : 'Select an event'} className="w-full" buttonClassName="min-h-12 rounded-lg bg-[#fffdfa] px-3 text-sm normal-case tracking-normal" /></Field>
        <Field label={spanish ? 'Invitados esperados' : 'Expected guests'}><input value={guestCount} onChange={(event) => setGuestCount(event.target.value)} inputMode="numeric" placeholder="For example, 120" className={inputClass} />{isGuestCountOverCapacity(guestCount) ? <span role="alert" className="mt-2 block text-xs leading-5 text-rose-700">{spanish ? LUXOR_GUEST_CAPACITY_MESSAGE_ES : LUXOR_GUEST_CAPACITY_MESSAGE}</span> : null}</Field>
        <Field label={spanish ? 'Presupuesto estimado' : 'Planning budget'}><PortalSelect theme="light" value={budget} onChange={setBudget} options={BUDGET_OPTIONS.map(([value, label]) => ({ value, label: spanish && value === 'Not sure yet' ? 'Aún no estoy seguro' : label }))} placeholder={spanish ? 'Selecciona un rango' : 'Choose a range'} className="w-full" buttonClassName="min-h-12 rounded-lg bg-[#fffdfa] px-3 text-sm normal-case tracking-normal" /></Field>
        <Field label={spanish ? 'Fecha del evento' : 'Event date'}><PortalDatePicker theme="light" value={eventDate} onChange={setEventDate} placeholder={spanish ? 'Indica una fecha' : 'Tell us your event date'} className={publicDatePickerClass} /></Field>
        <Field label={spanish ? 'Fecha del recorrido' : 'Tour date'}><PortalDatePicker theme="light" value={targetDate} onChange={changeDate} placeholder={spanish ? 'Indica una fecha' : 'Choose a date'} className={publicDatePickerClass} /><span className="mt-2 block text-[11px] text-[#827567]">{spanish ? 'Elige cualquier fecha; confirmaremos la disponibilidad.' : 'Choose any date; we will confirm availability.'}</span></Field>
        <Field label={spanish ? 'Hora del recorrido' : 'Tour time'}><PortalSelect theme="light" value={slotId || (customTourTime ? `custom:${customTourTime}` : '')} onChange={(value) => { if (value.startsWith('custom:')) { setSlotId(''); setCustomTourTime(value.slice(7)) } else { setSlotId(value); setCustomTourTime('') } }} disabled={!targetDate || slotsLoading} options={[...dateSlots.map((slot) => ({ value: slot.id, label: `${slot.time} · available` })), ...LUXOR_TOUR_TIME_OPTIONS.map((option) => ({ value: `custom:${option.value}`, label: `${option.label} · request this time` }))]} placeholder={targetDate ? (spanish ? 'Selecciona una hora' : 'Choose a time') : (spanish ? 'Primero elige una fecha' : 'Choose a date first')} className="w-full" buttonClassName="min-h-12 rounded-lg bg-[#fffdfa] px-3 text-sm normal-case tracking-normal" /><span className="mt-2 block text-[11px] text-[#827567]">{dateSlots.length ? (spanish ? 'Las horas disponibles se muestran primero.' : 'Available times are shown first.') : (spanish ? 'Puedes solicitar una hora específica.' : 'You can request a specific time.')}</span></Field>
        <Field label={spanish ? 'Idioma del recorrido' : 'Tour language'}><PortalSelect theme="light" value={tourLanguage} onChange={(value) => setTourLanguage(value as Locale | 'none')} options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }, { value: 'none', label: spanish ? 'Sin preferencia' : 'No preference' }]} className="w-full" buttonClassName="min-h-12 rounded-lg bg-[#fffdfa] px-3 text-sm normal-case tracking-normal" /></Field>
        <Field label={spanish ? 'Nombre completo' : 'Full name'}><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" className={inputClass} required /></Field>
        <Field label={spanish ? 'Correo electrónico' : 'Email'}><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className={inputClass} /></Field>
        <Field label={spanish ? 'Teléfono' : 'Phone'}><input value={phone} onChange={(event) => setPhone(formatPhoneNumber(event.target.value))} type="tel" inputMode="numeric" autoComplete="tel" className={inputClass} /></Field>
      </div>
      {slotsError ? <p className="mt-4 text-sm text-rose-700">{slotsError}</p> : null}
      <label className="mt-5 block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">{spanish ? 'Notas (opcional)' : 'Notes (optional)'}</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={3000} rows={3} placeholder={spanish ? 'Cuéntanos qué estás planeando…' : 'Tell us what you are planning…'} className={`${inputClass} h-auto resize-none py-3`} /></label>
      <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-[#665a4e]"><input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-[#b98a3d] accent-[#b98a3d]" />{spanish ? 'Envíame ocasionalmente noticias y consejos de planificación.' : 'Email me occasional Luxor news and planning ideas.'}</label>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-rose-700/20 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      <button type="submit" disabled={submitting} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#b98a3d] px-5 text-sm font-bold uppercase tracking-[0.12em] !text-white transition hover:bg-[#9d722e] disabled:cursor-not-allowed disabled:opacity-60">{submitting ? <Loader2 size={16} className="animate-spin" /> : null}{submitting ? (spanish ? 'Enviando…' : 'Sending…') : (spanish ? 'Solicitar recorrido' : 'Request this tour')}</button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">{label}</span>{children}</label> }

const inputClass = 'min-h-12 w-full rounded-lg border border-[#b98a3d]/25 bg-[#fffdfa] px-3 text-sm text-[#241d17] outline-none transition placeholder:text-[#8b7b6b] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#b98a3d]/15'
