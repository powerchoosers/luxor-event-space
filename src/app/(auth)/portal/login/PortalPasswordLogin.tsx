'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, Eye, LoaderCircle } from '@/lib/icons/phosphor-compat'
import { EyeSlash } from '@phosphor-icons/react'

export function PortalPasswordLogin() {
  const [email, setEmail] = useState('a.patterson@luxoratlaspalmas.com')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    <label className="block text-left text-xs font-semibold text-[color:var(--portal-text)]">Email
      <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" type="email" required
        className="mt-2 min-h-12 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-3 text-base text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c] focus:ring-2 focus:ring-[#caa24c]/30" />
    </label>
    <div>
      <label htmlFor="portal-login-password" className="block text-left text-xs font-semibold text-[color:var(--portal-text)]">Password</label>
      <div className="relative mt-2">
        <input id="portal-login-password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" type={showPassword ? 'text' : 'password'} required
          className="min-h-12 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] py-3 pl-3 pr-12 text-base text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c] focus:ring-2 focus:ring-[#caa24c]/30" />
        <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition hover:text-[color:var(--portal-text)] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#caa24c]">
          {showPassword ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
        </button>
      </div>
    </div>
    {error ? <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-left text-xs leading-5 text-red-700 dark:text-red-200">{error}</p> : null}
    <button type="submit" disabled={submitting} className="luxor-gold-raised flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-65">
      {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      {submitting ? 'Signing in…' : 'Sign in securely'}
    </button>
  </form>
}

