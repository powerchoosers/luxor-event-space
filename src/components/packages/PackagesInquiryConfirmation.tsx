'use client'

import Link from 'next/link'
import { ArrowRight } from '@/lib/icons/phosphor-compat'

type PackagesInquiryConfirmationProps = {
  locale?: 'en' | 'es'
  inquiryId?: string | null
}

const copy = {
  en: {
    heading: 'Your Luxor Experience Starts Here.',
    subheading: 'Thank you for considering Luxor! Your event details have been received. Would you like to schedule a private tour of our venue?',
    tour: 'Schedule a tour',
    later: "I'll do this later",
  },
  es: {
    heading: 'Tu experiencia Luxor comienza aquí.',
    subheading: '¡Gracias por considerar Luxor! Recibimos los detalles de tu evento. ¿Te gustaría agendar un recorrido privado por nuestro venue?',
    tour: 'Agendar un recorrido',
    later: 'Lo haré después',
  },
} as const

export function PackagesInquiryConfirmation({ locale = 'en', inquiryId }: PackagesInquiryConfirmationProps) {
  const t = copy[locale]
  const visitHref = locale === 'es' ? '/es/visit' : '/visit'
  const tourHref = inquiryId
    ? `${visitHref}?inquiryId=${encodeURIComponent(inquiryId)}&source=packages_inquiry`
    : visitHref
  const packagesHref = locale === 'es' ? '/es/packages' : '/packages'

  return (
    <main className="flex min-h-[70vh] items-center bg-[#f7f3ec] px-5 py-24 text-[#241d17] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">{t.heading}</h1>
        <p className="mt-5 text-base leading-7 text-[#665a4e]">{t.subheading}</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={tourHref} className="luxor-gold-raised inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-6 py-3 text-sm uppercase tracking-[0.14em]">
            {t.tour} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={packagesHref}
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#9b6f24]/35 bg-white/80 px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#241d17]"
          >
            {t.later}
          </Link>
        </div>
      </div>
    </main>
  )
}
