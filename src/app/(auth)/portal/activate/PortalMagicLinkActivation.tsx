'use client'

import { FormEvent, useEffect, useState } from 'react'
import { LoaderCircle, LockKeyhole } from 'lucide-react'

export function PortalMagicLinkActivation() {
  const [details, setDetails] = useState<{ email: string; displayName: string; purpose: string } | null>(null)
  const [message, setMessage] = useState('Checking your secure link…')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')

  useEffect(() => {
    let cancelled = false

    async function validateLink() {
      const value = new URLSearchParams(window.location.search).get('token') || ''
      if (!value) throw new Error('This secure link is invalid.')
      setToken(value)
      const response = await fetch(`/api/auth/portal-magic-link/consume?token=${encodeURIComponent(value)}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || 'Unable to open this secure link.')
      }
      const payload = await response.json()
      if (!cancelled) { setDetails(payload); setMessage('') }
    }
    void validateLink().catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to open this secure link.')
    })

    return () => { cancelled = true }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) { setMessage('The passwords do not match.'); return }
    setBusy(true); setMessage('')
    const response = await fetch('/api/auth/portal-magic-link/consume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) })
    const payload = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) { setMessage(payload.error || 'Unable to save your password.'); setBusy(false); return }
    window.location.assign('/portal')
  }

  return <main className="grid min-h-screen place-items-center bg-[#050505] p-6 text-[#f7efe3]"><div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-7 shadow-2xl"><LockKeyhole className="h-8 w-8 text-[#d7b45b]" />{details ? <><p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#caa24c]">{details.purpose === 'password_reset' ? 'Reset password' : 'Activate account'}</p><h1 className="mt-2 font-serif text-4xl">Welcome, {details.displayName}.</h1><p className="mt-3 text-sm leading-6 text-zinc-400">Create the password for <strong className="text-zinc-200">{details.email}</strong>. Use at least 12 characters.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-xs font-semibold">New password<input autoFocus type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-3 text-sm outline-none focus:border-[#caa24c]" /></label><label className="block text-xs font-semibold">Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-3 text-sm outline-none focus:border-[#caa24c]" /></label>{message ? <p role="alert" className="text-sm text-red-300">{message}</p> : null}<button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 py-3 text-sm font-bold text-[#17120a] disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{busy ? 'Saving…' : 'Save password & sign in'}</button></form></> : <p className="mt-5 text-sm leading-6 text-zinc-300">{message}</p>}</div></main>
}
