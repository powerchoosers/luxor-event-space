'use client'

import { CheckCheck, Loader2, Send, MessageSquare, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LuxorMessage } from '@/lib/luxorMessageTypes'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { useToast } from './ToastProvider'
import { PortalSmsConsentBadge } from './PortalSmsConsentBadge'
import { TextAnimate } from '@/components/ui/text-animate'

export function LuxorTextThread({ inquiryId, phone, contactName }: { inquiryId?: string; phone?: string | null; contactName?: string | null }) {
  const { notify } = useToast()
  const [messages, setMessages] = useState<LuxorMessage[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isOptedOut, setIsOptedOut] = useState(false)
  const [draftingWithElena, setDraftingWithElena] = useState(false)
  const [polishingWithElena, setPolishingWithElena] = useState(false)
  const [animatingDraft, setAnimatingDraft] = useState(false)
  const [animatingDraftText, setAnimatingDraftText] = useState('')
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const aiInFlight = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [textareaHeight, setTextareaHeight] = useState(24)

  useLayoutEffect(() => {
    if (!measureRef.current) return
    const measured = measureRef.current.offsetHeight
    let target = 24
    if (measured > 56) {
      target = 72
    } else if (measured > 32) {
      target = 48
    }
    setTextareaHeight(target)
  }, [body])
  const cardHeight = textareaHeight + 46

  useEffect(() => {
    if (!phone) {
      setIsOptedOut(false)
      return
    }
    let isMounted = true
    const checkConsent = () => {
      fetch(`/api/twilio/consent?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isMounted) return
          if (data?.status === 'opted_out') {
            setIsOptedOut(true)
          } else {
            setIsOptedOut(false)
          }
        })
        .catch(() => {
          if (isMounted) setIsOptedOut(false)
        })
    }
    checkConsent()

    const handleConsentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ phone?: string; state?: { status?: string } }>
      const updatedPhone = customEvent.detail?.phone
      if (!updatedPhone || updatedPhone === phone || updatedPhone.replace(/\D/g, '') === phone.replace(/\D/g, '')) {
        if (customEvent.detail?.state?.status) {
          setIsOptedOut(customEvent.detail.state.status === 'opted_out')
        } else {
          checkConsent()
        }
      }
    }
    window.addEventListener('luxor-sms-consent-updated', handleConsentUpdated)

    return () => {
      isMounted = false
      window.removeEventListener('luxor-sms-consent-updated', handleConsentUpdated)
    }
  }, [phone])

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const queryParts: string[] = []
      if (phone) queryParts.push(`phone=${encodeURIComponent(phone)}`)
      else if (inquiryId) queryParts.push(`inquiryId=${encodeURIComponent(inquiryId)}`)
      queryParts.push('limit=300')
      const params = `?${queryParts.join('&')}`
      const response = await fetch(`/api/twilio/messages${params}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load messages.')
      setMessages(data)
      for (const message of data as LuxorMessage[]) if (message.direction === 'inbound' && !message.is_read) void fetch('/api/twilio/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: message.id }) })
    } catch (error) { if (!quiet) notify({ title: 'Texts unavailable', description: error instanceof Error ? error.message : 'Unable to load messages.', variant: 'error' }) } finally { if (!quiet) setLoading(false) }
  }, [inquiryId, phone, notify])
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true) }, 30_000); return () => window.clearInterval(timer) }, [load])
  async function send() {
    if (!phone || !body.trim() || isOptedOut) return
    setSending(true)
    try {
      const response = await fetch('/api/twilio/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, body, inquiryId, contactName }) })
      const message = await response.json()
      if (!response.ok) throw new Error(message.error || 'Unable to send text.')
      setMessages((current) => [message, ...current]); setBody(''); notify({ title: 'Text sent', description: `Sent to ${contactName || phone}.`, variant: 'success' })
    } catch (error) { notify({ title: 'Text not sent', description: error instanceof Error ? error.message : 'Unable to send text.', variant: 'error' }) } finally { setSending(false) }
  }

  const draftWithElena = async () => {
    if (!phone || aiInFlight.current || draftingWithElena || sending || isOptedOut) return
    aiInFlight.current = true
    setDraftingWithElena(true)
    setAnimatingDraft(false)
    setAnimatingDraftText('')
    setAiStatus(null)
    try {
      const response = await fetch('/api/portal/composer-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'write',
          channel: 'sms',
          draft: body,
          instruction: '',
          context: JSON.stringify({
            name: contactName,
            messages: messages.slice(0, 20).reverse().map(({ direction, body: msgBody }) => ({ direction, body: msgBody })),
          }),
        }),
      })
      const data = (await response.json()) as { draft?: string; error?: string }
      if (!response.ok || !data.draft?.trim()) throw new Error(data.error || 'Elena could not draft a response.')
      const cleanDraft = data.draft.trim()
      setAnimatingDraftText(cleanDraft)
      setAnimatingDraft(true)
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : 'Elena could not draft a reply.')
      notify({ title: 'Elena Draft', description: error instanceof Error ? error.message : 'Could not draft response.', variant: 'error' })
    } finally {
      aiInFlight.current = false
      setDraftingWithElena(false)
    }
  }

  const polishWithElena = async () => {
    if (!phone || !body.trim() || aiInFlight.current || polishingWithElena || sending || isOptedOut) return
    const currentBody = body
    aiInFlight.current = true
    setPolishingWithElena(true)
    setAnimatingDraft(false)
    setAnimatingDraftText('')
    setAiStatus(null)
    try {
      const response = await fetch('/api/portal/composer-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'polish',
          channel: 'sms',
          draft: currentBody,
          instruction: '',
          context: JSON.stringify({
            name: contactName,
            messages: messages.slice(0, 20).reverse().map(({ direction, body: msgBody }) => ({ direction, body: msgBody })),
          }),
        }),
      })
      const data = (await response.json()) as { draft?: string; error?: string }
      if (!response.ok || !data.draft?.trim()) throw new Error(data.error || 'Elena could not polish your draft.')
      const cleanDraft = data.draft.trim()
      setAnimatingDraftText(cleanDraft)
      setAnimatingDraft(true)
      setAiStatus('Polished')
      setTimeout(() => setAiStatus(null), 3000)
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : 'Elena could not polish your draft.')
      notify({ title: 'Elena Polish', description: error instanceof Error ? error.message : 'Could not polish draft.', variant: 'error' })
    } finally {
      aiInFlight.current = false
      setPolishingWithElena(false)
    }
  }

  const finishAnimation = (text: string) => {
    setBody(text)
    setAnimatingDraft(false)
    setAnimatingDraftText('')
  }
  return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Text conversation</p>
            <PortalSmsConsentBadge phone={phone} compact className="!border-0" />
          </div>
          <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">
            {phone ? `${contactName || 'Client'} · ${formatPhoneDisplay(phone)}` : 'Inbound and outbound SMS conversations.'}
          </p>
        </div>
        <MessageSquare size={17} className="text-[#caa24c]" />
      </div>
      <div className="portal-scrollbar mt-4 max-h-[28rem] overflow-y-auto px-1 py-2 sm:px-3">
        {loading ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 py-3" aria-label="Loading text conversation">
            {[0, 1, 2, 3].map((index) => (
              <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.28, ease: [0.23, 1, 0.32, 1] }} className={`space-y-1.5 ${index % 2 ? 'ml-auto w-3/5' : 'w-2/3'}`}>
                <div className="h-14 rounded-2xl luxor-skeleton" />
                <div className={`h-2 w-20 rounded luxor-skeleton ${index % 2 ? 'ml-auto' : ''}`} />
              </motion.div>
            ))}
          </motion.div>
        ) : messages.length ? (
          <div className="mx-auto max-w-4xl space-y-3">
            {[...messages].reverse().map((message, index, thread) => {
              const outbound = message.direction === 'outbound'
              const showDate = !index || new Date(thread[index - 1].created_at).toDateString() !== new Date(message.created_at).toDateString()
              return <div key={message.id}>
                {showDate ? <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[color:var(--portal-border)]/70"/><span className="text-[11px] font-medium text-[color:var(--portal-muted)]">{new Date(message.created_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="h-px flex-1 bg-[color:var(--portal-border)]/70"/></div> : null}
                <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] sm:max-w-[72%] ${outbound ? 'text-right' : 'text-left'}`}>
                  <div className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-left text-sm leading-6 ${outbound ? 'rounded-br-md border border-[#b88d37] bg-gradient-to-b from-[#d4af54] to-[#ba8e35] !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.12)]' : 'rounded-bl-md border border-[color:var(--portal-border)]/70 bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'}`}>{message.body || '(Media message)'}</div>
                  <p className={`mt-1 flex items-center gap-1 tabular-nums text-[11px] text-[color:var(--portal-muted)] ${outbound ? 'justify-end' : 'justify-start'}`}>{message.owner_email === 'luxor-automation' ? <><span>Automated</span><span>·</span></> : null}{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{outbound ? <><span>·</span><span className="capitalize">{message.status}</span>{message.status === 'delivered' || message.status === 'read' ? <CheckCheck size={12} className={message.status === 'read' ? 'text-emerald-500' : 'text-[#caa24c]'} /> : null}</> : null}</p>
                  {message.error_message ? <p className="mt-1 text-xs text-red-500">{message.error_message}</p> : null}
                </div></div>
              </div>
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-[color:var(--portal-muted)]">No texts with this client yet.</p>
        )}
      </div>
      <div className="mt-4">
        {isOptedOut && (
          <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500 dark:text-red-400">
            <p className="font-semibold">⚠️ Recipient Opted Out of Text Messages</p>
            <p className="mt-0.5 text-[11px] opacity-90">This phone number sent a STOP keyword. Manual and automated SMS sending is disabled per carrier regulations until the client replies START.</p>
          </div>
        )}
        <motion.div
          animate={{ height: cardHeight }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto flex max-w-4xl items-end gap-2 overflow-hidden rounded-2xl border border-transparent bg-[color:var(--portal-soft)] p-2 transition-colors focus-within:border-[#caa24c]/40 focus-within:bg-[color:var(--portal-card)] focus-within:ring-2 focus-within:ring-[#caa24c]/10"
        >
          <div className="min-w-0 flex-1 px-2 py-1">
            <motion.div
              animate={{ height: textareaHeight }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="relative overflow-hidden"
            >
              <div
                ref={measureRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 -z-10 invisible whitespace-pre-wrap break-words text-sm leading-6"
              >
                {body ? (body.endsWith('\n') ? body + ' ' : body) : ' '}
              </div>
              {draftingWithElena ? (
                <div className="flex h-6 items-center gap-2">
                  <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                    <span className="absolute h-full w-full animate-ping rounded-full bg-[#caa24c]/30" />
                    <Sparkles size={13} className="animate-spin text-[#caa24c]" style={{ animationDuration: '3s' }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="elena-working-shimmer truncate text-xs font-semibold leading-6 tracking-wide text-[color:var(--portal-text)]">
                      Elena is drafting a reply for {contactName || 'client'}…
                    </p>
                  </div>
                </div>
              ) : animatingDraft && animatingDraftText ? (
                <div
                  onClick={() => finishAnimation(animatingDraftText)}
                  title="Click to edit"
                  className="h-full cursor-text"
                >
                  <TextAnimate
                    animation="blurInUp"
                    by="word"
                    duration={Math.min(1.8, Math.max(0.5, animatingDraftText.split(/\s+/).length * 0.04))}
                    className="text-sm leading-6 text-[color:var(--portal-text)]"
                    onAnimationComplete={() => {
                      setTimeout(() => finishAnimation(animatingDraftText), 350)
                    }}
                  >
                    {animatingDraftText}
                  </TextAnimate>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value.slice(0, 1600))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void send()
                    }
                  }}
                  disabled={!phone || sending || isOptedOut}
                  rows={1}
                  placeholder={
                    isOptedOut
                      ? 'Texting disabled (Recipient opted out via STOP keyword)'
                      : phone
                      ? `Message ${contactName || phone}`
                      : 'This lead has no mobile number'
                  }
                  className={`portal-input-transparent portal-scrollbar relative w-full resize-none bg-transparent p-0 m-0 border-0 text-sm leading-6 text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)] disabled:opacity-50 ${
                    textareaHeight >= 72 ? 'h-[72px] overflow-y-auto' : 'h-full overflow-hidden'
                  }`}
                />
              )}
            </motion.div>
            <div className="mt-1 flex h-4 items-center gap-1.5 whitespace-nowrap overflow-hidden text-[11px] leading-4 text-[color:var(--portal-muted)]">
              <p className="tabular-nums">
                {body.length} / 1600<span className="hidden sm:inline"> · Enter to send</span>
              </p>
              {body.trim() && !draftingWithElena && !animatingDraft ? (
                <>
                  <span aria-hidden="true" className="opacity-35 select-none">|</span>
                  <button
                    type="button"
                    onClick={() => void polishWithElena()}
                    disabled={polishingWithElena || sending || isOptedOut}
                    title="Polish grammar and clarity with Elena"
                    className="transition-colors hover:text-[#caa24c] focus-visible:outline-none focus-visible:underline disabled:opacity-50 dark:hover:text-[#f1d27a]"
                  >
                    {polishingWithElena ? 'Polishing…' : 'Polish with Elena'}
                  </button>
                  {aiStatus ? (
                    <span role="status" aria-live="polite" className="italic opacity-80">
                      ({aiStatus})
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <motion.button
            animate={{
              width: body.trim() ? 80 : 92,
              backgroundColor: body.trim() ? '#caa24c' : '#ffffff',
              color: body.trim() ? '#ffffff' : '#8c6218',
            }}
            transition={{
              width: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
              backgroundColor: { duration: 0.2 },
              color: { duration: 0.2 },
            }}
            style={{ height: 38 }}
            type="button"
            onClick={() => {
              if (body.trim()) {
                void send()
              } else {
                void draftWithElena()
              }
            }}
            disabled={!phone || (body.trim() ? sending || isOptedOut : draftingWithElena || sending || isOptedOut)}
            aria-label={body.trim() ? 'Send text message' : 'Draft reply with Elena'}
            title={body.trim() ? 'Send text message' : 'Draft reply automatically with Elena'}
            className="relative flex h-[38px] shrink-0 items-center justify-center overflow-hidden rounded-xl border-0 text-xs font-semibold shadow-xs disabled:cursor-not-allowed disabled:opacity-45"
          >
            <AnimatePresence initial={false}>
              {body.trim() ? (
                <motion.span
                  key="send-mode"
                  initial={{ opacity: 0, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(4px)' }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center gap-1.5"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>Send</span>
                </motion.span>
              ) : (
                <motion.span
                  key="elena-mode"
                  initial={{ opacity: 0, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(4px)' }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="absolute inset-0 flex items-center justify-center gap-1.5"
                >
                  {draftingWithElena ? (
                    <Loader2 size={13} className="animate-spin text-[#caa24c]" />
                  ) : (
                    <span className="relative flex h-4.5 w-4.5 shrink-0 overflow-hidden rounded-full ring-1 ring-[#caa24c]/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/luxor-concierge.png" alt="" className="h-full w-full object-cover" />
                    </span>
                  )}
                  <span>{draftingWithElena ? '…' : 'Elena'}</span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>
      </div>
    </section>
  )
}
