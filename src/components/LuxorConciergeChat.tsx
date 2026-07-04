'use client'

import { useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Mail,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  User,
  X,
} from 'lucide-react'

type Message = {
  id: string
  role: 'assistant' | 'user'
  content: string
  ui?: 'booking'
}

type TourSelection = {
  label: string
  value: string
  time: string
}

type ContactDetails = {
  name: string
  email: string
  phone: string
  notes: string
}

const eventCards = [
  {
    label: 'Wedding',
    image: '/pricing-hero.png',
    copy: 'Ceremony flow, dinner, portraits, and dancing.',
  },
  {
    label: 'Quinceañera',
    image: '/tour-header.png',
    copy: 'Grand entrance, court seating, cake, and family photos.',
  },
  {
    label: 'Baby shower',
    image: '/baby-shower.png',
    copy: 'A softer setup for family, gifts, photos, and brunch.',
  },
  {
    label: 'Corporate',
    image: '/corporate.png',
    copy: 'Awards, networking, presentations, and dinner service.',
  },
]

const tourDates = [
  { label: 'Sat, Jul 11', value: '2026-07-11', time: '10:30 AM' },
  { label: 'Sun, Jul 12', value: '2026-07-12', time: '1:00 PM' },
  { label: 'Tue, Jul 14', value: '2026-07-14', time: '6:15 PM' },
]

const quickStarts = ['Wedding', 'Quinceañera', 'Baby shower', 'Corporate event']

function createId() {
  return Math.random().toString(36).slice(2)
}

function fallbackResponse(input: string) {
  const text = input.toLowerCase()

  if (text.includes('price') || text.includes('cost') || text.includes('package')) {
    return 'Packages depend on date, guest count, and event type. The smartest next step is a private tour so the team can confirm the room setup and package fit.'
  }

  if (text.includes('wedding')) {
    return 'For a wedding, I would focus the tour on ceremony placement, dinner layout, photo spots, and the dance floor. Do you already have a month or guest count in mind?'
  }

  if (text.includes('quince')) {
    return 'For a quinceañera, we should look at the entrance, court seating, family photo areas, cake moment, and dance floor. I can help you pick a tour time.'
  }

  return 'That sounds like a good fit for a walkthrough. Tell me the event type, guest count, and your target month, then pick one of the tour cards below.'
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

export function LuxorConciergeChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<(typeof eventCards)[number] | null>(null)
  const [tourSelection, setTourSelection] = useState<TourSelection | null>(null)
  const [tourPickerOpen, setTourPickerOpen] = useState(false)
  const [eventPickerOpen, setEventPickerOpen] = useState(true)
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

  const [messages, setMessages] = useState<Message[]>([
    {
      id: createId(),
      role: 'assistant',
      content:
        'Hi, I am Elena. I can help you picture your event at Luxor, show event examples, and start a private tour request right here.',
    },
  ])

  const apiMessages = useMemo(
    () => messages.map(({ role, content }) => ({ role, content })),
    [messages],
  )

  const hasBookingCard = messages.some((message) => message.ui === 'booking')
  const contactComplete =
    contactDetails.name.trim().length > 1 &&
    contactDetails.email.includes('@') &&
    contactDetails.phone.replace(/\D/g, '').length >= 10
  const bookingReady = contactComplete && Boolean(tourSelection)

  function updateContactDetail(field: keyof ContactDetails, value: string) {
    setContactDetails((current) => ({ ...current, [field]: value }))
  }

  function showBookingCard() {
    setTourPickerOpen(false)

    if (hasBookingCard) {
      window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      return
    }

    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: 'assistant',
        content: 'I can start the tour request here. Pick a time and leave the best contact info for the Luxor team.',
        ui: 'booking',
      },
    ])
    window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  async function sendMessage(messageText: string) {
    const trimmed = messageText.trim()
    if (!trimmed || pending) return

    const shouldOfferBooking = shouldShowBookingCard(trimmed)
    const userMessage: Message = { id: createId(), role: 'user', content: trimmed }
    setMessages((current) => [...current, userMessage])
    setInput('')
    setPending(true)

    try {
      const response = await fetch('/api/luxor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            content: 'Here is the quick booking card so you do not have to type everything out.',
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
            content: 'Here is the quick booking card so you do not have to type everything out.',
            ui: 'booking',
          })
        }

        return next
      })
    } finally {
      setPending(false)
      window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    }
  }

  function selectEvent(label: string) {
    const event = eventCards.find((card) => card.label === label) || eventCards[0]
    setSelectedEvent(event)
    setEventPickerOpen(false)
    void sendMessage(`I am planning a ${label}.`)
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
      preferredTourDate: tourSelection?.value ?? '',
      preferredTourTime: tourSelection?.time ?? '',
      message: contactDetails.notes,
      source: 'chat_widget',
      flow: 'concierge_chat',
      pagePath: window.location.pathname,
      referrer: document.referrer,
      metadata: {
        selectedEvent: selectedEvent?.label ?? null,
        selectedTourLabel: tourSelection ? `${tourSelection.label}, ${tourSelection.time}` : null,
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
            `Perfect. I saved this tour request in the Luxor CRM for ${contactDetails.name.trim()} at ${tourSelection?.label}, ${tourSelection?.time}. A Luxor coordinator will confirm final availability by phone or email.`,
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
            'I could not save that to the CRM yet. Please check the contact details, or use the full form while we fix the connection.',
        },
      ])
    } finally {
      setSubmittingInquiry(false)
    }
  }

  function renderBookingCard(messageId: string) {
    return (
      <motion.div
        key={`${messageId}-booking`}
        layout
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
        className="mt-3 rounded-md border border-[#caa24c]/24 bg-[#0d0908] p-3 shadow-[0_18px_50px_-34px_rgba(0,0,0,1)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#caa24c]">Tour request</p>
            <h3 className="mt-1 font-serif text-2xl leading-none text-[#f7efe3]">Fast booking details</h3>
          </div>
          {submitted ? (
            <span className="rounded-md border border-[#caa24c]/25 bg-[#caa24c] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#050505]">
              Started
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2">
          {tourDates.map((slot) => {
            const active = tourSelection?.value === slot.value && tourSelection.time === slot.time

            return (
              <button
                key={`${slot.value}-${slot.time}-card`}
                type="button"
                onClick={() => setTourSelection(slot)}
                className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition ${
                  active
                    ? 'border-[#f1d27a]/55 bg-[#caa24c] text-[#050505]'
                    : 'border-[#caa24c]/18 bg-black/25 text-[#eadcc8] hover:border-[#f1d27a]/45'
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold">{slot.label}</span>
                  <span className="block text-xs opacity-75">{slot.time}</span>
                </span>
                {active ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </button>
            )
          })}
        </div>

        <div className="mt-3 grid gap-2">
          <label className="relative block">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/70" />
            <input
              value={contactDetails.name}
              onChange={(event) => updateContactDetail('name', event.target.value)}
              placeholder="Full name"
              className="w-full rounded-md border border-[#caa24c]/18 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
            />
          </label>
          <label className="relative block">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/70" />
            <input
              value={contactDetails.email}
              onChange={(event) => updateContactDetail('email', event.target.value)}
              placeholder="Email"
              type="email"
              className="w-full rounded-md border border-[#caa24c]/18 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
            />
          </label>
          <label className="relative block">
            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#caa24c]/70" />
            <input
              value={contactDetails.phone}
              onChange={(event) => updateContactDetail('phone', event.target.value)}
              placeholder="Phone"
              type="tel"
              className="w-full rounded-md border border-[#caa24c]/18 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
            />
          </label>
          <textarea
            value={contactDetails.notes}
            onChange={(event) => updateContactDetail('notes', event.target.value)}
            placeholder="Event notes, guest count, target month..."
            className="min-h-20 resize-none rounded-md border border-[#caa24c]/18 bg-black/30 px-3 py-2.5 text-sm text-[#f7efe3] outline-none placeholder:text-[#d7c29a]/38 focus:border-[#f1d27a]/60"
          />
        </div>

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
          {submitted ? 'Request saved' : submittingInquiry ? 'Saving request' : bookingReady ? 'Save to CRM' : 'Pick time + add contact'}
          <Check className="h-4 w-4" />
        </button>
      </motion.div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[130] sm:bottom-6 sm:right-6">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.section
            key="chat-window"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="absolute bottom-0 right-0 flex h-[min(720px,calc(100svh-2rem))] w-[calc(100vw-2rem)] max-w-[430px] flex-col overflow-hidden rounded-md border border-[#caa24c]/28 bg-[#080706] text-[#f7efe3] shadow-[0_30px_90px_-36px_rgba(0,0,0,1)]"
            role="dialog"
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
                      className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
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
                          <Sparkles className="h-3.5 w-3.5 text-[#caa24c]" />
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
                        className="rounded-md border border-[#caa24c]/22 bg-black/24 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[#d7c29a]/82 transition hover:border-[#f1d27a]/50 hover:text-[#f1d27a]"
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

            <div className="border-t border-[#caa24c]/18 bg-[#0d0908] px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setTourPickerOpen((current) => !current)
                  if (!hasBookingCard) showBookingCard()
                }}
                className="flex w-full items-center justify-between rounded-md border border-[#caa24c]/20 bg-black/20 px-3 py-2.5 text-left transition hover:border-[#f1d27a]/45"
                aria-expanded={tourPickerOpen}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-[#caa24c]" />
                  <span className="min-w-0">
                    <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-[#caa24c]">
                      Tour window
                    </span>
                    <span className="block truncate text-xs text-[#d7c29a]/70">
                      {tourSelection ? `${tourSelection.label}, ${tourSelection.time}` : 'Tap to pick a time'}
                    </span>
                  </span>
                </span>
                <ChevronLeft className={`h-4 w-4 shrink-0 text-[#caa24c] transition ${tourPickerOpen ? '-rotate-90' : 'rotate-90'}`} />
              </button>

              <AnimatePresence initial={false}>
                {tourPickerOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="grid gap-2 pt-2">
                      {tourDates.map((slot) => {
                        const active = tourSelection?.value === slot.value && tourSelection.time === slot.time

                        return (
                          <button
                            key={`${slot.value}-${slot.time}`}
                            type="button"
                            onClick={() => setTourSelection(slot)}
                            className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition ${
                              active
                                ? 'border-[#f1d27a]/55 bg-[#caa24c] text-[#050505]'
                                : 'border-[#caa24c]/18 bg-[#080706] text-[#eadcc8] hover:border-[#f1d27a]/45'
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-semibold">{slot.label}</span>
                              <span className="block text-xs opacity-75">{slot.time}</span>
                            </span>
                            {active ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                          </button>
                        )
                      })}
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                        {tourSelection ? (
                          <button
                            type="button"
                            onClick={submitTourRequest}
                            className="flex items-center justify-center gap-2 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[#050505] transition hover:bg-[#f1d27a]"
                          >
                            {submitted ? 'Request saved' : contactComplete ? 'Save to CRM' : 'Add contact info'}
                            <Check className="h-4 w-4" />
                          </button>
                        ) : null}

                        <Link
                          href="/visit"
                          className="flex items-center justify-center gap-2 rounded-md px-3 py-3 text-xs font-bold uppercase tracking-[0.14em] text-[#f1d27a] transition hover:text-[#fff0b5]"
                        >
                          Full form
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                void sendMessage(input)
              }}
              className="border-t border-[#caa24c]/18 bg-[#0d0908] p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
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
          </motion.section>
        ) : (
          <motion.button
            key="chat-trigger"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            type="button"
            onClick={() => setOpen(true)}
            className="absolute bottom-0 right-0 group flex items-center gap-3 rounded-full border border-[#f1d27a]/45 bg-[#0d0908] py-2 pl-2 pr-4 text-left shadow-[0_20px_70px_-30px_rgba(0,0,0,1)] transition hover:border-[#f1d27a]/70 hover:bg-[#120d0c] whitespace-nowrap"
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
