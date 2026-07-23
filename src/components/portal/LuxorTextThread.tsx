'use client'

import { Loader2, Send, MessageSquare } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import type { LuxorMessage } from '@/lib/luxorMessageTypes'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { useToast } from './ToastProvider'

export function LuxorTextThread({ inquiryId, phone, contactName }: { inquiryId?: string; phone?: string | null; contactName?: string | null }) {
  const { notify } = useToast()
  const [messages, setMessages] = useState<LuxorMessage[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = inquiryId ? `?inquiryId=${encodeURIComponent(inquiryId)}&limit=300` : '?limit=300'
      const response = await fetch(`/api/twilio/messages${params}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load messages.')
      setMessages(data)
      for (const message of data as LuxorMessage[]) if (message.direction === 'inbound' && !message.is_read) void fetch('/api/twilio/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: message.id }) })
    } catch (error) { notify({ title: 'Texts unavailable', description: error instanceof Error ? error.message : 'Unable to load messages.', variant: 'error' }) } finally { setLoading(false) }
  }, [inquiryId, notify])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer) }, [load])
  async function send() {
    if (!phone || !body.trim()) return
    setSending(true)
    try {
      const response = await fetch('/api/twilio/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, body, inquiryId, contactName }) })
      const message = await response.json()
      if (!response.ok) throw new Error(message.error || 'Unable to send text.')
      setMessages((current) => [message, ...current]); setBody(''); notify({ title: 'Text sent', description: `Sent to ${contactName || phone}.`, variant: 'success' })
    } catch (error) { notify({ title: 'Text not sent', description: error instanceof Error ? error.message : 'Unable to send text.', variant: 'error' }) } finally { setSending(false) }
  }
  return (
    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Text conversation</p><p className="mt-1 text-[10px] text-zinc-600">{phone ? `${contactName || 'Client'} · ${formatPhoneDisplay(phone)}` : 'Inbound and outbound SMS conversations.'}</p></div><MessageSquare size={17} className="text-[#caa24c]" /></div>
      <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1 portal-scrollbar">
        {loading ? (
          <p className="py-10 text-center text-xs text-zinc-600">
            <Loader2 className="mr-2 inline animate-spin" size={14} />
            Loading texts
          </p>
        ) : messages.length ? (
          <AnimatePresence initial={false}>
            {[...messages].reverse().map((message) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 36, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
                key={message.id}
                className={`max-w-[88%] rounded-2xl px-4 py-3 ${
                  message.direction === 'outbound'
                    ? 'ml-auto bg-[#caa24c] text-white shadow-md'
                    : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{message.body || '(Media message)'}</p>
                <p
                  className={`mt-1 text-[8px] font-black uppercase tracking-wider ${
                    message.direction === 'outbound' ? 'text-white/80' : 'text-[color:var(--portal-muted)]'
                  }`}
                >
                  {message.direction === 'outbound' ? message.status : 'received'} · {new Date(message.created_at).toLocaleString()}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <p className="py-10 text-center text-xs text-[color:var(--portal-muted)]">No texts with this client yet.</p>
        )}
      </div>
      <div className="mt-4">
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!phone || sending}
            rows={3}
            placeholder={phone ? `Message ${contactName || phone}` : 'This lead has no mobile number'}
            className="portal-input-transparent min-w-0 flex-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/40 placeholder:text-[color:var(--portal-faint)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!phone || !body.trim() || sending}
            className="flex w-12 items-center justify-center rounded-xl bg-[#caa24c] text-white disabled:bg-[color:var(--portal-soft)] disabled:text-[color:var(--portal-muted)] disabled:opacity-40 transition-colors hover:bg-[#dfbd68]"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        {body.trim() ? (
          <motion.p
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 flex items-center gap-1 text-[9px] text-[#caa24c]"
          >
            Typing{' '}
            <span className="flex gap-0.5">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="h-1 w-1 rounded-full bg-[#caa24c]"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.75, repeat: Infinity, delay: dot * 0.12 }}
                />
              ))}
            </span>
          </motion.p>
        ) : null}
      </div>
    </section>
  )
}
