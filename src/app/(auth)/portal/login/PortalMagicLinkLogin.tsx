'use client'

import { FormEvent, useState } from 'react'
import { Mail, LoaderCircle } from 'lucide-react'

export function PortalMagicLinkLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true)
    try { await fetch('/api/auth/portal-magic-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); setSent(true) } finally { setLoading(false) }
  }
  return <form className="mt-5 border-t border-zinc-800 pt-5" onSubmit={submit}>
    <p className="text-center text-xs leading-5 text-zinc-500">Team members can sign in with a secure link sent to their approved email.</p>
    <label className="sr-only" htmlFor="portal-magic-email">Email address</label>
    <div className="mt-3 flex gap-2"><input id="portal-magic-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black/45 px-3 py-2.5 text-sm text-white outline-none focus:border-[#caa24c]" /><button type="submit" disabled={loading} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#caa24c]/45 px-3 text-xs font-bold text-[#f1d27a] disabled:opacity-50">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{sent ? 'Sent' : 'Email link'}</button></div>
    {sent ? <p className="mt-3 text-center text-xs text-emerald-300">If this email is approved, a secure sign-in link is on its way.</p> : null}
  </form>
}
