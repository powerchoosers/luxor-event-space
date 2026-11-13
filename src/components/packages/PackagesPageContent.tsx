'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarCheck2, ShieldCheck, SlidersHorizontal, Sparkles } from '@/lib/icons/phosphor-compat'
import { Reveal } from '@/components/Reveal'
import { StaggerCard, StaggerCards } from '@/components/StaggerCards'
import { PackageFlipCard } from '@/components/packages/PackageFlipCard'
import { PackagesConfigurator } from '@/components/packages/PackagesConfigurator'
import type { PublicPackageCardData } from '@/lib/luxorPublicPackages'
type PackagesPageContentProps = {
  locale?: 'en' | 'es'
  cards: PublicPackageCardData[]
}

const content = {
  en: {
    heroEyebrow: 'Event packages',
    heroCopy: 'Flexible packages, personalized options, and complete transparency so you can plan with confidence.',
    exploreEyebrow: 'Explore our packages',
    exploreTitle: 'Three curated experience levels',
    exploreCopy: 'Essentials, Signature, and Luxor — designed to fit your vision, style, and event needs.',
    configEyebrow: 'Get an instant quote',
    configTitle: 'Build Your Luxor Experience',
    configCopy: 'Select your event details below to see your exact price in real time.',
    benefits: [
      ['Real pricing', 'See your exact cost instantly.', CalendarCheck2],
      ['Flexible options', 'Customize to fit your vision.', SlidersHorizontal],
      ['Full transparency', 'All required fees included.', ShieldCheck],
      ['Personalized support', 'Our team is here to help.', Sparkles],
    ] as const,
    visitEyebrow: 'Ready to see it in person?',
    visitTitle: 'Schedule a Visit',
    visitCopy: 'Tour the space, ask questions, and picture your celebration at Luxor.',
    visitCta: 'Schedule a Visit',
    visitHref: '/visit',
  },
  es: {
    heroEyebrow: 'Paquetes para eventos',
    heroCopy: 'Paquetes flexibles, opciones personalizadas y transparencia total para que planees con confianza.',
    exploreEyebrow: 'Conoce nuestros paquetes',
    exploreTitle: 'Tres niveles de experiencia',
    exploreCopy: 'Esenciales, Signature y Luxor — diseñados para tu visión, tu estilo y las necesidades de tu evento.',
    configEyebrow: 'Cotización al instante',
    configTitle: 'Arma tu experiencia Luxor',
    configCopy: 'Selecciona los detalles de tu evento abajo para ver tu precio exacto en tiempo real.',
    benefits: [
      ['Precios reales', 'Mira el costo exacto al instante.', CalendarCheck2],
      ['Opciones flexibles', 'Personaliza según tu visión.', SlidersHorizontal],
      ['Transparencia total', 'Todos los cargos requeridos incluidos.', ShieldCheck],
      ['Apoyo personalizado', 'Nuestro equipo está para ayudarte.', Sparkles],
    ] as const,
    visitEyebrow: '¿Listo para conocerlo en persona?',
    visitTitle: 'Agenda una visita',
    visitCopy: 'Recorre el espacio, haz preguntas e imagina tu celebración en Luxor.',
    visitCta: 'Agendar una visita',
    visitHref: '/es/visit',
  },
} as const

export function PackagesPageContent({ locale = 'en', cards }: PackagesPageContentProps) {
  const t = content[locale]

  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate min-h-[92svh] overflow-hidden bg-[#f7f3ec] pt-28 sm:min-h-screen">
        <div className="relative z-10 mx-auto grid min-h-[calc(92svh-7rem)] max-w-7xl items-center gap-12 px-5 pb-14 pt-10 sm:min-h-[calc(100vh-7rem)] sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:px-8 lg:pt-14">
          <div className="min-w-0 text-center lg:text-left">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#f1d27a]">{t.heroEyebrow}</p>
            <h1 className="mx-auto max-w-xl text-wrap font-serif text-5xl leading-[0.92] text-[#241d17] sm:text-6xl lg:mx-0 lg:text-7xl">
              {locale === 'es' ? (
                <>
                  Crea tu experiencia <span className="italic text-[#8e6829]">Luxor</span>
                </>
              ) : (
                <>
                  Create Your <span className="italic text-[#8e6829]">Luxor</span> Experience
                </>
              )}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#665a4e] sm:text-lg lg:mx-0">{t.heroCopy}</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <a
                href="#explore-packages"
                className="luxor-gold-raised inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm uppercase tracking-[0.14em]"
              >
                {t.exploreEyebrow} <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href={t.visitHref}
                data-conversion="visit_cta_click"
                data-conversion-label="Packages hero"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#9b6f24]/35 bg-white/70 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#241d17] transition hover:border-[#9b6f24]/60 hover:bg-white"
              >
                {t.visitCta}
              </Link>
            </div>
          </div>

          <div className="relative min-h-[30rem] overflow-hidden rounded-md border border-[#9b6f24]/25 bg-[#eee6da] shadow-[0_32px_80px_-48px_rgba(61,43,23,0.42)] sm:min-h-[38rem] lg:min-h-[calc(100vh-11rem)]">
            <Image
              src="/images/dining-hall/main-hall-reception-professional.png"
              alt="Luxor main hall prepared for a celebration"
              fill
              priority
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="object-cover object-center"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/25 to-transparent" />
          </div>
        </div>
      </section>

      <section id="explore-packages" className="scroll-mt-28 bg-[#080706] py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <h2 className="font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">{t.exploreTitle}</h2>
            <p className="mt-5 text-base leading-7 text-[#d7c29a]/72">{t.exploreCopy}</p>
          </Reveal>
          <StaggerCards className="mt-12 grid gap-6 lg:grid-cols-3" stagger={0.08}>
            {cards.map((card) => (
              <StaggerCard key={card.id} className="h-full">
                <PackageFlipCard data={card} locale={locale} />
              </StaggerCard>
            ))}
          </StaggerCards>
        </div>
      </section>

      <section id="build-your-experience" className="scroll-mt-28 border-y border-[#caa24c]/16 bg-[#0a0807] py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <h2 className="font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">{t.configTitle}</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#d7c29a]/72">{t.configCopy}</p>
          </Reveal>
          <Reveal className="mt-10">
            <PackagesConfigurator locale={locale} />
          </Reveal>
        </div>
      </section>

      <section className="bg-[#120d0c] py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <h2 className="font-serif text-4xl leading-[0.95] sm:text-5xl">Pricing transparency</h2>
          </Reveal>
          <StaggerCards className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" stagger={0.07}>
            {t.benefits.map(([title, copy, Icon]) => (
              <StaggerCard key={title} className="h-full">
                <article className="h-full rounded-md border border-[#caa24c]/18 bg-black/24 p-5">
                  <Icon className="h-5 w-5 text-[#caa24c]" aria-hidden />
                  <h3 className="mt-4 font-serif text-2xl leading-none text-[#f7efe3]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#d7c29a]/68">{copy}</p>
                </article>
              </StaggerCard>
            ))}
          </StaggerCards>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#050505] py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[url('/images/dining-hall/main-hall-wedding-wide.png')] bg-cover bg-center opacity-20" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#050505]/70 via-[#050505]/55 to-[#050505]" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl text-center lg:text-left">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#f1d27a]">{t.visitEyebrow}</p>
            <h2 className="mt-4 font-serif text-4xl leading-[0.95] text-[#f7efe3] sm:text-5xl">{t.visitTitle}</h2>
            <p className="mt-5 text-base leading-7 text-[#d7c29a]/72">{t.visitCopy}</p>
            <Link
              href={t.visitHref}
              data-conversion="visit_cta_click"
              data-conversion-label="Packages schedule visit"
              className="luxor-gold-raised mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-6 py-3 text-sm uppercase tracking-[0.14em]"
            >
              {t.visitCta} <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>

    </main>
  )
}
