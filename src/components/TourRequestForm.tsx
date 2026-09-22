'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Check, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon, Clock, MapPin } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLuxorTourSlots } from '@/hooks/useLuxorTourSlots'
import { formatTourSlotDate, formatTourSlotTime } from '@/lib/luxorTourSlots'
import {
  isGuestCountOverCapacity,
  LUXOR_EVENT_TYPES,
  LUXOR_GUEST_CAPACITY_MESSAGE,
  LUXOR_GUEST_CAPACITY_MESSAGE_ES,
  type LuxorInquiryInput,
} from '@/lib/luxorInquiryTypes'
import { PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import { PublicPhoneLink } from '@/components/PublicPhoneLink'

type Locale = 'en' | 'es'

const publicDatePickerClass =
  'w-full [&>button]:min-h-12 [&>button]:rounded-xl [&>button]:border-[#d8c4a4] [&>button]:bg-[#fffdfa] [&>button]:px-3.5 [&>button]:text-sm [&>button]:normal-case [&>button]:tracking-normal hover:[&>button]:border-[#caa24c]'

const eventTypeLabelsEs: Record<(typeof LUXOR_EVENT_TYPES)[number], string> = {
  Wedding: 'Boda',
  Quinceañera: 'Quinceañera',
  'Baby shower': 'Baby shower',
  Birthday: 'Cumpleaños',
  Anniversary: 'Aniversario',
  'Corporate event': 'Evento corporativo',
  'Private celebration': 'Celebración privada',
  Other: 'Otro',
}

const budgetOptions = [
  { value: 'Under $5,000', labelEn: 'Under $5,000', labelEs: 'Menos de $5,000' },
  { value: '$5,000–$10,000', labelEn: '$5,000–$10,000', labelEs: '$5,000–$10,000' },
  { value: '$10,000–$20,000', labelEn: '$10,000–$20,000', labelEs: '$10,000–$20,000' },
  { value: '$20,000+', labelEn: '$20,000+', labelEs: '$20,000+' },
  { value: 'Not sure yet', labelEn: 'Not sure yet', labelEs: 'Aún no lo sé' },
]

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function formatFullDateDisplay(dateStr: string, locale: Locale) {
  if (!dateStr) return ''
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  } catch {
    return dateStr
  }
}

function parseTimeToHoursMinutes(timeStr: string) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return { hours: 13, minutes: 0 }
  let hours = Number(match[1]) % 12
  if (match[3].toUpperCase() === 'PM') hours += 12
  const minutes = Number(match[2])
  return { hours, minutes }
}

function createCalendarLinks(dateStr: string, timeStr: string) {
  if (!dateStr || !timeStr) return { googleUrl: '#', icsDataUri: '#' }
  const { hours, minutes } = parseTimeToHoursMinutes(timeStr)
  const [year, month, day] = dateStr.split('-').map(Number)

  // Start Date
  const start = new Date(year, month - 1, day, hours, minutes)
  const end = new Date(start.getTime() + 45 * 60_000)

  const toIsoCompact = (d: Date) => {
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  }

  const title = encodeURIComponent('Visit at Luxor at Las Palmas Events')
  const details = encodeURIComponent(
    'Private venue visit at Luxor at Las Palmas Events.\n803 Castroville Rd #402, San Antonio, TX 78237.\nPhone: (210) 906-8803',
  )
  const location = encodeURIComponent('Luxor at Las Palmas Events, 803 Castroville Rd #402, San Antonio, TX 78237')
  const dates = `${toIsoCompact(start)}/${toIsoCompact(end)}`

  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Luxor at Las Palmas//Visit Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTAMP:${toIsoCompact(new Date())}`,
    `DTSTART:${toIsoCompact(start)}`,
    `DTEND:${toIsoCompact(end)}`,
    'SUMMARY:Visit at Luxor at Las Palmas Events',
    'DESCRIPTION:Private venue visit at Luxor at Las Palmas Events.\\n803 Castroville Rd #402, San Antonio, TX 78237.',
    'LOCATION:Luxor at Las Palmas Events, 803 Castroville Rd #402, San Antonio, TX 78237',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  const icsDataUri = `data:text/calendar;charset=utf8,${encodeURIComponent(icsLines)}`

  return { googleUrl, icsDataUri }
}

export function TourRequestForm({ locale = 'en' }: { locale?: Locale }) {
  const spanish = locale === 'es'
  const { slots, loading: slotsLoading, error: slotsError } = useLuxorTourSlots()

  // Form Step: 1 = Choose a Time, 2 = Your Information, 3 = Event Details, 4 = Confirmation
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1 State: Date & Slot
  const [targetDate, setTargetDate] = useState('')
  const [slotId, setSlotId] = useState('')
  const [showCalendarPicker, setShowCalendarPicker] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customTourTime, setCustomTourTime] = useState('')
  const [alternateDate, setAlternateDate] = useState('')
  const [tourLanguage, setTourLanguage] = useState<Locale | 'none'>(locale)

  // Step 2 State: Contact
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // Step 3 State: Event Details
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [budget, setBudget] = useState('')
  const [message, setMessage] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)

  // Submission State
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const isInitialStep = useRef(true)

  const scrollToFormTop = () => {
    if (typeof window === 'undefined') return
    requestAnimationFrame(() => {
      const el = containerRef.current || document.getElementById('visit-booking')
      if (!el) return
      const rect = el.getBoundingClientRect()
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      window.scrollTo({
        top: Math.max(0, scrollTop + rect.top - 96),
        behavior: 'smooth',
      })
    })
  }

  useEffect(() => {
    if (isInitialStep.current) {
      isInitialStep.current = false
      return
    }
    scrollToFormTop()
  }, [step])

  // Date computations
  const availableDates = useMemo(() => new Set(slots.map((slot) => slot.date)), [slots])

  // Group slots by date in chronological order
  const groupedDates = useMemo(() => {
    const map = new Map<string, typeof slots>()
    for (const slot of slots) {
      if (!map.has(slot.date)) {
        map.set(slot.date, [])
      }
      map.get(slot.date)!.push(slot)
    }
    const dates = Array.from(map.keys()).sort()
    return dates.map((d) => ({
      date: d,
      slots: map.get(d)!,
    }))
  }, [slots])

  // Initial next available dates (up to 3 dates to keep mobile view focused)
  const visibleNextDates = useMemo(() => {
    return groupedDates.slice(0, 3)
  }, [groupedDates])

  const selectedSlot = useMemo(() => slots.find((slot) => slot.id === slotId), [slots, slotId])
  const selectedDateSlots = useMemo(() => slots.filter((slot) => slot.date === targetDate), [slots, targetDate])

  const chosenDate = selectedSlot?.date || targetDate
  const chosenTime = selectedSlot?.time || (customTourTime ? formatTourSlotTime(`${customTourTime}:00`) : '')

  function handleSelectSlot(slot: (typeof slots)[number]) {
    setSlotId(slot.id)
    setTargetDate(slot.date)
    setCustomMode(false)
    setCustomTourTime('')
    setError(null)
  }

  function handleDatePicked(val: string) {
    setTargetDate(val)
    setSlotId('')
    setCustomTourTime('')
    setError(null)
  }

  function handleNextFromStep1() {
    setError(null)
    if (!customMode) {
      if (!slotId || !targetDate) {
        setError(spanish ? 'Por favor selecciona un horario disponible para continuar.' : 'Please select an available visit time to continue.')
        return
      }
    } else {
      if (!targetDate || !customTourTime) {
        setError(spanish ? 'Por favor indica la fecha y hora que prefieres.' : 'Please choose your preferred date and time.')
        return
      }
    }
    setStep(2)
  }

  function handleNextFromStep2() {
    setError(null)
    if (!fullName.trim()) {
      setError(spanish ? 'Ingresa tu nombre completo.' : 'Please enter your full name.')
      return
    }
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(spanish ? 'Ingresa un correo electrónico válido para tu confirmación.' : 'Please enter a valid email address for your confirmation.')
      return
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
      setError(spanish ? 'Ingresa un número de teléfono válido (10 dígitos).' : 'Please enter a valid 10-digit phone number.')
      return
    }
    setStep(3)
  }

  async function handleFinalSubmit(e?: FormEvent) {
    if (e) e.preventDefault()
    setError(null)

    if (isGuestCountOverCapacity(guestCount)) {
      setError(spanish ? LUXOR_GUEST_CAPACITY_MESSAGE_ES : LUXOR_GUEST_CAPACITY_MESSAGE)
      return
    }

    setSubmitting(true)
    try {
      const { trackLuxorPublicEvent } = await import('@/lib/luxorPublicAttribution')
      trackLuxorPublicEvent('visit_cta_click', {
        label: customMode ? 'Request Visit Submit' : 'Schedule a Visit Submit',
        form_flow: customMode ? 'custom_visit_request' : 'visit_booking',
      })
    } catch {
      // Non-blocking
    }

    const preferredTourDate = selectedSlot?.date || targetDate
    const preferredTourTime = selectedSlot?.time || (customTourTime ? formatTourSlotTime(`${customTourTime}:00`) : '')

    const payload: LuxorInquiryInput = {
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      eventType: eventType || 'Private celebration',
      targetDate: eventDate,
      guestCount,
      budget,
      preferredTourDate,
      preferredTourTime,
      message: message.trim(),
      source: 'visit_page',
      flow: customMode ? 'custom_visit_request' : 'visit_booking',
      marketingOptIn,
      pagePath: typeof window === 'undefined' ? '/visit' : window.location.pathname,
      metadata: {
        selectedTourSlotId: slotId || null,
        preferredTourWindow: null,
        customTourTime: customTourTime || null,
        websiteLocale: locale,
        tourLanguagePreference: tourLanguage,
        autoScheduleTour: Boolean(slotId && !customMode),
        tourBookingType: slotId && !customMode ? 'confirmed_slot' : 'pending_custom_request',
        alternateTourDate: alternateDate || null,
      },
    }

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error || (spanish ? 'No se pudo enviar la solicitud de visita.' : 'The visit request could not be submitted.'))
      }

      setStep(4)

      try {
        const { trackLuxorPublicEvent } = await import('@/lib/luxorPublicAttribution')
        trackLuxorPublicEvent('visit_booked', {
          label: 'Visit Request Confirmed',
          preferred_tour_date: preferredTourDate,
        })
      } catch {
        // Non-blocking
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : spanish ? 'No se pudo enviar la solicitud de visita.' : 'The visit request could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  const calendarLinks = useMemo(() => {
    return createCalendarLinks(chosenDate, chosenTime)
  }, [chosenDate, chosenTime])

  const stepLabels = [
    { num: 1, labelEn: 'Choose a time', labelEs: 'Elige un horario' },
    { num: 2, labelEn: 'Your info', labelEs: 'Tu información' },
    { num: 3, labelEn: 'Event details', labelEs: 'Detalles del evento' },
    { num: 4, labelEn: 'Confirmation', labelEs: 'Confirmación' },
  ]

  return (
    <div
      ref={containerRef}
      id="visit-booking"
      className="scroll-mt-28 rounded-2xl border border-[#b98a3d]/30 bg-white p-5 shadow-[0_25px_80px_-44px_rgba(56,38,20,0.45)] sm:scroll-mt-32 sm:p-8"
    >
      {/* 4-Step Progress Indicator */}
      <nav aria-label="Booking steps" className="mb-6 border-b border-[#b98a3d]/20 pb-5">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {stepLabels.map((s, idx) => {
            const isCompleted = step > s.num
            const isCurrent = step === s.num
            return (
              <div key={s.num} className="flex flex-1 items-center">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors sm:h-7 sm:w-7 ${
                      isCompleted
                        ? 'bg-[#b98a3d] text-white shadow-sm'
                        : isCurrent
                          ? 'border-2 border-[#b98a3d] bg-[#fbf7ef] text-[#8d672b]'
                          : 'border border-[#d8c4a4] bg-[#faf7f2] text-[#a89989]'
                    }`}
                  >
                    {isCompleted ? <Check size={13} strokeWidth={3} /> : <span>{s.num}</span>}
                  </div>
                  <span
                    className={`hidden text-xs font-medium transition-colors md:inline ${
                      isCurrent
                        ? 'font-bold text-[#241d17]'
                        : isCompleted
                          ? 'text-[#8d672b]'
                          : 'text-[#a89989]'
                    }`}
                  >
                    {spanish ? s.labelEs : s.labelEn}
                  </span>
                </div>
                {idx < stepLabels.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 transition-colors ${
                      step > s.num ? 'bg-[#b98a3d]' : 'bg-[#d8c4a4]/40'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
        {/* Mobile current step title badge */}
        <div className="mt-2 text-center text-xs font-bold uppercase tracking-wider text-[#8d672b] md:hidden">
          {spanish ? stepLabels[step - 1].labelEs : stepLabels[step - 1].labelEn}
        </div>
      </nav>

      {/* STEP 1: CHOOSE A TIME */}
      {step === 1 && (
        <motion.div
          key="step-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          <div>
            <h2 className="font-serif text-3xl font-semibold text-[#241d17] sm:text-4xl">
              {spanish ? 'Ven a conocer Luxor en persona.' : 'Come see Luxor in person.'}
            </h2>
            <p className="mt-1.5 text-sm text-[#665a4e] sm:text-base">
              {spanish
                ? 'Elige el horario de visita que mejor se adapte a tu agenda.'
                : 'Choose a visit time that works best for you.'}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#b98a3d]/25 bg-[#faf6ef] px-3.5 py-1 text-xs font-medium text-[#8d672b]">
              <span>{spanish ? 'Visitas de cortesía • Con cita previa' : 'Complimentary visits • By appointment'}</span>
            </div>
          </div>

          {/* Quick Slot Discovery */}
          {!customMode ? (
            <div className="mt-6 space-y-5">
              {slotsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#8d672b]">
                  <Loader2 size={28} className="animate-spin text-[#b98a3d]" />
                  <p className="mt-3 text-xs uppercase tracking-widest font-mono">
                    {spanish ? 'Cargando disponibilidad...' : 'Loading visit availability...'}
                  </p>
                </div>
              ) : slotsError ? (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800">
                  {slotsError}
                </div>
              ) : visibleNextDates.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between pb-2">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#8d672b]">
                      {spanish ? 'Próximas visitas disponibles' : 'Next Available Visits'}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {visibleNextDates.map((group) => {
                      const dateDisplay = formatTourSlotDate(group.date)
                      return (
                        <div
                          key={group.date}
                          className="rounded-xl border border-[#d8c4a4]/45 bg-[#fdfbf7] p-3.5 transition hover:border-[#b98a3d]/50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-[#241d17]">{dateDisplay}</span>
                            <span className="text-[11px] text-[#8d672b]">
                              {group.slots.length}{' '}
                              {spanish
                                ? group.slots.length === 1
                                  ? 'horario disponible'
                                  : 'horarios disponibles'
                                : group.slots.length === 1
                                  ? 'time available'
                                  : 'times available'}
                            </span>
                          </div>

                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {group.slots.map((slot) => {
                              const isSelected = slotId === slot.id
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => handleSelectSlot(slot)}
                                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                                    isSelected
                                      ? 'border-[#b98a3d] bg-[#b98a3d] text-white shadow-sm ring-2 ring-[#b98a3d]/20'
                                      : 'border-[#d8c4a4] bg-white text-[#241d17] hover:border-[#b98a3d] hover:bg-[#faf6ef]'
                                  }`}
                                >
                                  {slot.time}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[#d8c4a4]/40 bg-[#fdfbf7] p-5 text-center text-sm text-[#665a4e]">
                  {spanish
                    ? 'No hay horarios automáticos próximos en este momento. Usa el calendario abajo para explorar o solicitar una fecha.'
                    : 'No upcoming automatic slots right now. Use the calendar below to explore or request a date.'}
                </div>
              )}

              {/* View More Dates Calendar Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowCalendarPicker((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8d672b] underline underline-offset-4 hover:text-[#6a4c1b]"
                >
                  <CalendarIcon size={14} />
                  <span>
                    {showCalendarPicker
                      ? spanish
                        ? 'Ocultar calendario'
                        : 'Hide calendar'
                      : spanish
                        ? 'Ver más fechas en el calendario'
                        : 'View more dates'}
                  </span>
                </button>

                <AnimatePresence>
                  {showCalendarPicker && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 overflow-hidden rounded-xl border border-[#d8c4a4]/50 bg-[#faf6ef] p-4"
                    >
                      <p className="mb-2 text-xs font-semibold text-[#241d17]">
                        {spanish ? 'Selecciona una fecha del calendario:' : 'Select any date on the calendar:'}
                      </p>
                      <PortalDatePicker
                        theme="light"
                        value={targetDate}
                        onChange={handleDatePicked}
                        minDate={new Date().toISOString().slice(0, 10)}
                        availableDates={availableDates}
                        placeholder={spanish ? 'Elige una fecha' : 'Choose a date'}
                        className={publicDatePickerClass}
                      />
                      <span className="mt-2 block text-[11px] text-[#827567]">
                        {spanish
                          ? 'Los puntos verdes indican fechas con visitas disponibles.'
                          : 'Green dots show available visit dates.'}
                      </span>

                      {targetDate && selectedDateSlots.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-[#241d17]">
                            {spanish ? 'Horarios para esta fecha:' : 'Times for this date:'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedDateSlots.map((slot) => {
                              const isSelected = slotId === slot.id
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => handleSelectSlot(slot)}
                                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                                    isSelected
                                      ? 'border-[#b98a3d] bg-[#b98a3d] text-white shadow-sm ring-2 ring-[#b98a3d]/20'
                                      : 'border-[#d8c4a4] bg-white text-[#241d17] hover:border-[#b98a3d] hover:bg-[#faf6ef]'
                                  }`}
                                >
                                  {slot.time}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Time Zone Reassurance */}
              <div className="flex items-center gap-1.5 text-xs text-[#827567]">
                <Clock size={13} className="text-[#b98a3d]" />
                <span>{spanish ? 'Todos los horarios están en Tiempo del Centro (CT).' : 'All times are in Central Time (CT).'}</span>
              </div>
            </div>
          ) : (
            /* Custom Time Request Panel */
            <div className="mt-6 rounded-xl border border-[#b98a3d]/25 bg-[#faf6ef] p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[#241d17]">
                  {spanish ? 'Solicita un horario de visita personalizado' : 'Request a custom visit time'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCustomMode(false)
                    setCustomTourTime('')
                  }}
                  className="text-xs font-semibold text-[#8d672b] underline underline-offset-4"
                >
                  {spanish ? 'Volver a horarios estándar' : 'Back to standard slots'}
                </button>
              </div>
              <p className="mt-1 text-xs text-[#665a4e]">
                {spanish
                  ? 'El equipo de Luxor revisará tu solicitud y confirmará la disponibilidad contigo.'
                  : 'The Luxor team will review this request and confirm availability with you.'}
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label={spanish ? 'Fecha de visita preferida' : 'Preferred visit date'}>
                  <PortalDatePicker
                    theme="light"
                    value={targetDate}
                    onChange={(val) => setTargetDate(val)}
                    minDate={new Date().toISOString().slice(0, 10)}
                    placeholder={spanish ? 'Elige una fecha' : 'Choose a date'}
                    className={publicDatePickerClass}
                  />
                </Field>
                <Field label={spanish ? 'Hora preferida' : 'Preferred time'}>
                  <input
                    type="time"
                    value={customTourTime}
                    onChange={(e) => setCustomTourTime(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="mt-3">
                <Field label={spanish ? 'Fecha alternativa (opcional)' : 'Optional alternate date'}>
                  <PortalDatePicker
                    theme="light"
                    value={alternateDate}
                    onChange={setAlternateDate}
                    minDate={new Date().toISOString().slice(0, 10)}
                    placeholder={spanish ? 'Elige otra fecha' : 'Choose another date'}
                    className={publicDatePickerClass}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* Toggle Custom Request */}
          {!customMode && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setCustomMode(true)
                  setSlotId('')
                }}
                className="text-xs font-semibold text-[#8d672b] underline underline-offset-4 hover:text-[#6a4c1b]"
              >
                {spanish ? '¿No puedes en estos horarios? Solicita otra hora' : 'Can’t make these times? Request a different time'}
              </button>
            </div>
          )}

          {/* Tour Language preference toggle */}
          <div className="mt-5 border-t border-[#b98a3d]/20 pt-4">
            <label className="flex items-center gap-2 text-xs text-[#665a4e] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tourLanguage === 'es'}
                onChange={(e) => setTourLanguage(e.target.checked ? 'es' : 'en')}
                className="luxor-public-checkbox h-4 w-4 rounded border-2 border-[#b98a3d]"
              />
              <span>
                {spanish ? '¿Prefieres tu visita en español?' : 'Need a Spanish-speaking visit?'}
              </span>
            </label>
          </div>

          {/* Arianna Help Widget */}
          <div className="mt-6 flex items-center justify-between rounded-xl border border-[#d8c4a4]/40 bg-[#fdfbf7] p-3.5 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#caa24c]/50 shadow-sm">
                <Image
                  src="/images/arianna-patterson-headshot.png"
                  alt="Arianna Patterson, Venue Director"
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-[#241d17]">
                  {spanish ? '¿Preguntas? Con gusto te ayudo a encontrar el mejor horario.' : 'Questions? I’m happy to help you find the right time.'}
                </p>
                <p className="text-[11px] font-semibold text-[#8d672b]">
                  — Arianna, {spanish ? 'Directora del Lugar' : 'Venue Director'}
                </p>
              </div>
            </div>
            <PublicPhoneLink
              compact
              label={spanish ? 'Llamar' : 'Call'}
              className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#b98a3d]/40 bg-white px-3 text-xs font-bold text-[#8d672b] transition hover:border-[#b98a3d] hover:bg-[#faf6ef]"
            />
          </div>

          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-700/20 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

          {/* Action CTA */}
          <div className="mt-6">
            <button
              type="button"
              onClick={handleNextFromStep1}
              disabled={!customMode && !slotId}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#b98a3d] px-5 text-sm font-bold uppercase tracking-[0.12em] !text-white transition hover:bg-[#9d722e] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!customMode && !slotId ? (spanish ? 'Selecciona un horario' : 'Select a time') : (spanish ? 'Continuar →' : 'Continue →')}
            </button>
          </div>
        </motion.div>
      )}

      {/* STEP 2: YOUR INFORMATION */}
      {step === 2 && (
        <motion.div
          key="step-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          <div>
            <h2 className="font-serif text-3xl font-semibold text-[#241d17] sm:text-4xl">
              {spanish ? 'Cuéntanos sobre ti' : 'Tell us about you'}
            </h2>
            <p className="mt-1.5 text-sm text-[#665a4e] sm:text-base">
              {spanish
                ? 'Enviaremos tu confirmación y recordatorios de tu visita aquí.'
                : 'We’ll send your confirmation and visit reminders here.'}
            </p>

            {/* Selected appointment pill */}
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#b98a3d]/25 bg-[#faf6ef] px-3 py-1.5 text-xs text-[#8d672b]">
              <CalendarIcon size={13} />
              <span className="font-semibold">{formatTourSlotDate(chosenDate)}</span>
              <span>•</span>
              <Clock size={13} />
              <span className="font-semibold">{chosenTime}</span>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <Field label={spanish ? 'Nombre completo *' : 'Full Name *'}>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                placeholder={spanish ? 'Tu nombre y apellido' : 'First and last name'}
                className={inputClass}
                required
              />
            </Field>

            <Field label={spanish ? 'Correo electrónico *' : 'Email *'}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder={spanish ? 'tunombre@ejemplo.com' : 'you@example.com'}
                className={inputClass}
                required
              />
            </Field>

            <Field label={spanish ? 'Teléfono *' : 'Phone *'}>
              <input
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="(210) 555-5555"
                className={inputClass}
                required
              />
            </Field>
          </div>

          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-700/20 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep(1)
              }}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-[#d8c4a4] px-5 text-sm font-semibold text-[#8d672b] transition hover:bg-[#faf6ef]"
            >
              {spanish ? '← Volver' : '← Back'}
            </button>
            <button
              type="button"
              onClick={handleNextFromStep2}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#b98a3d] px-5 text-sm font-bold uppercase tracking-[0.12em] !text-white transition hover:bg-[#9d722e]"
            >
              {spanish ? 'Continuar →' : 'Continue →'}
            </button>
          </div>
        </motion.div>
      )}

      {/* STEP 3: EVENT DETAILS (OPTIONAL) */}
      {step === 3 && (
        <motion.div
          key="step-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          <div>
            <h2 className="font-serif text-3xl font-semibold text-[#241d17] sm:text-4xl">
              {spanish ? 'Algunos detalles sobre tu evento' : 'A few details about your event'}
            </h2>
            <p className="mt-1.5 text-sm text-[#665a4e] sm:text-base">
              {spanish
                ? 'Esto nos ayuda a prepararnos para tu visita y aprovechar al máximo tu tiempo.'
                : 'This helps us prepare for your visit and make the most of your time.'}
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label={spanish ? 'Tipo de evento' : 'Event Type'}>
              <PortalSelect
                theme="light"
                value={eventType}
                onChange={setEventType}
                options={LUXOR_EVENT_TYPES.map((type) => ({
                  value: type,
                  label: spanish ? eventTypeLabelsEs[type] : type,
                }))}
                placeholder={spanish ? 'Selecciona un tipo de evento' : 'Select an event type'}
                className="w-full"
                buttonClassName="min-h-12 rounded-xl bg-[#fffdfa] border-[#d8c4a4] px-3.5 text-sm normal-case tracking-normal hover:border-[#caa24c]"
              />
            </Field>

            <Field label={spanish ? 'Invitados esperados' : 'Estimated Guests'}>
              <input
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
                inputMode="numeric"
                placeholder={spanish ? 'Por ejemplo, 120' : 'For example, 120'}
                className={inputClass}
              />
              {isGuestCountOverCapacity(guestCount) && (
                <span role="alert" className="mt-2 block text-xs leading-5 text-rose-700">
                  {spanish ? LUXOR_GUEST_CAPACITY_MESSAGE_ES : LUXOR_GUEST_CAPACITY_MESSAGE}
                </span>
              )}
            </Field>

            <Field label={spanish ? 'Fecha del evento (si la conoces)' : 'Event Date (if known)'}>
              <PortalDatePicker
                theme="light"
                value={eventDate}
                onChange={setEventDate}
                placeholder={spanish ? 'Selecciona una fecha' : 'Select a date'}
                className={publicDatePickerClass}
              />
            </Field>

            <Field label={spanish ? 'Presupuesto estimado (opcional)' : 'Planning Budget (optional)'}>
              <PortalSelect
                theme="light"
                value={budget}
                onChange={setBudget}
                options={budgetOptions.map((opt) => ({
                  value: opt.value,
                  label: spanish ? opt.labelEs : opt.labelEn,
                }))}
                placeholder={spanish ? 'Selecciona un rango' : 'Select a budget range'}
                className="w-full"
                buttonClassName="min-h-12 rounded-xl bg-[#fffdfa] border-[#d8c4a4] px-3.5 text-sm normal-case tracking-normal hover:border-[#caa24c]"
              />
            </Field>
          </div>

          <div className="mt-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                {spanish ? '¿Algo más que debamos saber? (opcional)' : 'Anything else we should know? (optional)'}
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={3000}
                rows={3}
                placeholder={spanish ? 'Cuéntanos qué estás planeando...' : 'Tell us what you’re planning...'}
                className={`${inputClass} h-auto resize-none py-3`}
              />
            </label>
          </div>

          <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-[#665a4e] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="luxor-public-checkbox mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-[#b98a3d]"
            />
            <span>
              {spanish
                ? 'Envíame ocasionalmente noticias y consejos de planificación de Luxor.'
                : 'Email me occasional Luxor news and planning ideas.'}
            </span>
          </label>

          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-700/20 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep(2)
              }}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-[#d8c4a4] px-5 text-sm font-semibold text-[#8d672b] transition hover:bg-[#faf6ef]"
            >
              {spanish ? '← Volver' : '← Back'}
            </button>
            <button
              type="button"
              onClick={() => handleFinalSubmit()}
              disabled={submitting}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#b98a3d] px-5 text-sm font-bold uppercase tracking-[0.12em] !text-white transition hover:bg-[#9d722e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {submitting
                ? spanish
                  ? 'Reservando...'
                  : 'Booking...'
                : customMode
                  ? spanish
                    ? 'Solicitar visita'
                    : 'Request Visit'
                  : spanish
                    ? 'Agendar mi visita'
                    : 'Schedule My Visit'}
            </button>
          </div>
        </motion.div>
      )}

      {/* STEP 4: CONFIRMATION */}
      {step === 4 && (
        <motion.div
          key="step-4"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          {/* Gold Luxor sunburst icon badge */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#fbf7ef] border-2 border-[#caa24c] text-[#caa24c] shadow-sm">
            <Check size={26} strokeWidth={3} />
          </div>

          <h2 className="mt-4 font-serif text-4xl font-semibold text-[#241d17]">
            {spanish ? '¡Todo listo!' : 'You’re All Set!'}
          </h2>
          <p className="mt-2 text-sm text-[#665a4e]">
            {customMode
              ? spanish
                ? 'Recibimos tu solicitud de visita. Nuestro equipo revisará el horario y se comunicará contigo de inmediato.'
                : 'We received your visit request. Our team will review the time and follow up with you promptly.'
              : spanish
                ? 'Esperamos mostrarte Luxor at Las Palmas en persona.'
                : 'We look forward to showing you Luxor at Las Palmas.'}
          </p>

          {/* Appointment Details Box */}
          <div className="mt-6 rounded-2xl border border-[#b98a3d]/25 bg-[#faf6ef] p-5 text-left text-sm text-[#241d17] shadow-sm sm:p-6">
            <div className="space-y-3.5">
              <div className="flex items-start gap-3">
                <CalendarIcon size={18} className="mt-0.5 shrink-0 text-[#b98a3d]" />
                <div>
                  <p className="font-semibold">{formatFullDateDisplay(chosenDate, locale)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock size={18} className="mt-0.5 shrink-0 text-[#b98a3d]" />
                <div>
                  <p className="font-semibold">{chosenTime}</p>
                  <p className="text-xs text-[#827567]">
                    {spanish ? '(Visita de 30 a 45 minutos)' : '(30–45 minute visit)'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 border-t border-[#b98a3d]/15 pt-3">
                <MapPin size={18} className="mt-0.5 shrink-0 text-[#b98a3d]" />
                <div>
                  <p className="font-bold">Luxor at Las Palmas</p>
                  <p className="text-xs text-[#665a4e]">
                    803 Castroville Rd #402, San Antonio, TX 78237
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-5 text-xs text-[#665a4e]">
            {spanish ? 'Se ha enviado una confirmación a ' : 'A confirmation has been sent to '}
            <strong className="text-[#241d17]">{email}</strong>
            {phone ? <span> {spanish ? 'y por mensaje a ' : 'and via text to '}<strong className="text-[#241d17]">{phone}</strong></span> : null}.
          </p>

          {/* Calendar Add Buttons */}
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <a
              href={calendarLinks.googleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d8c4a4] bg-white px-4 text-xs font-bold text-[#241d17] shadow-sm transition hover:border-[#b98a3d] hover:bg-[#faf6ef]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{spanish ? 'Agregar a Google Calendar' : 'Add to Google Calendar'}</span>
            </a>

            <a
              href={calendarLinks.icsDataUri}
              download="luxor-visit.ics"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d8c4a4] bg-white px-4 text-xs font-bold text-[#241d17] shadow-sm transition hover:border-[#b98a3d] hover:bg-[#faf6ef]"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.93-2.85-.9.04-1.98.6-2.62 1.35-.57.65-1.06 1.71-.93 2.73 1.01.08 2.01-.48 2.62-1.23z" />
              </svg>
              <span>{spanish ? 'Agregar a Apple Calendar' : 'Add to Apple Calendar'}</span>
            </a>
          </div>

          <div className="mt-6">
            <Link
              href={spanish ? '/es' : '/'}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#b98a3d] px-5 text-sm font-bold uppercase tracking-[0.12em] !text-white transition hover:bg-[#9d722e]"
            >
              {spanish ? 'Volver al Inicio' : 'Back to Home'}
            </Link>
          </div>

          <div className="mt-5 text-xs text-[#827567]">
            <p>{spanish ? '¿Necesitas cambiar tu horario?' : 'Need to change your time?'}</p>
            <p className="mt-1">
              <Link href={spanish ? '/es/visit' : '/visit'} className="font-semibold text-[#8d672b] underline underline-offset-4">
                {spanish ? 'Reprogramar o contáctanos' : 'Reschedule or contact us'}
              </Link>
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'min-h-12 w-full rounded-xl border border-[#d8c4a4] bg-[#fffdfa] px-3.5 text-sm text-[#241d17] outline-none transition placeholder:text-[#8b7b6b] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#b98a3d]/15'
