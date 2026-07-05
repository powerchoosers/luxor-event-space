import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string
  }>
}

export default async function PortalLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const error = params?.error
  const message = error === 'unauthorized'
    ? 'That Zoho account is not approved for the Luxor owner portal.'
    : error
      ? 'Zoho could not complete the login. Use the approved Luxor mailbox and try again.'
      : null

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#050505] text-[#f7efe3] lg:grid-cols-[0.95fr_1.05fr]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(202,162,76,0.13),transparent_28%,transparent_72%,rgba(189,101,117,0.08)),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:auto,72px_72px,72px_72px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#caa24c]/60 to-transparent" />

      <section className="relative hidden min-h-screen px-10 py-10 lg:flex lg:flex-col">
        <Link href="/" className="inline-flex w-fit items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-md border border-[#caa24c]/28 bg-[#caa24c]/8">
            <Image src="/luxor-palm-mark.png" alt="" width={34} height={34} className="opacity-90" priority />
          </span>
          <span>
            <span className="block font-serif text-4xl tracking-[0.22em] text-[#d7b45b]">LUXOR</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]/70">Owner Command</span>
          </span>
        </Link>

        <div className="flex flex-1 items-center">
          <div className="max-w-xl -translate-y-4">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.38em] text-[#caa24c]">Private Access</p>
          <h1 className="mt-5 font-serif text-6xl leading-[0.92] text-[#f7efe3]">
            Luxor owner portal.
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-[#d7c29a]/68">
            Client follow-up, event operations, invoices, and Zoho communications are protected behind the Luxor mailbox.
          </p>

          <div className="mt-9 grid max-w-md gap-2">
            <StatusLine label="Zoho identity" value="Required" />
            <StatusLine label="Approved mailbox" value="booking@luxoratlaspalmas.com" />
            <StatusLine label="Alias sending" value="hello@luxoratlaspalmas.com" />
          </div>
          </div>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <Image src="/luxor-brand-lockup.png" alt="Luxor" width={220} height={82} priority />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/78 p-6 shadow-2xl shadow-black/45 backdrop-blur-xl sm:p-8">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-[#caa24c]/24 bg-[#0d0b08] shadow-[0_20px_60px_-38px_rgba(202,162,76,0.7)]">
              <LockKeyhole className="h-8 w-8 text-[#f1d27a]" />
            </div>

            <div className="mt-7 text-center">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[#caa24c]">
                Zoho Authentication
              </p>
              <h2 className="mt-3 font-serif text-4xl leading-none text-white">
                Sign in to continue.
              </h2>
              <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-zinc-400">
                Use the Luxor Zoho account to unlock the CRM workspace and activate email sending.
              </p>
            </div>

            {message ? (
              <div className="mt-6 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">
                {message}
              </div>
            ) : null}

            <Link
              href="/api/auth/zoho/login"
              className="group mt-7 flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-[#caa24c] px-5 text-sm font-black uppercase tracking-[0.18em] text-black shadow-lg shadow-[#caa24c]/10 transition-colors hover:bg-[#f1d27a]"
            >
              <Mail className="h-4 w-4" />
              Sign in with Zoho
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>

            <div className="mt-6 rounded-lg border border-zinc-800 bg-black/35 px-4 py-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#f1d27a]" />
                <p className="text-xs leading-5 text-zinc-500">
                  Access is limited to approved Luxor Zoho addresses. Logging out clears this browser&apos;s portal session.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-700">
            Luxor Event Space / Secure Portal
          </p>
        </div>
      </section>
    </main>
  )
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#caa24c]/12 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#d7c29a]/45">{label}</span>
      <span className="text-right font-mono text-[10px] text-[#f1d27a]">{value}</span>
    </div>
  )
}
