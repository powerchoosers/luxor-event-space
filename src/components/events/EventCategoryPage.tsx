'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from '@/lib/icons/phosphor-compat'
import { publicSitePath } from '@/lib/publicSitePaths'
import { motion, useReducedMotion } from 'framer-motion'

export type EventCategoryGalleryItem = {
  src: string
  alt: string
  label?: string
}

export type EventCategoryOtherCollection = {
  title: string
  href: string
}

export type EventCategoryPageProps = {
  slug: string
  spanish?: boolean
  eyebrow: string
  title: string
  subtitle: string
  heroImage: string
  heroImageAlt: string
  introEyebrow: string
  introTitle: string
  introBody: string
  gallery: EventCategoryGalleryItem[]
  closingTitle: string
  closingBody: string
  closingImage: string
  closingImageAlt: string
  otherCollections: EventCategoryOtherCollection[]
}

const SITE_ORIGIN = 'https://www.luxoratlaspalmas.com'

/** Renders category sections in `LUXOR_EVENT_CATEGORY_PAGE_SECTION_ORDER` (+ optional other collections before closing CTA). */
export function EventCategoryPage({
  slug,
  spanish = false,
  eyebrow,
  title,
  subtitle,
  heroImage,
  heroImageAlt,
  introEyebrow,
  introTitle,
  introBody,
  gallery,
  closingTitle,
  closingBody,
  closingImage,
  closingImageAlt,
  otherCollections,
}: EventCategoryPageProps) {
  const reduceMotion = useReducedMotion()
  const packagesHref = publicSitePath('/packages', spanish)
  const eventsHref = publicSitePath('/events', spanish)
  const collectionPath = publicSitePath(`/events/${slug}`, spanish)

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: spanish ? 'Eventos' : 'Events',
        item: `${SITE_ORIGIN}${eventsHref}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: title,
        item: `${SITE_ORIGIN}${collectionPath}`,
      },
    ],
  }

  const galleryOdd = gallery.length % 2 === 1

  return (
    <main lang={spanish ? 'es' : 'en'} className="overflow-x-hidden bg-[#faf7f1] text-[#241d17]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <nav
        aria-label={spanish ? 'Ruta de navegación' : 'Breadcrumb'}
        className="border-b border-[#caa24c]/20 bg-[#faf7f1]"
      >
        <ol className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-5 py-4 text-sm text-[#665a4e] sm:px-6 lg:px-8">
          <li>
            <Link href={eventsHref} className="transition hover:text-[#241d17]">
              {spanish ? 'Eventos' : 'Events'}
            </Link>
          </li>
          <li aria-hidden className="text-[#caa24c]/60">
            /
          </li>
          <li>
            <span className="text-[#241d17]">{title}</span>
          </li>
        </ol>
      </nav>

      <section className="relative isolate min-h-[78svh] overflow-hidden sm:min-h-[82svh]">
        <Image
          src={heroImage}
          alt={heroImageAlt}
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,5,0.35)_0%,rgba(5,5,5,0.55)_55%,rgba(5,5,5,0.72)_100%)]" />

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="relative z-10 mx-auto flex min-h-[78svh] max-w-7xl flex-col justify-end px-5 pb-14 pt-28 sm:min-h-[82svh] sm:px-6 sm:pb-16 lg:px-8 lg:pb-20"
        >
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.28em] text-[#e6c77f]">{eyebrow}</p>
          <h1 className="mt-4 max-w-2xl font-serif text-4xl leading-[0.95] text-[#f7efe3] sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#eadcc8]/90 sm:text-lg">{subtitle}</p>
          <div className="mt-8">
            <Link
              href={packagesHref}
              className="luxor-gold-raised inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm uppercase tracking-[0.14em]"
            >
              {spanish ? 'Explorar paquetes' : 'Explore Packages'} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          className="mx-auto max-w-2xl px-5 text-center sm:px-6 lg:px-8"
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.34em] text-[#8d672b]">{introEyebrow}</p>
          <h2 className="mt-3 font-serif text-3xl leading-tight text-[#241d17] sm:text-4xl">{introTitle}</h2>
          <p className="mt-5 text-base leading-7 text-[#665a4e] sm:text-lg">{introBody}</p>
        </motion.div>
      </section>

      <section className="pb-16 sm:pb-20 lg:pb-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 lg:gap-5">
            {gallery.map((item, index) => {
              const isLastOdd = galleryOdd && index === gallery.length - 1
              return (
                <motion.li
                  key={`${item.src}-${item.label ?? index}`}
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-32px' }}
                  transition={{ duration: 0.45, delay: index * 0.05, ease: [0.23, 1, 0.32, 1] }}
                  className={isLastOdd ? 'col-span-2 lg:col-span-1' : undefined}
                >
                  <article className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-[#caa24c]/25 sm:aspect-[3/4] lg:aspect-[4/5]">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="(min-width: 1024px) 33vw, 50vw"
                      className="object-cover transition duration-500 hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100"
                    />
                    {item.label ? (
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_42%,rgba(5,5,5,0.78)_100%)]" />
                    ) : null}
                    {item.label ? (
                      <p className="absolute bottom-0 left-0 right-0 px-4 pb-4 font-serif text-2xl leading-tight text-[#f7efe3] sm:px-5 sm:pb-5 sm:text-3xl">
                        {item.label}
                      </p>
                    ) : null}
                  </article>
                </motion.li>
              )
            })}
          </ul>
        </div>
      </section>

      {otherCollections.length > 0 ? (
        <section className="border-t border-[#caa24c]/15 py-10 sm:py-12">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-[#665a4e]">
              {spanish ? 'Explorar otras colecciones: ' : 'Explore other collections: '}
              {otherCollections.map((item, index) => (
                <span key={item.href}>
                  {index > 0 ? (spanish ? ' · ' : ' · ') : null}
                  <Link href={item.href} className="font-medium text-[#241d17] underline-offset-4 transition hover:text-[#8d672b] hover:underline">
                    {item.title}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        </section>
      ) : null}

      <section className="relative isolate min-h-[22rem] overflow-hidden sm:min-h-[26rem]">
        <Image src={closingImage} alt={closingImageAlt} fill sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(5,5,5,0.88)_0%,rgba(5,5,5,0.72)_50%,rgba(5,5,5,0.55)_100%)]" />

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-48px' }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="relative z-10 mx-auto flex min-h-[22rem] max-w-7xl flex-col justify-center px-5 py-16 sm:min-h-[26rem] sm:px-6 sm:py-20 lg:px-8"
        >
          <h2 className="max-w-xl font-serif text-3xl leading-tight text-[#f7efe3] sm:text-4xl lg:text-5xl">{closingTitle}</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-[#eadcc8]/88 sm:text-lg">{closingBody}</p>
          <div className="mt-8">
            <Link
              href={packagesHref}
              className="luxor-gold-raised inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm uppercase tracking-[0.14em]"
            >
              {spanish ? 'Explorar paquetes' : 'Explore Packages'} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </section>
    </main>
  )
}