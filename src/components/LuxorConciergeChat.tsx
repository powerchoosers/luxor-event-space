'use client'

import { useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react'

type Message = {
  id: string
  role: 'assistant' | 'user'
  content: string
}

type TourSelection = {
  date: string
  time: string
}

const eventCards = [
  {
    label: 'Wedding',
    image: '/pricing-hero.png',
    copy: 'Ceremony flow, dinner, portraits, and dancing.',
  },
  {
    label: 'Quinceanera',
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
  { date: 'Sat, Jul 11', time: '10:30 AM' },
  { date: 'Sun, Jul 12', time: '1:00 PM' },
  { date: 'Tue, Jul 14', time: '6:15 PM' },
]

const quickStarts = ['Wedding', 'Quinceanera', 'Baby shower', 'Corporate event']

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
    return 'For a quinceanera, we should look at the entrance, court seating, family photo areas, cake moment, and dance floor. I can help you pick a tour time.'
  }

  return 'That sounds like a good fit for a walkthrough. Tell me the event type, guest count, and your target month, then pick one of the tour cards below.'
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

  async function sendMessage(messageText: string) {
    const trimmed = messageText.trim()
    if (!trimmed || pending) return

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

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'assistant',
          content: data.reply || fallbackResponse(trimmed),
        },
      ])
    } catch {
      setMessages((current) => [
        ...current,
        { id: createId(), role: 'assistant', content: fallbackResponse(trimmed) },
      ])
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

  function submitTourRequest() {
    setSubmitted(true)
    setMessages((current) => [
      ...current,
      {
        id: createId(),
        role: 'assistant',
        content:
          'Perfect. I saved this as a tour request starter. A Luxor coordinator will still confirm final availability and details.',
      },
    ])
  }

  return (
    <div className="fixed bottom-4 right-4 z-[130] sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {open ? (
          <motion.section
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="mb-4 flex h-[min(720px,calc(100svh-2rem))] w-[calc(100vw-2rem)] max-w-[430px] flex-col overflow-hidden rounded-md border border-[#caa24c]/28 bg-[#080706] text-[#f7efe3] shadow-[0_30px_90px_-36px_rgba(0,0,0,1)]"
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
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-md px-4 py-3 text-sm leading-6 ${
                        message.role === 'user'
                          ? 'bg-[#caa24c] text-[#050505]'
                          : 'border border-[#caa24c]/18 bg-white/[0.035] text-[#eadcc8]'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                {pending ? (
                  <div className="inline-flex items-center gap-2 rounded-md border border-[#caa24c]/18 bg-white/[0.035] px-4 py-3 text-xs text-[#d7c29a]/70">
                    <Sparkles className="h-4 w-4 text-[#caa24c]" />
                    Elena is thinking...
                  </div>
                ) : null}
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
                onClick={() => setTourPickerOpen((current) => !current)}
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
                      {tourSelection ? `${tourSelection.date}, ${tourSelection.time}` : 'Tap to pick a time'}
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
                        const active = tourSelection?.date === slot.date && tourSelection.time === slot.time

                        return (
                          <button
                            key={`${slot.date}-${slot.time}`}
                            type="button"
                            onClick={() => setTourSelection(slot)}
                            className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition ${
                              active
                                ? 'border-[#f1d27a]/55 bg-[#caa24c] text-[#050505]'
                                : 'border-[#caa24c]/18 bg-[#080706] text-[#eadcc8] hover:border-[#f1d27a]/45'
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-semibold">{slot.date}</span>
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
                            {submitted ? 'Request started' : 'Start request'}
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
        ) : null}
      </AnimatePresence>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex items-center gap-3 rounded-full border border-[#f1d27a]/45 bg-[#0d0908] py-2 pl-2 pr-4 text-left shadow-[0_20px_70px_-30px_rgba(0,0,0,1)] transition hover:border-[#f1d27a]/70 hover:bg-[#120d0c]"
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
        </button>
      ) : null}
    </div>
  )
}
