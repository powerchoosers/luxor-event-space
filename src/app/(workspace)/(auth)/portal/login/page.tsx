import { ShieldCheck } from '@/lib/icons/phosphor-compat'
import Link from 'next/link'
import { PortalPasswordLogin } from './PortalPasswordLogin'
import { LuxorWordmark } from '@/components/LuxorWordmark'
import { LuxorVisitBackdrop } from '@/components/LuxorVisitBackdrop'


type LoginPageProps = { searchParams?: Promise<{ error?: string }> }

export default async function PortalLoginPage({ searchParams }: LoginPageProps) {
  const error = (await searchParams)?.error
  const message = error === 'session-expired'
    ? 'Your session has ended. Please log in again.'
    : error === 'unauthorized'
      ? 'That account is not approved for the Luxor owner portal.'
      : error ? 'The portal could not complete sign-in. Check your email and password and try again.' : null

  return (
    <main className="portal-login-screen relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[color:var(--portal-bg)] px-5 py-10 font-sans text-[color:var(--portal-text)] sm:px-8">
      <LuxorVisitBackdrop login />

      <div className="portal-login-content w-full max-w-md">
        <Link href="/" aria-label="Luxor home" className="mb-8 flex justify-center">
          <LuxorWordmark compact horizontal subline={false} className="[&_.luxor-wordmark]:!text-[2.2rem]" />
        </Link>
        <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-[0_16px_48px_-28px_rgba(35,25,10,0.3)] sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a8792f] dark:text-[#d6b666]">Luxor owner portal</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Sign in to continue</h1>
          <p className="mt-3 text-sm leading-6 text-[color:var(--portal-muted)]">Use your approved Luxor email and password to access your workspace.</p>
          {message ? <div role="alert" className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{message}</div> : null}
          <PortalPasswordLogin />
          <div className="mt-7 flex items-start gap-3 border-t border-[color:var(--portal-border)] pt-5 text-xs leading-5 text-[color:var(--portal-muted)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#b88737]" />
            <p>Sign in with the Luxor address assigned by an administrator. Password recovery is sent only to your private recovery email.</p>
          </div>
        </section>
      </div>
    </main>
  )
}

