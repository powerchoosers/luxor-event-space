import Link from 'next/link'
import { ArrowRight } from '@/lib/icons/phosphor-compat'

export default function PaymentCancelledPage() {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-5rem)] items-center overflow-hidden bg-[#050505] px-5 pb-24 pt-40 text-[#f7efe3] sm:px-6 sm:pb-28 sm:pt-44 lg:pt-48">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-24 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#caa24c]/[0.07] blur-[110px]" />
        <div className="absolute inset-x-0 top-28 mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-[#caa24c]/25 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-3xl text-center">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#f1d27a]">Payment not completed</p>
        <h1 className="mt-8 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.02em] text-[#fffaf3] sm:text-6xl">
          Your proposal is still available.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#c9c0b7] sm:text-base">
          No payment was recorded. You can use the secure link in your email again or contact Luxor if you need the proposal adjusted.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/visit"
            className="luxor-gold-raised group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-7 py-3 text-[11px] uppercase tracking-[0.2em] sm:w-auto"
          >
            Contact Luxor
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-[#caa24c]/30 px-7 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#e5d2a7] transition-colors hover:border-[#caa24c]/60 hover:text-[#f1d27a] sm:w-auto"
          >
            Return home
          </Link>
        </div>
      </div>
    </section>
  )
}