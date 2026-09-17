'use client'

import { FormEvent, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { getLuxorPublicAttribution, getLuxorPublicSessionId } from '@/lib/luxorPublicAttribution'

export function NewsletterSignup({ spanish = false }: { spanish?: boolean }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const startedAt = useRef(Date.now())

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')
    setMessage('')
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName: name, website: new FormData(event.currentTarget).get('website'), formStartedAt: startedAt.current, sessionId: getLuxorPublicSessionId(), attribution: getLuxorPublicAttribution(), pagePath: window.location.pathname, referrer: document.referrer }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; alreadySubscribed?: boolean }
      if (!response.ok) throw new Error(payload.error || 'Unable to join the newsletter right now.')
      setStatus('success')
      setMessage(payload.alreadySubscribed
        ? (spanish ? 'Ya estás en la lista. Nos alegra tenerte aquí.' : 'You are already on the list. We are glad you are here.')
        : (spanish ? 'Listo. Revisa tu correo para la confirmación de Luxor.' : 'You’re in. Check your inbox for a Luxor confirmation.'))
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to join the newsletter right now.')
    }
  }

  if (status === 'success') return <div className="flex min-h-[164px] flex-col items-center justify-center text-center sm:items-start sm:text-left" role="status" aria-live="polite"><CheckCircle2 className="h-6 w-6 text-[#f1d27a]" aria-hidden="true" /><p className="mt-3 text-base font-semibold !text-[#f8f3ed]">{message}</p></div>

  return <form onSubmit={submit} className="mt-6" noValidate>
    <label className="sr-only" htmlFor="newsletter-name">{spanish ? 'Nombre' : 'First name'}</label>
    <input id="newsletter-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="given-name" placeholder={spanish ? 'Tu nombre (opcional)' : 'Your first name (optional)'} className="w-full !border-b !border-[#caa24c]/26 bg-transparent px-0 py-3 text-sm !text-[#f8f3ed] outline-none placeholder:!text-[#d7c29a]/70 focus:!border-[#f1d27a]" />
    <label className="sr-only" htmlFor="newsletter-email">{spanish ? 'Correo electrónico' : 'Email address'}</label>
    <div className="mt-2 flex !border-b !border-[#caa24c]/26 focus-within:!border-[#f1d27a]"><input id="newsletter-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder={spanish ? 'Tu correo electrónico' : 'Your email address'} className="min-w-0 flex-1 bg-transparent px-0 py-3 text-sm !text-[#f8f3ed] outline-none placeholder:!text-[#d7c29a]/70" /><button type="submit" disabled={status === 'submitting'} className="ml-3 inline-flex min-h-11 items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.16em] !text-[#f1d27a] transition hover:!text-white disabled:cursor-wait disabled:opacity-60">{status === 'submitting' ? (spanish ? 'Uniendo…' : 'Joining…') : (spanish ? 'Únete' : 'Join')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div>
    <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
    {status === 'error' ? <p role="alert" className="mt-3 text-xs leading-5 text-rose-200">{message}</p> : null}
    <p className="mt-4 text-xs leading-5 !text-[#d7c29a]/70">{spanish ? <>Recibe invitaciones y novedades ocasionales de Luxor. Puedes darte de baja en cualquier momento. Consulta nuestra <Link href="/privacy" className="!text-[#f1d27a] underline underline-offset-4">política de privacidad</Link>.</> : <>Occasional Luxor invitations and news. Unsubscribe anytime. Read our <Link href="/privacy" className="!text-[#f1d27a] underline underline-offset-4">privacy policy</Link>.</>}</p>
  </form>
}
