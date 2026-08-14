'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import type { PublicLuxorTourSlot } from '@/lib/luxorTourSlots'
import { useLuxorTourSlots } from '@/hooks/useLuxorTourSlots'
import { formatStandardPhoneInput } from '@/lib/luxorPhoneClient'
import { getLuxorPublicAttribution, getLuxorPublicSessionId, trackLuxorPublicEvent } from '@/lib/luxorPublicAttribution'
import { PortalSelect } from '@/components/portal/PortalUI'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  Send,
  BrainCircuit,
  User,
  X,
} from 'lucide-react'

type Message = {
  id: string
  role: 'assistant' | 'user'
  content: string
  ui?: 'booking'
}

type TourSelection = PublicLuxorTourSlot

type ContactDetails = {
  name: string
  email: string
  phone: string
  notes: string
}

const eventCards = [
  {
    label: 'Wedding',
    image: '/images/dining-hall/main-hall-wedding-dance-candid.png',
    copy: 'Ceremony flow, dinner, portraits, and dancing.',
  },
  {
    label: 'Quinceañera',
    image: '/images/dining-hall/main-hall-quinceanera-angle.png',
    copy: 'Grand entrance, court seating, cake, and family photos.',
  },
  {
    label: 'Baby shower',
    image: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
    copy: 'A softer setup for family, gifts, photos, and brunch.',
  },
  {
    label: 'Corporate',
    image: '/images/luxor-lounge/luxor-lounge-corporate.png',
    copy: 'Awards, networking, presentations, and dinner service.',
  },
]

const quickStarts = ['Wedding', 'Quinceañera', 'Baby shower', 'Corporate', 'Other']

const venueSettingQuestionPattern = /\b(indoor|indoors|outdoor|outdoors|outside|open[-\s]?air|interior|exterior|patio|courtyard|garden|terrace|yard|backyard|porch|deck|rooftop|balcony)\b/i
const indoorOnlyReply =
  'Luxor is fully indoors—our main hall and Luxor Lounge are never weather-dependent. We don’t have an outdoor space, patio, courtyard, garden, or terrace. If the indoor layout could work for you, I can help you reserve a private tour.'

function createId() {
  return Math.random().toString(36).slice(2)
}

function fallbackResponse(input: string) {
  const text = input.toLowerCase()

  if (venueSettingQuestionPattern.test(text)) {
    return indoorOnlyReply
  }

  if (text.includes('price') || text.includes('cost') || text.includes('package')) {
    return 'Packages depend on your date, guest count, and event type. You can compare the current package options on the pricing page, or I can help you request a private tour so the team can talk through the best fit.'
  }

  if (text.includes('wedding')) {
    return 'For a wedding, I would focus the tour on ceremony placement, dinner layout, photo spots, and the dance floor. Do you already have a month or guest count in mind?'
  }

  if (text.includes('quince')) {
    return 'For a quinceañera, we should look at the entrance, court seating, family photo areas, cake moment, and dance floor. I can help you pick a tour time.'
  }

  return 'That sounds like a great fit. What are you celebrating? When you are ready, I can help you reserve a private tour.'
}

function shouldShowBookingCard(input: string) {
  const text = input.toLowerCase()

  return [
    'book',
    'schedule',
    'tour',
    'appointment',
    'visit',
    'availability',
    'available',
    'date',
    'time',
    'call me',
    'contact',
  ].some((term) => text.includes(term))
}

function inferEventType(messages: Message[], notes: string) {
  const text = `${notes} ${messages.map((message) => message.content).join(' ')}`.toLowerCase()

  if (text.includes('quince')) return 'Quinceañera'
  if (text.includes('baby shower')) return 'Baby shower'
  if (text.includes('corporate') || text.includes('company')) return 'Corporate'
  if (text.includes('wedding')) return 'Wedding'
  if (text.includes('birthday')) return 'Birthday'

  return ''
}

function inferGuestCount(messages: Message[], notes: string) {
  const text = `${notes} ${messages.map((message) => message.content).join(' ')}`
  const guestMatch = text.match(/(\d{2,4})\s*(guests?|people|attendees)/i)

  return guestMatch?.[1] ?? ''
}

function toCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function toIsoDate(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
}

function getCalendarDays(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number)
  const firstDay = new Date(year, (month || 1) - 1, 1)
  const start = new Date(year, firstDay.getMonth(), 1 - firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

function shiftCalendarMonth(monthValue: string, amount: number) {
  const [year, month] = monthValue.split('-').map(Number)
  const shifted = new Date(year, (month || 1) - 1 + amount, 1)
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`
}

function getVisitorGreeting() {
  const attribution = getLuxorPublicAttribution()
  const source = `${attribution.utmSource ?? ''} ${attribution.initialReferrer ?? ''}`.toLowerCase()
  const medium = attribution.utmMedium?.toLowerCase() ?? ''

  if (source.includes('instagram')) {
    return 'Hi, I’m Elena. Luxor is a fully indoor venue, so your event is never weather-dependent. Check tour times or tell me what you’re planning.'
  }

  if (attribution.gclid || attribution.fbclid || /paid|cpc|ppc|display|social/.test(medium)) {
    return 'Hi, I’m Elena. Luxor is a fully indoor venue, so your event is never weather-dependent. Check tour times or tell me what you’re planning.'
  }

  return 'Hi, I’m Elena. Luxor is a fully indoor venue, so your event is never weather-dependent. Check tour times or tell me what you’re planning.'
}

export function LuxorConciergeChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<(typeof eventCards)[number] | null>(null)
  const [tourSelection, setTourSelection] = useState<TourSelection | null>(null)
  const { slots: tourSlots, loading: tourSlotsLoading, error: tourSlotsError } = useLuxorTourSlots({ enabled: open })
  const [bookingStep, setBookingStep] = useState<1 | 2>(1)
  const [selectedTourDate, setSelectedTourDate] = useState('')
  const [calendarMonth, setCalendarMonth] = useState('')
  const [preferredTourWindow, setPreferredTourWindow] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [showOptionalContactDetails, setShowOptionalContactDetails] = useState(false)
  const [startChoicesVisible, setStartChoicesVisible] = useState(true)
  const [eventPickerOpen, setEventPickerOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittingInquiry, setSubmittingInquiry] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [contactDetails, setContactDetails] = useState<ContactDetails>({
    name: '',
    email: '',
    phone: '',
    notes: '',
  })
  const messageEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const formStartedAt = useRef(Date.now())

  const [messages, setMessages] = useState<Message[]>([
    {
      id: createId(),
      role: 'assistant',
      content:
        'Hi, I’m Elena. Luxor is a fully indoor venue, so your event is never weather-dependent. Check tour times or tell me what you’re planning.',
    },
  ])

  const apiMessages = useMemo(
    () => messages.filter((message) => message.content.trim()).map(({ role, content }) => ({ role, content })),
    [messages],
  )

  const hasBookingCard = messages.some((message) => message.ui === 'booking')
  const contactComplete =
    contactDetails.name.trim().length > 1 &&
    contactDetails.phone.replace(/\D/g, '').length >= 10
  const hasTourTime = Boolean(tourSelection || preferredTourWindow)
  const bookingReady = contactComplete && hasTourTime
  const availableTourDates = useMemo(() => new Set(tourSlots.map((slot) => slot.date)), [tourSlots])
  const selectedDateSlots = useMemo(
    () => tourSlots.filter((slot) => slot.date === selectedTourDate),
    [selectedTourDate, tourSlots],
  )
  const calendarDays = useMemo(() => (calendarMonth ? getCalendarDays(calendarMonth) : []), [calendarMonth])

  useEffect(() => {
    if (tourSlots.length && !calendarMonth) {
      setCalendarMonth(tourSlots[0].date.slice(0, 7))
    }
  }, [calendarMonth, tourSlots])

  useEffect(() => {
    if (!open) return
    trackLuxorPublicEvent('concierge_opened')
    setMessages((current) => {
      if (current.length !== 1 || current[0]?.role !== 'assistant') return current
      return [{ ...current[0], content: getVisitorGreeting() }]
    })
    window.requestAnimationFrame(() => inputRef.current?.focus())

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  function updateContactDetail(field: keyof ContactDetails, value: string) {
    setContactDetails((current) => ({ ...current, [field]: value }))
  }

  function showBookingCard() {
    if (hasBookingCard) {
      window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      return
    }

    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: 'assistant',
        content: '',
        ui: 'booking',
      },
    ])
    window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  function returnToChat() {
    setMessages((current) => current.filter((message) => message.ui !== 'booking'))
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function sendMessage(messageText: string) {
    const trimmed = messageText.trim()
    if (!trimmed || pending) return

    const shouldOfferBooking = shouldShowBookingCard(trimmed)
    const userMessage: Message = { id: createId(), role: 'user', content: trimmed }
    setStartChoicesVisible(false)
    setMessages((current) => [...current, userMessage])
    setInput('')
    setPending(true)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12_000)

    try {
      const response = await fetch('/api/luxor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ messages: [...apiMessages, userMessage] }),
      })
      const data = (await response.json()) as { reply?: string }

      setMessages((current) => {
        const next: Message[] = [
          ...current,
          {
            id: createId(),
            role: 'assistant',
            content: data.reply || fallbackResponse(trimmed),
          },
        ]

        if (shouldOfferBooking && !current.some((message) => message.ui === 'booking')) {
          next.push({
            id: createId(),
            role: 'assistant',
            content: '',
            ui: 'booking',
          })
        }

        return next
      })
    } catch {
      setMessages((current) => {
        const next: Message[] = [
          ...current,
          { id: createId(), role: 'assistant', content: fallbackResponse(trimmed) },
        ]

        if (shouldOfferBooking && !current.some((message) => message.ui === 'booking')) {
          next.push({
            id: createId(),
            role: 'assistant',
            content: '',
            ui: 'booking',
          })
        }

        return next
      })
    } finally {
      window.clearTimeout(timeout)
      setPending(false)
      window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }

  function selectEvent(label: string) {
    const event = eventCards.find((card) => card.label === label) ?? null
    setSelectedEvent(event)
    setStartChoicesVisible(false)
    setEventPickerOpen(false)
    void sendMessage(label === 'Other' ? 'I am planning another type of event.' : `I am planning a ${label}.`)
  }

  async function submitTourRequest() {
    if (!bookingReady || submittingInquiry) {
      showBookingCard()
      return
    }

    setSubmittingInquiry(true)
    setSubmissionError(null)

    const payload: LuxorInquiryInput = {
      fullName: contactDetails.name,
      email: contactDetails.email,
      phone: contactDetails.phone,
      eventType: selectedEvent?.label ?? inferEventType(messages, contactDetails.notes),
      guestCount: inferGuestCount(messages, contactDetails.notes),
      preferredTourDate: tourSelection?.date ?? '',
      preferredTourTime: tourSelection?.time ?? preferredTourWindow,
      message: contactDetails.notes,
      source: 'chat_widget',
      flow: 'concierge_chat',
      pagePath: window.location.pathname,
      referrer: document.referrer,
      marketingOptIn,
      formStartedAt: formStartedAt.current,
      sessionId: getLuxorPublicSessionId(),
      attribution: getLuxorPublicAttribution(),
      metadata: {
        selectedEvent: selectedEvent?.label ?? null,
        selectedTourSlotId: tourSelection?.id ?? null,
        selectedTourLabel: tourSelection?.label ?? null,
        chatMessages: messages.map(({ role, content }) => ({ role, content })),
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
        throw new Error(result.error ?? 'The request could not be submitted.')
      }

      setSubmitted(true)
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content:
            tourSelection
              ? `Perfect, ${contactDetails.name.trim()}. Your appointment for ${tourSelection.label} is reserved. A Luxor coordinator will follow up within one business day.`
              : `Thank you, ${contactDetails.name.trim()}. Your ${preferredTourWindow.toLowerCase()} tour request is with the Luxor team. A coordinator will follow up within one business day.`,
        },
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request could not be submitted.'
      setSubmissionError(message)
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content:
            'I could not submit that tour request yet. Please check the contact details, or use the full form while we fix the connection.',
        },
      ])
    } finally {
      setSubmittingInquiry(false)
    }
  }

  function renderTourPicker() {
    if (tourSlotsLoading) {
      return <p className="rounded-md border border-[#caa24c]/18 bg-black/25 px-3 py-3 text-xs leading-5 text-[#d7c29a]/70">Loading current tour openings...</p>
    }

    if (tourSlotsError) {
      return <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-3 text-xs leading-5 text-red-200">{tourSlotsError}</p>
    }

    if (!tourSlots.length) {
      return (
        <div className="rounded-md border border-[#caa24c]/18 bg-black/25 p-3">
          <p className="text-xs leading-5 text-[#d7c29a]/70">No exact times are published right now. Pick a preferred window and the team will offer options.</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {['Morning', 'Afternoon', 'Evening'].map((window) => (
              <button key={window} type="button" onClick={() => setPreferredTourWindow(window)} className={`rounded-md border px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${preferredTourWindow === window ? 'border-[#f1d27a] bg-[#caa24c] text-black' : 'border-[#caa24c]/22 text-[#eadcc8]'}`}>
                {window}
              </button>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="rounded-md border border-[#caa24c]/18 bg-black/25 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#caa24c]">Step {bookingStep} of 3</p>
            <p className="mt-1 text-xs text-[#d7c29a]/70">{bookingStep === 1 ? 'Choose a tour day' : 'Choose an available time'}</p>
          </div>
          {bookingStep === 2 ? (
            <button type="button" onClick={() => setBookingStep(1)} className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#d7c29a]/70 transition hover:text-[#f1d27a]">
              Change day
            </button>
          ) : null}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {bookingStep === 1 ? (
            <motion.div key="tour-day" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.22 }}>
              <div className="mb-2 flex items-center justify-between">
                <button type="button" onClick={() => setCalendarMonth((current) => shiftCalendarMonth(current, -1))} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#caa24c]/18 text-[#d7c29a]/70 transition hover:border-[#f1d27a]/45 hover:text-[#f1d27a]" aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="font-serif text-lg text-[#f7efe3]">{calendarMonth ? toCalendarDate(`${calendarMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Available dates'}</p>
                <button type="button" onClick={() => setCalendarMonth((current) => shiftCalendarMonth(current, 1))} className="flex h-8 w-8 items-center justify-center rounded-md border border-[#caa24c]/18 text-[#d7c29a]/70 transition hover:border-[#f1d27a]/45 hover:text-[#f1d27a]" aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center font-mono text-[9px] uppercase tracking-wider text-[#d7c29a]/45">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}
                {calendarDays.map((day) => {
                  const isoDate = toIsoDate(day)
                  const available = availableTourDates.has(isoDate)
                  const inMonth = day.getMonth() === toCalendarDate(`${calendarMonth}-01`).getMonth()
                  const active = selectedTourDate === isoDate

                  return (
                    <button key={isoDate} type="button" disabled={!available} onClick={() => { setSelectedTourDate(isoDate); setTourSelection(null); setBookingStep(2) }} className={`rounded-md py-2 text-xs transition ${active ? 'bg-[#caa24c] font-bold text-[#050505]' : available ? 'border border-[#caa24c]/25 text-[#eadcc8] hover:border-[#f1d27a]/60 hover:text-[#f1d27a]' : `text-[#d7c29a]/20 ${inMonth ? '' : 'opacity-40'}`}`} aria-label={available ? `Choose ${day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : undefined}>
                      {day.getDate()}
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-[#d7c29a]/55">Available days are highlighted. Tours are 30 minutes.</p>
            </motion.div>
          ) : (
            <motion.div key="tour-time" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.22 }}>
              <p className="mb-2 font-serif text-lg text-[#f7efe3]">{toCalendarDate(selectedTourDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              <PortalSelect
                value={tourSelection?.id ?? ''}
                onChange={(value) => setTourSelection(selectedDateSlots.find((slot) => slot.id === value) ?? null)}
                className="w-full"
                buttonClassName="!h-12 !rounded-md !border-[#caa24c]/25 !bg-[#080706] !px-3 !py-0 !text-left !text-sm !text-[#eadcc8]"
                placeholder="Choose a time"
                options={selectedDateSlots.map((slot) => ({ value: slot.id, label: slot.time }))}
              />
              {tourSelection ? <p className="mt-2 text-[10px] text-[#d7c29a]/60">Selected: {tourSelection.label}</p> : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  function renderBookingCard(messageId: string) {
    return (
      <motion.div
        key={`${messageId}-booking`}
        layout
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3 w-full rounded-md border border-[#caa24c]/24 bg-[#0d0908] p-3 shadow-[0_18px_50px_-34px_rgba(0,0,0,1)]"
        data-booking-card
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#caa24c]">Tour request</p>
            <h3 className="mt-1 font-serif text-2xl leading-none text-[#f7efe3]">Reserve a private tour</h3>
            <p className="mt-2 text-xs leading-5 text-[#d7c29a]/70">
              {hasTourTime ? 'Almost there — add your name and phone to reserve your time.' : 'Choose a time first. You only need your name and phone to reserve it.'}
            </p>
          </div>
          {submitted ? (
            <span className="rounded-md border border-[#caa24c]/25 bg-[#caa24c] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#050505]">
              Started
            </span>
          ) : null}
        </div>

        <div className="mt-3">{renderTourPicker()}</div>

        {hasTourTime ? (
          <div className="mt-3 grid gap-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#caa24c]">Step 3 of 3 · Reserve your time</p>
            <label className="relative block">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/70" />
              <input
                value={contactDetails.name}
                onChange={(event) => updateContactDetail('name', event.target.value)}
                placeholder="Full name"
                aria-required="true"
                className="w-full rounded-md border border-[#caa24c]/18 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
              />
            </label>
            <label className="relative block">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/70" />
              <input
                value={contactDetails.phone}
                onChange={(event) => updateContactDetail('phone', formatStandardPhoneInput(event.target.value))}
                placeholder="Phone"
                type="tel"
                required
                aria-required="true"
                className="w-full rounded-md border border-[#caa24c]/18 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-[#f7efe3] font-mono outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
              />
            </label>

            {showOptionalContactDetails ? (
              <>
                <label className="relative block">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/70" />
                  <input
                    value={contactDetails.email}
                    onChange={(event) => updateContactDetail('email', event.target.value)}
                    placeholder="Email (optional)"
                    type="email"
                    className="w-full rounded-md border border-[#caa24c]/18 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
                  />
                </label>
                <textarea
                  value={contactDetails.notes}
                  onChange={(event) => updateContactDetail('notes', event.target.value)}
                  placeholder="Event notes, guest count, target month..."
                  className="min-h-20 resize-none rounded-md border border-[#caa24c]/18 bg-black/30 px-3 py-2.5 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
                />
                {contactDetails.email ? <label className="flex items-start gap-2 rounded-md border border-[#caa24c]/16 bg-black/20 p-2.5 text-[11px] leading-4 text-[#d7c29a]/70"><input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} className="mt-0.5 accent-[#caa24c]" /><span>Email me occasional Luxor event ideas and offers. Optional.</span></label> : null}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowOptionalContactDetails(true)}
                className="justify-self-start text-[10px] font-bold uppercase tracking-[0.12em] text-[#d7c29a]/65 transition hover:text-[#f1d27a]"
              >
                Add email or event details (optional)
              </button>
            )}
          </div>
        ) : null}

        {submissionError ? (
          <p className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
            {submissionError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={submitTourRequest}
          disabled={!bookingReady || submitted || submittingInquiry}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[#050505] transition hover:bg-[#f1d27a] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitted ? 'Tour requested' : submittingInquiry ? 'Sending request' : bookingReady ? (tourSelection ? 'Reserve tour' : 'Send tour request') : hasTourTime ? 'Add name + phone' : 'Pick a time'}
          <Check className="h-4 w-4" />
        </button>
      </motion.div>
    )
  }

  return (
    <div className="site-floating-action fixed bottom-20 right-4 z-[130] sm:bottom-6 sm:right-6">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.section
            key="chat-window"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="absolute bottom-0 right-0 flex h-[min(560px,calc(100svh-6rem))] w-[calc(100vw-2rem)] max-w-[430px] flex-col overflow-hidden rounded-md border border-[#caa24c]/28 bg-[#080706] text-[#f7efe3] shadow-[0_30px_90px_-36px_rgba(0,0,0,1)] sm:h-[min(560px,calc(100svh-3rem))]"
            role="dialog"
            aria-modal="true"
            aria-label="Luxor concierge chat"
          >
            <header className="border-b border-[#caa24c]/18 bg-[#0d0908] p-4">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#f1d27a]/45 bg-[#120d0c]">
                  <Image src="/luxor-concierge.png" alt="Luxor concierge Elena" fill sizes="48px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-xl leading-none text-[#f7efe3]">Elena</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-[#caa24c]">
                    Luxor concierge
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#caa24c]/20 text-[#d7c29a]/78 transition hover:border-[#f1d27a]/45 hover:text-[#f1d27a]"
                  aria-label="Close concierge chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="luxor-scrollbar flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      layout
                      key={message.id}
                      className={`flex flex-col ${message.ui === 'booking' ? 'w-full items-stretch' : message.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      {message.content ? (
                        <motion.div
                          initial={{ opacity: 0, y: 50, scale: 0.85, originX: message.role === 'user' ? 1 : 0, originY: 1 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                          className={`max-w-[86%] rounded-md px-4 py-3 text-sm leading-6 shadow-md shadow-black/5 ${
                            message.role === 'user'
                              ? 'bg-[#caa24c] text-[#050505]'
                              : 'border border-[#caa24c]/18 bg-white/[0.035] text-[#eadcc8]'
                          }`}
                        >
                          {message.content}
                        </motion.div>
                      ) : null}
                      {message.ui === 'booking' ? renderBookingCard(message.id) : null}
                    </motion.div>
                  ))}
                  {pending ? (
                    <motion.div
                      layout
                      key="thinking-indicator"
                      className="flex justify-start"
                    >
                      <motion.div
                        initial={{ opacity: 0, y: 30, scale: 0.85, originX: 0, originY: 1 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8, y: 15 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="inline-flex items-center gap-2 rounded-md border border-[#caa24c]/18 bg-white/[0.035] px-4 py-3 text-xs text-[#d7c29a]/70"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                          className="shrink-0"
                        >
                          <BrainCircuit className="h-3.5 w-3.5 text-[#caa24c]" />
                        </motion.div>
                        <span className="font-serif">Elena is typing</span>
                        <div className="flex gap-1 items-center ml-1">
                          <motion.span 
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
                            className="h-1.5 w-1.5 rounded-full bg-[#caa24c]"
                          />
                          <motion.span 
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
                            className="h-1.5 w-1.5 rounded-full bg-[#caa24c]"
                          />
                          <motion.span 
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
                            className="h-1.5 w-1.5 rounded-full bg-[#caa24c]"
                          />
                        </div>
                      </motion.div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <div ref={messageEndRef} />
              </div>

              {startChoicesVisible && !eventPickerOpen && !hasBookingCard ? (
                <div className="mt-4 rounded-md border border-[#caa24c]/18 bg-black/20 p-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#caa24c]">Start here</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStartChoicesVisible(false)
                      showBookingCard()
                    }}
                    className="mt-2 w-full rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[#050505] transition hover:bg-[#f1d27a]"
                  >
                    Check tour times
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartChoicesVisible(false)
                      setEventPickerOpen(true)
                    }}
                    className="mt-2 w-full rounded-md border border-[#caa24c]/22 bg-black/24 px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[#d7c29a]/82 transition hover:border-[#f1d27a]/50 hover:text-[#f1d27a]"
                  >
                    Tell Elena what you’re planning
                  </button>
                  <Link
                    href="/pricing"
                    className="mt-2 block text-center text-[10px] font-bold uppercase tracking-[0.1em] text-[#d7c29a]/65 transition hover:text-[#f1d27a]"
                  >
                    View packages
                  </Link>
                </div>
              ) : null}

              {eventPickerOpen ? (
                <div className="mt-4">
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#caa24c]">
                    What are you planning?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {quickStarts.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => selectEvent(label)}
                        className={`${label === 'Other' ? 'col-span-2' : ''} rounded-md border border-[#caa24c]/22 bg-black/24 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[#d7c29a]/82 transition hover:border-[#f1d27a]/50 hover:text-[#f1d27a]`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedEvent ? (
                <div className="mt-4 flex items-center gap-3 rounded-md border border-[#caa24c]/18 bg-black/24 p-2.5">
                  <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-md border border-[#caa24c]/20">
                    <Image src={selectedEvent.image} alt={`${selectedEvent.label} event inspiration`} fill sizes="64px" className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#caa24c]">
                      Event focus
                    </p>
                    <p className="truncate font-serif text-lg leading-none text-[#f7efe3]">{selectedEvent.label}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-[#d7c29a]/62">{selectedEvent.copy}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEventPickerOpen(true)}
                    className="rounded-md border border-[#caa24c]/18 px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#d7c29a]/70 transition hover:border-[#f1d27a]/45 hover:text-[#f1d27a]"
                  >
                    Change
                  </button>
                </div>
              ) : null}
            </div>

            {hasBookingCard ? (
              <div className="border-t border-[#caa24c]/18 bg-[#0d0908] p-3">
                <button
                  type="button"
                  onClick={returnToChat}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-[#caa24c]/20 bg-black/20 px-3 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#d7c29a]/75 transition hover:border-[#f1d27a]/45 hover:text-[#f1d27a]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back to chat
                </button>
              </div>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void sendMessage(input)
                }}
                className="border-t border-[#caa24c]/18 bg-[#0d0908] p-3"
              >
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void sendMessage(input)
                      }
                    }}
                    rows={1}
                    placeholder="Tell Elena what you are planning..."
                    className="max-h-24 min-h-11 flex-1 resize-none rounded-md border border-[#caa24c]/22 bg-black/35 px-3 py-3 text-sm leading-5 text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/65"
                  />
                  <button
                    type="submit"
                    disabled={pending || !input.trim()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#f1d27a]/45 bg-[#caa24c] text-[#050505] transition hover:bg-[#f1d27a] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            )}
          </motion.section>
        ) : (
          <motion.button
            ref={triggerRef}
            key="chat-trigger"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            type="button"
            onClick={() => setOpen(true)}
            className="absolute bottom-0 right-0 group flex h-16 w-16 items-center justify-center rounded-full border border-[#f1d27a]/45 bg-[#0d0908] p-1 text-left shadow-[0_20px_70px_-30px_rgba(0,0,0,1)] transition hover:border-[#f1d27a]/70 hover:bg-[#120d0c] sm:h-auto sm:w-auto sm:justify-start sm:gap-3 sm:py-2 sm:pl-2 sm:pr-4 sm:whitespace-nowrap"
            aria-label="Open Luxor concierge chat"
          >
            <span className="relative flex h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[#caa24c]/55 bg-[#120d0c]">
              <Image src="/luxor-concierge.png" alt="" fill sizes="56px" className="object-cover" />
            </span>
            <span className="hidden sm:block">
              <span className="block font-serif text-lg leading-none text-[#f7efe3]">Ask Elena</span>
              <span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#caa24c]">
                <MessageCircle className="h-3 w-3" />
                Book a tour
              </span>
            </span>
            <ChevronLeft className="hidden h-4 w-4 text-[#caa24c] transition sm:block" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
