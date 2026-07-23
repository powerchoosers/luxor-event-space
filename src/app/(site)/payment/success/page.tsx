import Link from 'next/link'
import { ArrowRight, Check, Mail } from 'lucide-react'

export default function PaymentSuccessPage() {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-5rem)] items-center overflow-hidden bg-[#050505] px-5 pb-24 pt-40 text-[#f7efe3] sm:px-6 sm:pb-28 sm:pt-44 lg:pt-48">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-24 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#caa24c]/[0.07] blur-[110px]" />
        <div className="absolute inset-x-0 top-28 mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-[#caa24c]/25 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-3xl text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#caa24c]/40 bg-[#caa24c]/10 shadow-[0_0_50px_rgba(202,162,76,0.12)] sm:h-24 sm:w-24">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#caa24c] text-[#050505] sm:h-12 sm:w-12">
            <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
          </div>
        </div>

        <h1 className="mt-8 font-serif text-4xl font-medium leading-[1.08] tracking-[-0.02em] text-[#fffaf3] sm:text-6xl">
          Your payment is confirmed.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#c9c0b7] sm:text-base">
          Thank you for choosing Luxor Event Space. Your payment was submitted securely, and our team will follow up with the next step for your event.
        </p>

        <div className="mx-auto mt-9 flex max-w-lg items-start gap-4 border-y border-white/10 py-5 text-left">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[#d8b65e]">
            <Mail className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#f7efe3]">What happens next?</p>
            <p className="mt-1 text-xs leading-5 text-[#9f9891] sm:text-sm">
              Keep an eye on your inbox. The Luxor team will contact you if anything else is needed.
            </p>
          </div>
        </div>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#caa24c] px-7 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#050505] shadow-[0_18px_44px_-22px_rgba(202,162,76,0.8)] transition-colors hover:bg-[#dfbd68] sm:w-auto"
          >
            Return home
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
          <Link
            href="/visit"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-[#caa24c]/30 px-7 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[#e5d2a7] transition-colors hover:border-[#caa24c]/60 hover:text-[#f1d27a] sm:w-auto"
          >
            Contact our team
          </Link>
        </div>
      </div>
    </section>
  )
}
