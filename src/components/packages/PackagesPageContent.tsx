'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { MouseEvent } from 'react'
import { useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarCheck2, ShieldCheck, SlidersHorizontal, Users } from '@/lib/icons/phosphor-compat'
import { Reveal } from '@/components/Reveal'
import { StaggerCard, StaggerCards } from '@/components/StaggerCards'
import { PackageFlipCard } from '@/components/packages/PackageFlipCard'
import { PackagesConfigurator } from '@/components/packages/PackagesConfigurator'
import { VenueFilm } from '@/components/VenueFilm'
import { LuxorVisitBackdrop } from '@/components/LuxorVisitBackdrop'
import { getLuxorLenis } from '@/components/SmoothScroll'
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
      ['Personalized support', 'Our team is here to help.', Users],
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
      ['Apoyo personalizado', 'Nuestro equipo está para ayudarte.', Users],
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
  const reduceMotion = useReducedMotion()

  function scrollToPackages(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = document.getElementById('explore-packages')
    if (!target) return
    event.preventDefault()
    if (window.location.hash !== '#explore-packages') window.history.pushState(null, '', '#explore-packages')
    const offset = (document.getElementById('shared-header')?.getBoundingClientRect().height ?? 80) + 20
    const top = window.scrollY + target.getBoundingClientRect().top - offset
    const lenis = getLuxorLenis()
    if (lenis) {
      lenis.scrollTo(top, { immediate: !!reduceMotion, duration: 0.9 })
    } else {
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' })
    }
  }

  return (
    <main className="overflow-x-hidden bg-[#050505] text-[#f7efe3]">
      <section className="relative isolate overflow-hidden pt-28 lg:px-8 lg:pb-20 lg:pt-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(202,162,76,0.14),transparent_22rem),radial-gradient(circle_at_88%_12%,rgba(189,101,117,0.16),transparent_20rem),linear-gradient(180deg,#120d0c,#050505)]" />
        <div className="absolute inset-0 luxor-noise opacity-[0.16]" />
        
        {/* Mobile and tablet use the edge-to-edge film above the introduction. */}
        <div className="relative z-10 lg:hidden">
          <div className="w-full overflow-hidden [&_.venue-film]:!rounded-none [&_.venue-film_video]:!rounded-none">
            <VenueFilm autoPlay />
          </div>
        </div>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-5 pb-12 pt-8 sm:px-6 lg:grid-cols-[.78fr_1.22fr] lg:items-center lg:gap-10 lg:px-0 lg:pb-0 lg:pt-0">
          <div className="order-2 mx-auto min-w-0 max-w-2xl text-center lg:order-1 lg:mx-0">
            <p className="font-mono text-[10px] sm:text-xs font-bold uppercase tracking-[0.38em] text-[#8d672b]">{t.heroEyebrow}</p>
            <h1 className="mx-auto mt-5 max-w-xl font-serif text-5xl leading-[0.92] text-[#fffaf3] sm:text-6xl lg:text-7xl">
              {locale === 'es' ? (
                <>
                  Crea tu experiencia <span className="italic text-[#f1d27a]">Luxor</span>
                </>
              ) : (
                <>
                  Create Your <span className="italic text-[#f1d27a]">Luxor</span> Experience
                </>
              )}
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-[#d7c29a]/78 sm:text-lg">{t.heroCopy}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:items-center">
              <a
                href="#explore-packages"
                onClick={scrollToPackages}
                className="luxor-gold-raised inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-6 py-3 text-sm uppercase tracking-[0.14em]"
              >
                {t.exploreEyebrow} <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href={t.visitHref}
                data-conversion="visit_cta_click"
                data-conversion-label="Packages hero"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#caa24c]/45 px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-[#f7efe3] transition hover:border-[#f1d27a] hover:text-[#f1d27a]"
              >
                {t.visitCta}
              </Link>
            </div>
          </div>
          <div className="order-1 hidden min-w-0 lg:order-2 lg:block [&_.venue-film]:!rounded-2xl">
            <VenueFilm autoPlay />
          </div>
        </div>
      </section>

      <section className="bg-[#080706] py-16 sm:py-24 lg:py-28">
        <div id="explore-packages" className="mx-auto max-w-7xl scroll-mt-28 px-5 sm:px-6 lg:px-8">
          <Reveal className="max-w-3xl">
            <h2 className="font-serif text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">{t.exploreTitle}</h2>
            <p className="mt-5 text-base leading-7 text-[#d7c29a]/72">{t.exploreCopy}</p>
          </Reveal>
          <StaggerCards className="mt-12 grid items-stretch gap-6 lg:grid-cols-3" stagger={0.08}>
            {cards.map((card) => (
              <StaggerCard key={card.id} className="h-full">
                <PackageFlipCard data={card} locale={locale} />
              </StaggerCard>
            ))}
          </StaggerCards>
        </div>
      </section>

      <section id="build-your-experience" className="scroll-mt-28 border-y border-[#caa24c]/16 bg-[#080706] pt-14 pb-8 sm:py-20 lg:py-24">
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
                <article className="flex h-full items-start gap-4 rounded-2xl border border-[#caa24c]/18 bg-black/24 p-5">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#caa24c]" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="font-serif text-2xl leading-none text-[#f7efe3]">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#d7c29a]/68">{copy}</p>
                  </div>
                </article>
              </StaggerCard>
            ))}
          </StaggerCards>
        </div>
      </section>

      <section className="relative isolate overflow-hidden py-16 sm:py-24">
        <LuxorVisitBackdrop />

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <Reveal>
            <div className="luxor-panel relative overflow-hidden grid gap-8 rounded-2xl !border-[#9b6f24]/25 !bg-[#fffdfa]/92 p-6 shadow-[0_28px_78px_-48px_rgba(48,33,14,0.28)] backdrop-blur-md sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-55 blur-2xl" style={{ background: 'radial-gradient(circle, rgba(202, 162, 76, 0.28) 0%, transparent 70%)' }} aria-hidden />
              <div className="relative max-w-3xl">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-[#8d672b]">{t.visitEyebrow}</p>
                <h2 className="mt-4 font-serif text-4xl leading-[0.95] !text-[#241d17] sm:text-5xl">{t.visitTitle}</h2>
                <p className="mt-5 text-base leading-7 !text-[#665a4e]">{t.visitCopy}</p>
              </div>
              <Link
                href={t.visitHref}
                data-conversion="visit_cta_click"
                data-conversion-label="Packages schedule visit"
                className="luxor-gold-raised relative inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-6 py-3 text-sm uppercase tracking-[0.14em]"
              >
                {t.visitCta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

    </main>
  )
}
