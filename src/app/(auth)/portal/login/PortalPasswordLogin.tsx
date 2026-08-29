'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'

export function PortalPasswordLogin() {
  const [email, setEmail] = useState('a.patterson@luxoratlaspalmas.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/portal-login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }) })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || 'Sign-in failed.')
      }
      window.location.assign('/portal')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return <form className="mt-7 space-y-4" onSubmit={submit}>
    <label className="block text-left text-xs font-semibold text-zinc-300">Email
      <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" type="email" required
        className="mt-2 w-full rounded-lg border border-zinc-700 bg-black/45 px-3 py-3 text-sm text-white outline-none transition focus:border-[#caa24c]" />
    </label>
    <label className="block text-left text-xs font-semibold text-zinc-300">Password
      <input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" type="password" required
        className="mt-2 w-full rounded-lg border border-zinc-700 bg-black/45 px-3 py-3 text-sm text-white outline-none transition focus:border-[#caa24c]" />
    </label>
    {error ? <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-left text-xs leading-5 text-red-200">{error}</p> : null}
    <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-4 py-3 text-sm font-bold text-[#17120a] transition hover:bg-[#e0bd63] disabled:cursor-not-allowed disabled:opacity-65">
      {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      {submitting ? 'Signing in…' : 'Sign in securely'}
    </button>
  </form>
}
