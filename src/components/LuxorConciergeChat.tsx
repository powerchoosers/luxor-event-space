'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import type { PublicLuxorTourSlot } from '@/lib/luxorTourSlots'
import { useLuxorTourSlots } from '@/hooks/useLuxorTourSlots'
import { submitLuxorIdempotentForm } from '@/lib/luxorSubmissionIdempotency'
import { formatStandardPhoneInput } from '@/lib/luxorPhoneClient'
import { getLuxorPublicAttribution, getLuxorPublicSessionId, trackLuxorPublicEvent } from '@/lib/luxorPublicAttribution'
import { publicSiteEventsActive } from '@/lib/publicSitePaths'
import { PortalSelect } from '@/components/portal/PortalUI'
import { PublicEventDatePicker } from '@/components/PublicEventDatePicker'
import {
  Check,
  ChevronLeft,
  Mail,
  MessageCircle,
  Phone,
  ArrowUp,
  User,
  X,
} from '@/lib/icons/phosphor-compat'

type Message = {
  id: string
  role: 'assistant' | 'user'
  content: string
  ui?: 'booking'
}

function toCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
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
  'Luxor is fully indoors—our main hall and Luxor Lounge are never weather-dependent. We don’t have an outdoor space, patio, courtyard, garden, or terrace. If the indoor layout could work for you, I can help you schedule a visit.'
const capacityReply =
  'Luxor can accommodate up to 180 people. If you are planning for 180 or fewer, I can help you think through the layout and next step.'
const overCapacityPattern = /\b(\d[\d,]*)\s*(?:guests?|people|attendees?|attendance)\b/i

function createId() {
  return Math.random().toString(36).slice(2)
}

function fallbackResponse(input: string) {
  const text = input.toLowerCase()

  if (venueSettingQuestionPattern.test(text)) {
    return indoorOnlyReply
  }

  const capacityMatch = text.match(overCapacityPattern)
  if (capacityMatch && Number(capacityMatch[1].replace(/,/g, '')) > 200) {
    return capacityReply
  }

  if (text.includes('price') || text.includes('cost') || text.includes('package')) {
    return 'Packages depend on your date, guest count, and event type. The venue brochure is a helpful place to start, and I can help you schedule a visit when you are ready to talk through the best fit.'
  }

  if (text.includes('wedding')) {
    return 'For a wedding, I would focus the visit on ceremony placement, dinner layout, photo spots, and the dance floor. Do you already have a month or guest count in mind?'
  }

  if (text.includes('quince')) {
    return 'For a quinceañera, we should look at the entrance, court seating, family photo areas, cake moment, and dance floor. I can help you choose a visit time.'
  }

  return 'That sounds like a great fit. What are you celebrating? When you are ready, I can help you schedule a visit.'
}

function shouldShowBookingCard(input: string) {
  const text = input.toLowerCase()

  return /\b(?:book|booking|schedule|scheduled|tour|appointment|visit|availability|available|date|time|contact)\b|\bcall me\b/i.test(text)
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

function getVisitorGreeting() {
  const attribution = getLuxorPublicAttribution()
  const source = `${attribution.utmSource ?? ''} ${attribution.initialReferrer ?? ''}`.toLowerCase()
  const medium = attribution.utmMedium?.toLowerCase() ?? ''

  if (source.includes('instagram')) {
    return 'Hi, I’m Elena. Luxor is a fully indoor venue, so your event is never weather-dependent. Schedule a visit or tell me what you’re planning.'
  }

  if (attribution.gclid || attribution.fbclid || /paid|cpc|ppc|display|social/.test(medium)) {
    return 'Hi, I’m Elena. Luxor is a fully indoor venue, so your event is never weather-dependent. Schedule a visit or tell me what you’re planning.'
  }

  return 'Hi, I’m Elena. Luxor is a fully indoor venue, so your event is never weather-dependent. Schedule a visit or tell me what you’re planning.'
}

export function LuxorConciergeChat() {
  const reduceMotion = useReducedMotion()
  const pathname = usePathname()
  const spanish = pathname.startsWith('/es')
  const packagesPage = /^\/(?:es\/)?packages(?:\/|$)/.test(pathname)
  const eventsRoute = publicSiteEventsActive(pathname)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<(typeof eventCards)[number] | null>(null)
  const [tourSelection, setTourSelection] = useState<TourSelection | null>(null)
  useEffect(() => {
    const openElena = () => setOpen(true)
    window.addEventListener('luxor:open-elena', openElena)
    return () => window.removeEventListener('luxor:open-elena', openElena)
  }, [])
  const { slots: tourSlots, loading: tourSlotsLoading, error: tourSlotsError } = useLuxorTourSlots({ enabled: open })
  const [bookingStep, setBookingStep] = useState<1 | 2>(1)
  const [selectedTourDate, setSelectedTourDate] = useState('')
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
  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`
  }, [input, open])
  const triggerRef = useRef<HTMLButtonElement>(null)
  const formStartedAt = useRef(Date.now())
  const submissionChatRef = useRef<Array<{ role: Message['role']; content: string }> | null>(null)

  const [messages, setMessages] = useState<Message[]>([
    {
      id: createId(),
      role: 'assistant',
      content:
        'Hi, I’m Elena. Luxor is a fully indoor venue, so your event is never weather-dependent. Schedule a visit or tell me what you’re planning.',
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
  const bookingEmailComplete = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactDetails.email.trim())
  const hasTourTime = Boolean(tourSelection || preferredTourWindow)
  const bookingReady = contactComplete && hasTourTime && (!tourSelection || bookingEmailComplete)
  const availableTourDates = useMemo(() => new Set(tourSlots.map((slot) => slot.date)), [tourSlots])
  const selectedDateSlots = useMemo(
    () => tourSlots.filter((slot) => slot.date === selectedTourDate),
    [selectedTourDate, tourSlots],
  )
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

    // Keep the original chat context stable when retrying after a lost response.
    // The assistant's error message is added to the visible chat after failure.
    submissionChatRef.current ??= messages.map(({ role, content }) => ({ role, content }))
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
        browserTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        selectedTourLabel: tourSelection?.label ?? null,
        autoScheduleTour: Boolean(tourSelection),
        tourBookingType: tourSelection ? 'confirmed_slot' : 'pending_custom_request',
        chatMessages: submissionChatRef.current,
      },
    }

    try {
      const response = await submitLuxorIdempotentForm('concierge-tour', '/api/inquiries', payload)
      const result = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        throw new Error(result.error ?? 'The request could not be submitted.')
      }

      submissionChatRef.current = null
      setSubmitted(true)
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content:
            tourSelection
              ? `Perfect, ${contactDetails.name.trim()}. Your tour for ${tourSelection.label} is confirmed. A confirmation and reminders are on the way.`
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
              <button key={window} type="button" onClick={() => setPreferredTourWindow(window)} className={`rounded-md border px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${preferredTourWindow === window ? 'border-[#f1d27a] bg-[#caa24c] text-white' : 'border-[#caa24c]/22 text-[#eadcc8]'}`}>
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
              <PublicEventDatePicker
                value={selectedTourDate}
                availableDates={availableTourDates}
                label="Visit date"
                placeholder="Choose a tour day"
                className="w-full"
                onChange={(date) => {
                  setSelectedTourDate(date)
                  setTourSelection(null)
                  setBookingStep(2)
                }}
              />
              <p className="mt-3 text-[10px] leading-4 text-[#d7c29a]/55">Open dates show a green dot. Tours are 30 minutes.</p>
            </motion.div>
          ) : (
            <motion.div key="tour-time" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.22 }}>
              <p className="mb-2 font-serif text-lg text-[#f7efe3]">{toCalendarDate(selectedTourDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
              <PortalSelect
                value={tourSelection?.id ?? ''}
                onChange={(value) => {
                  setTourSelection(selectedDateSlots.find((slot) => slot.id === value) ?? null)
                  setShowOptionalContactDetails(true)
                }}
                className="w-full"
                buttonClassName="!h-12 !rounded-md !border-[#caa24c]/25 !bg-[#080706] !px-3 !py-0 !text-left !text-sm !text-[#eadcc8]"
                placeholder="Choose a time"
                options={selectedDateSlots.map((slot) => ({ value: slot.id, label: slot.time }))}
              />
              {tourSelection ? <p className="mt-2 text-[10px] text-[#d7c29a]/60">Selected: {tourSelection.label}. Add your email to receive the calendar confirmation and reminders.</p> : null}
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
        initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3 w-full rounded-2xl border border-[#caa24c]/24 bg-[#0d0908] p-4 shadow-[0_18px_50px_-34px_rgba(0,0,0,1)]"
        data-booking-card
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#caa24c]">Visit request</p>
            <h3 className="mt-1 font-serif text-2xl leading-none text-[#f7efe3]">Schedule a Visit</h3>
            <p className="mt-2 text-xs leading-5 text-[#d7c29a]/70">
              {hasTourTime ? 'Almost there — add your name and phone to request your time.' : 'Choose a time first. You only need your name and phone to request it.'}
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
                    placeholder={tourSelection ? 'Email (required for booking)' : 'Email (optional)'}
                    type="email"
                    required={Boolean(tourSelection)}
                    className="w-full rounded-md border border-[#caa24c]/18 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
                  />
                </label>
                <textarea
                  value={contactDetails.notes}
                  onChange={(event) => updateContactDetail('notes', event.target.value)}
                  placeholder="Event notes, guest count, target month..."
                  className="min-h-20 resize-none rounded-md border border-[#caa24c]/18 bg-black/30 px-3 py-2.5 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
                />
                {contactDetails.email ? <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[#caa24c]/16 bg-black/20 p-2.5 text-[11px] leading-4 text-[#d7c29a]/70"><input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} className="luxor-public-checkbox mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-[#caa24c]" /><span>Email me occasional Luxor event ideas and offers. Optional.</span></label> : null}
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
          className="luxor-gold-raised mt-3 flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-xs uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {submitted ? (tourSelection ? 'Tour confirmed' : 'Tour request sent') : submittingInquiry ? (tourSelection ? 'Booking tour' : 'Sending request') : bookingReady ? (tourSelection ? 'Confirm tour' : 'Send tour request') : hasTourTime ? tourSelection && !bookingEmailComplete ? 'Add email to confirm' : 'Add name + phone' : 'Pick a time'}
          <Check className="h-4 w-4" />
        </button>
      </motion.div>
    )
  }

  if (packagesPage) return null

  return (
    <div
      className="site-floating-action fixed right-4 z-[130] sm:bottom-6 sm:right-6 bottom-20"
      {...(eventsRoute ? { 'data-events-floating-guard': 'true' as const } : {})}
    >
      <AnimatePresence initial={false}>
        {open ? (
          <motion.section
            key="chat-window"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98, filter: 'blur(4px)' }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="luxor-concierge-panel absolute bottom-0 right-0 flex h-[min(560px,calc(100svh-6rem))] w-[calc(100vw-2rem)] max-w-[430px] flex-col overflow-hidden rounded-2xl border border-[#caa24c]/28 bg-[#080706] text-[#f7efe3] shadow-[0_30px_90px_-36px_rgba(0,0,0,1)] sm:h-[min(560px,calc(100svh-3rem))]"
            role="dialog"
            aria-modal="true"
            aria-label="Luxor concierge chat"
          >
            <header className="border-b border-[#caa24c]/18 bg-[#0d0908] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#f1d27a]/45 bg-[#120d0c]">
                  <Image src="/luxor-concierge.png" alt="Luxor concierge Elena" fill sizes="48px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold leading-none text-[#f7efe3]">Elena</p>
                  <p className="mt-1 text-xs text-[#665a4e]">
                    Luxor concierge
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#665a4e] transition hover:bg-[#e9dfd2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b6f24]"
                  aria-label="Close concierge chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="luxor-scrollbar flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      layout
                      key={message.id}
                      className={`flex flex-col ${message.ui === 'booking' ? 'w-full items-stretch' : message.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      {message.content ? (
                        <motion.div
                          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.985, filter: 'blur(8px)' }}
                          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                          transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
                          className={`flex max-w-[92%] items-start gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          {message.role === 'assistant' ? <span className="relative mt-1 h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[#e4d8c8]"><Image src="/luxor-concierge.png" alt="" fill sizes="24px" className="object-cover" /></span> : null}
                          <div className={`rounded-2xl border px-4 py-2.5 text-sm leading-6 shadow-sm ${
                            message.role === 'user'
                              ? 'rounded-tr-none border-[#d9c8a8] bg-[#f4ead6] text-[#241d17]'
                              : 'rounded-tl-none border-[#e9dfd2] bg-[#ffffff] text-[#241d17]'
                          }`}>{message.content}</div>
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
                        initial={reduceMotion ? false : { opacity: 0, y: 12, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, filter: 'blur(4px)' }}
                        transition={{ duration: reduceMotion ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="inline-flex items-center gap-2 rounded-2xl rounded-tl-none border border-[#caa24c]/18 bg-white/[0.035] px-4 py-3 text-xs text-[#d7c29a]/70"
                      >
                        <span>Elena is typing</span>
                        <div className="flex gap-1 items-center ml-1">
                          <motion.span 
                            animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
                            className="h-1.5 w-1.5 rounded-full bg-[#caa24c]"
                          />
                          <motion.span 
                            animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
                            className="h-1.5 w-1.5 rounded-full bg-[#caa24c]"
                          />
                          <motion.span 
                            animate={reduceMotion ? { opacity: 0.7 } : { opacity: [0.3, 1, 0.3] }}
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
                <div className="ml-8 mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStartChoicesVisible(false)
                      showBookingCard()
                    }}
                    className="luxor-gold-raised min-h-11 w-full rounded-xl px-4 py-3 text-center text-xs"
                  >
                    Schedule a visit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartChoicesVisible(false)
                      setEventPickerOpen(true)
                    }}
                    className="min-h-11 w-full rounded-xl border border-[#e7dac7] bg-[#fffdfa] px-4 py-2.5 text-center text-xs font-semibold text-[#665a4e] transition hover:border-[#b98a3d] hover:bg-[#f8f2e9]"
                  >
                    Tell Elena what you’re planning
                  </button>
                  <Link
                    href="/#brochure-form"
                    className="block rounded-xl px-3 py-2 text-center text-xs font-semibold text-[#805b1f] underline underline-offset-4 transition hover:text-[#5f441b]"
                  >
                    Get venue brochure
                  </Link>
                </div>
              ) : null}

              {eventPickerOpen ? (
                <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: reduceMotion ? 0 : 0.25 }} className="ml-8 mt-4">
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-[#caa24c]">
                    What are you planning?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {quickStarts.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => selectEvent(label)}
                        className={`${label === 'Other' ? 'col-span-2' : ''} min-h-11 rounded-xl border border-[#e7dac7] bg-[#fffdfa] px-3 py-2 text-left text-xs font-semibold text-[#665a4e] transition hover:border-[#b98a3d] hover:bg-[#f8f2e9]`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : null}

              {selectedEvent ? (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#caa24c]/18 bg-black/24 p-3">
                  <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-xl border border-[#caa24c]/20">
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
                <div className="luxor-concierge-composer flex items-end gap-2 rounded-2xl border border-[#e0d3c1] bg-white p-2 shadow-sm focus-within:border-[#b98a3d] focus-within:ring-2 focus-within:ring-[#caa24c]/20">
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
                    placeholder="Message Elena…"
                    aria-label="Message Elena"
                    className="luxor-concierge-input max-h-24 min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm leading-5 text-[#241d17] !outline-none placeholder:text-[#827567]"
                  />
                  <button
                    type="submit"
                    disabled={pending || !input.trim()}
                    className="luxor-gold-raised flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="Send message"
                  >
                    <ArrowUp className="h-5 w-5" aria-hidden="true" />
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
            className="luxor-concierge-launcher absolute bottom-0 right-0 group flex h-14 w-14 items-center justify-center rounded-full border border-[#caa24c]/55 bg-[#fffdf9] p-0 text-left shadow-[0_8px_24px_-10px_rgba(61,43,23,0.38)] transition hover:border-[#caa24c]/80 sm:h-auto sm:w-auto sm:justify-start sm:gap-3 sm:rounded-full sm:border-[#f1d27a]/45 sm:bg-[#0d0908] sm:p-1 sm:py-2 sm:pl-2 sm:pr-4 sm:whitespace-nowrap sm:shadow-[0_20px_70px_-30px_rgba(0,0,0,1)]"
            aria-label={spanish ? 'Abrir el chat de la concierge de Luxor' : 'Open Luxor concierge chat'}
          >
            <span className="relative flex h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#caa24c]/45 bg-[#f1e9df] sm:h-14 sm:w-14 sm:border-[#caa24c]/55 sm:bg-[#120d0c]">
              <Image src="/luxor-concierge.png" alt="" fill sizes="48px" className="object-cover" />
            </span>
            <span className="hidden sm:block">
              <span className="block font-serif text-lg leading-none text-[#f7efe3]">{spanish ? 'Pregúntale a Elena' : 'Ask Elena'}</span>
              <span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#caa24c]">
                <MessageCircle className="h-3 w-3" />
                {spanish ? 'Agendar una visita' : 'Schedule a visit'}
              </span>
            </span>
            <ChevronLeft className="hidden h-4 w-4 text-[#caa24c] transition sm:block" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
