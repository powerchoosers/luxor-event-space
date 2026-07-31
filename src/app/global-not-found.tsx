import Link from 'next/link'
import './globals.css'

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center px-6 py-20">
          <div className="w-full max-w-2xl text-center">
            <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.28em] text-[#f1d27a]">
              <span className="h-px w-9 bg-[#caa24c]" />
              Luxor Event Space
              <span className="h-px w-9 bg-[#caa24c]" />
            </Link>
            <p className="mt-16 text-xs font-bold uppercase tracking-[0.32em] text-[#b9aa91]">Page not found</p>
            <h1 className="mt-5 font-serif text-5xl leading-tight text-[#f6efe8] sm:text-7xl">
              This page isn&apos;t here,<br />but Luxor is.
            </h1>
            <p className="mx-auto mt-7 max-w-lg text-base leading-7 text-[#b9aa91]">
              The address may have changed. You can return home or schedule a private tour of the venue.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/tour" className="rounded-full bg-[#caa24c] px-7 py-3 text-sm font-bold text-[#050505] transition hover:bg-[#f1d27a]">
                Schedule a tour
              </Link>
              <Link href="/" className="rounded-full border border-white/20 px-7 py-3 text-sm font-bold text-[#f6efe8] transition hover:border-[#caa24c] hover:text-[#f1d27a]">
                Return home
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
