import { LockKeyhole, Mail } from 'lucide-react'
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
    ? 'That Zoho account is not allowed into the Luxor owner portal.'
    : error
      ? 'Zoho could not complete the login. Try again from the authorized Luxor mailbox.'
      : null

  return (
    <main className="min-h-screen bg-[#080706] px-5 py-10 text-[#f7efe3]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <section className="w-full rounded-lg border border-[#caa24c]/24 bg-[#0f0d0a] p-6 shadow-[0_34px_90px_-58px_rgba(0,0,0,0.95)] sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-[#caa24c]/28 bg-[#caa24c]/10 text-[#f1d27a]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <p className="mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#caa24c]">
            Luxor Owner Portal
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-none text-[#f7efe3]">
            Sign in with Zoho.
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#d7c29a]/72">
            Access is limited to the Luxor Zoho mailbox. Once signed in, the portal can send from the approved Luxor addresses and read the Zoho inbox.
          </p>

          {message ? (
            <div className="mt-5 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">
              {message}
            </div>
          ) : null}

          <Link
            href="/api/auth/zoho/login"
            className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] transition-colors hover:bg-[#f1d27a]"
          >
            <Mail className="h-4 w-4" />
            Continue with Zoho
          </Link>

          <p className="mt-5 text-xs leading-5 text-[#d7c29a]/48">
            Use <span className="font-mono text-[#f1d27a]">booking@luxoratlaspalmas.com</span> or an approved Luxor alias.
          </p>
        </section>
      </div>
    </main>
  )
}
