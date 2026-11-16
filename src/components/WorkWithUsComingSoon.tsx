import Link from 'next/link'
import { ArrowLeft } from '@/lib/icons/phosphor-compat'
import type { WorkWithUsComingSoonSlug } from '@/lib/luxorWorkWithUsContent'
import { WORK_WITH_US_COMING_SOON } from '@/lib/luxorWorkWithUsContent'

export function WorkWithUsComingSoon({ slug }: { slug: WorkWithUsComingSoonSlug }) {
  const copy = WORK_WITH_US_COMING_SOON[slug]

  return (
    <main className="min-h-[70vh] bg-[#faf7f1] pt-32 text-[#241d17]">
      <div className="mx-auto max-w-lg px-5 py-16 text-center sm:px-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-[#8d672b]">Work With Us</p>
        <h1 className="mt-4 font-serif text-4xl text-[#241d17]">{copy.title}</h1>
        <p className="mt-4 text-sm leading-6 text-[#665a4e]">{copy.description}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/work-with-us"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#caa24c]/35 px-5 py-3 text-sm font-semibold text-[#241d17] transition hover:border-[#caa24c]/60"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Work With Us
          </Link>
          <Link href="/contact" className="luxor-gold-raised inline-flex min-h-11 items-center justify-center rounded-md px-5 py-3 text-sm uppercase tracking-[0.14em]">
            Contact Luxor
          </Link>
        </div>
      </div>
    </main>
  )
}