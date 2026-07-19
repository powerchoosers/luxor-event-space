'use client'

import { Loader2, Send, MessageSquare } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { LuxorMessage } from '@/lib/luxorMessageTypes'
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
  return <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Text conversation</p><p className="mt-1 text-[10px] text-zinc-600">Inbound and outbound SMS, saved with this client.</p></div><MessageSquare size={17} className="text-[#caa24c]" /></div>
    <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1 portal-scrollbar">{loading ? <p className="py-10 text-center text-xs text-zinc-600"><Loader2 className="mr-2 inline animate-spin" size={14}/>Loading texts</p> : messages.length ? messages.slice().reverse().map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 ${message.direction === 'outbound' ? 'ml-auto bg-[#caa24c] text-black' : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-zinc-200'}`}><p className="whitespace-pre-wrap text-sm">{message.body || '(Media message)'}</p><p className={`mt-1 text-[8px] font-black uppercase tracking-wider ${message.direction === 'outbound' ? 'text-black/55' : 'text-zinc-600'}`}>{message.direction === 'outbound' ? message.status : 'received'} · {new Date(message.created_at).toLocaleString()}</p></div>) : <p className="py-10 text-center text-xs text-zinc-600">No texts with this client yet.</p>}</div>
    <div className="mt-4 flex gap-2"><textarea value={body} onChange={(event) => setBody(event.target.value)} disabled={!phone || sending} rows={3} placeholder={phone ? `Message ${contactName || phone}` : 'This lead has no mobile number'} className="min-w-0 flex-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm text-white outline-none focus:border-[#caa24c]/40 disabled:opacity-50"/><button type="button" onClick={() => void send()} disabled={!phone || !body.trim() || sending} className="flex w-12 items-center justify-center rounded-xl bg-[#caa24c] text-black disabled:opacity-40">{sending ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}</button></div>
  </section>
}
