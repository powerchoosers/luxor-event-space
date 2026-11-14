'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ChevronDown, Menu, X } from '@/lib/icons/phosphor-compat'
import { LuxorAxisLockup, LuxorWordmark } from '@/components/LuxorWordmark'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { PublicPhoneLink } from '@/components/PublicPhoneLink'
import { LUXOR_EVENT_COLLECTIONS, eventCollectionHref } from '@/lib/luxorEventCollections'
import { publicSiteEventsActive, publicSitePath } from '@/lib/publicSitePaths'

const navLinks = [
  { label: 'Events', labelEs: 'Eventos', href: '/events' },
  { label: 'Packages', labelEs: 'Paquetes', href: '/packages' },
  { label: 'Gallery', labelEs: 'Galería', href: '/gallery' },
  { label: 'Visit', labelEs: 'Visita', href: '/visit' },
  { label: 'Contact', labelEs: 'Contacto', href: '/contact' },
]

export const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [eventsDropdownOpen, setEventsDropdownOpen] = useState(false)
  const [mobileEventsOpen, setMobileEventsOpen] = useState(false)
  const pathname = usePathname()
  const spanish = pathname.startsWith('/es')
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const eventsNavRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const eventsActive = publicSiteEventsActive(pathname)
  const eventsHref = publicSitePath('/events', spanish)

  function handleEventsMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const menu = eventsNavRef.current
    if (!menu) return
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    if (!items.length) return

    const activeIndex = items.findIndex((element) => element === document.activeElement)

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setEventsDropdownOpen(true)
      items[activeIndex < 0 ? 0 : Math.min(activeIndex + 1, items.length - 1)]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setEventsDropdownOpen(true)
      items[activeIndex <= 0 ? 0 : activeIndex - 1]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      setEventsDropdownOpen(true)
      items[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      setEventsDropdownOpen(true)
      items[items.length - 1]?.focus()
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 50
      setIsScrolled(scrolled)
      if (scrolled) {
        document.body.setAttribute('data-header-scrolled', 'true')
      } else {
        document.body.removeAttribute('data-header-scrolled')
      }
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      document.body.removeAttribute('data-header-scrolled')
    }
  }, [])

  useEffect(() => {
    document.documentElement.style.overflow = mobileMenuOpen ? 'hidden' : ''
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
    if (mobileMenuOpen) document.body.dataset.mobileMenuOpen = 'true'
    else delete document.body.dataset.mobileMenuOpen

    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
      delete document.body.dataset.mobileMenuOpen
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    if (!mobileMenuOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (mobileEventsOpen) {
        setMobileEventsOpen(false)
        return
      }
      setMobileMenuOpen(false)
      window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus())
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileMenuOpen, mobileEventsOpen])

  useEffect(() => {
    if (!eventsDropdownOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setEventsDropdownOpen(false)
        const trigger = eventsNavRef.current?.querySelector<HTMLElement>('a, button')
        window.requestAnimationFrame(() => trigger?.focus())
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [eventsDropdownOpen])

  useEffect(() => {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  }, [pathname])

  return (
    <header 
      id="shared-header"
      className={`site-header--light fixed top-0 left-0 right-0 z-[90] border-b transition-all duration-500 ease-in-out
        ${isScrolled 
          ? 'h-[4.5rem] border-[#caa24c]/20 bg-black/[0.82] py-3 shadow-2xl backdrop-blur-xl' 
          : 'h-28 border-[#caa24c]/10 bg-black/20 py-6 backdrop-blur-[2px]'
        }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-8 h-full">
        <Link href={spanish ? '/es' : '/'} className="group transition-transform duration-300 hover:scale-[1.015]">
          <LuxorWordmark compact horizontal subline={false} markClassName="!h-12 !w-12" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-8 lg:flex xl:gap-10">
          {navLinks.map((item) => {
            if (item.label !== 'Events') {
              return (
                <Link
                  key={item.label}
                  href={publicSitePath(item.href, spanish)}
                  className="site-header-link group relative font-serif text-[13px] font-semibold uppercase tracking-[0.22em] text-[#e5d2ac]/82 transition-colors hover:text-[#f1d27a]"
                >
                  {spanish ? item.labelEs : item.label}
                  <motion.span
                    className="absolute -bottom-2 left-0 h-px bg-[#caa24c]"
                    initial={{ width: 0 }}
                    whileHover={{ width: '100%' }}
                    transition={{ duration: 0.3 }}
                  />
                </Link>
              )
            }

            return (
              <div
                key={item.label}
                ref={eventsNavRef}
                className="relative"
                onMouseEnter={() => setEventsDropdownOpen(true)}
                onMouseLeave={() => setEventsDropdownOpen(false)}
                onFocusCapture={() => setEventsDropdownOpen(true)}
                onBlurCapture={(event) => {
                  const next = event.relatedTarget
                  if (next && eventsNavRef.current?.contains(next as Node)) return
                  setEventsDropdownOpen(false)
                }}
                onKeyDown={handleEventsMenuKeyDown}
              >
                <Link
                  href={eventsHref}
                  aria-expanded={eventsDropdownOpen}
                  aria-haspopup="menu"
                  className={`site-header-link group relative font-serif text-[13px] font-semibold uppercase tracking-[0.22em] transition-colors hover:text-[#f1d27a] ${eventsActive || eventsDropdownOpen ? 'text-[#f1d27a]' : 'text-[#e5d2ac]/82'}`}
                >
                  {spanish ? item.labelEs : item.label}
                  <span
                    className={`absolute -bottom-2 left-0 h-px bg-[#caa24c] transition-all duration-300 motion-reduce:transition-none ${eventsActive || eventsDropdownOpen ? 'w-full' : 'w-0 group-hover:w-full'}`}
                  />
                </Link>

                <AnimatePresence>
                  {eventsDropdownOpen ? (
                    <motion.div
                      role="menu"
                      aria-label={spanish ? 'Categorías de eventos' : 'Event categories'}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                      className="absolute left-0 top-[calc(100%+0.55rem)] z-[120] min-w-[15.5rem] max-w-[19rem]"
                    >
                      <div className="overflow-hidden rounded-lg border border-[#caa24c]/28 bg-[#fffdf9] py-1.5 shadow-[0_18px_44px_-28px_rgba(30,22,12,0.38)]">
                        <Link
                          role="menuitem"
                          href={eventsHref}
                          className="block px-4 py-2.5 text-sm text-[#241d17] transition-colors hover:bg-[#f7f0e3]"
                        >
                          {spanish ? 'Todos los eventos →' : 'All events →'}
                        </Link>
                        {LUXOR_EVENT_COLLECTIONS.map((collection) => (
                          <Link
                            key={collection.href}
                            role="menuitem"
                            href={eventCollectionHref(collection, spanish)}
                            className="block px-4 py-2.5 text-sm text-[#4f4338] transition-colors hover:bg-[#f7f0e3] hover:text-[#241d17]"
                          >
                            {spanish ? collection.titleEs : collection.title}
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            )
          })}
        </nav>

        <div className="flex items-center gap-4">

          <PublicPhoneLink
            iconOnly
            label={spanish ? 'Llamar a Luxor' : 'Call Luxor'}
            className="site-header-phone hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 text-[#d7c29a]/85 transition-colors hover:border-[#caa24c]/55 hover:text-[#f1d27a] lg:inline-flex"
          />

          <Link
            href={`${publicSitePath('/visit', spanish)}#visit-booking`}
            data-conversion="visit_cta_click"
            data-conversion-label="Header"
            className="luxor-gold-raised hidden rounded-md px-5 py-2.5 text-[10px] uppercase tracking-[0.22em] sm:inline-flex sm:items-center sm:gap-2"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {spanish ? 'Agendar una visita' : 'Schedule a Visit'}
          </Link>

          {/* Mobile Menu Toggle */}
          <button 
            ref={mobileMenuButtonRef}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="site-header-menu relative z-[120] rounded-xl p-2 text-[#d7c29a]/80 transition-colors hover:text-[#f1d27a] lg:hidden"
            aria-label={mobileMenuOpen ? (spanish ? 'Cerrar menú de navegación' : 'Close navigation menu') : (spanish ? 'Abrir menú de navegación' : 'Open navigation menu')}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            id="mobile-navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.48, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-[100] h-[100dvh] w-screen overflow-hidden bg-[#f7f3ec] lg:hidden"
          >
            <div className="absolute inset-0 luxor-noise opacity-20" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(202,162,76,0.16),transparent_26rem),radial-gradient(circle_at_50%_52%,rgba(202,162,76,0.12),transparent_22rem),linear-gradient(180deg,#fffdf9,#f1e9df_58%)]" />

            {/* Animated Architectural Sunburst & Filigree Background Graphic */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
              {/* Soft breathing ambient gold aura */}
              <motion.div
                initial={{ opacity: 0, scale: 0.82 }}
                animate={{ opacity: [0.35, 0.6, 0.35], scale: [0.94, 1.06, 0.94] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(202,162,76,0.22)_0%,rgba(202,162,76,0.06)_48%,transparent_72%)] blur-2xl"
              />

              {/* Architectural Cathedral Arch Frame */}
              <motion.svg
                viewBox="0 0 400 760"
                fill="none"
                className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md mx-auto text-[#caa24c]"
                preserveAspectRatio="none"
              >
                <motion.path
                  d="M 18 742 L 18 210 A 182 182 0 0 1 382 210 L 382 742 Z"
                  stroke="currentColor"
                  strokeOpacity="0.22"
                  strokeWidth="1"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
                />
                <motion.path
                  d="M 28 732 L 28 214 A 172 172 0 0 1 372 214 L 372 732 Z"
                  stroke="currentColor"
                  strokeOpacity="0.12"
                  strokeWidth="0.75"
                  strokeDasharray="3 5"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.35, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                />
                {/* Top Keystone Diamond */}
                <motion.polygon
                  points="200,20 206,28 200,36 194,28"
                  fill="currentColor"
                  fillOpacity="0.28"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.45, duration: 0.5 }}
                />
                {/* Bottom Keystone Diamond */}
                <motion.polygon
                  points="200,724 205,732 200,740 195,732"
                  fill="currentColor"
                  fillOpacity="0.24"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.55, duration: 0.5 }}
                />
              </motion.svg>

              {/* Outer Slowly Rotating Celestial Ring & Sunburst Rays */}
              <motion.svg
                viewBox="0 0 520 520"
                fill="none"
                className="absolute h-[460px] w-[460px] sm:h-[520px] sm:w-[520px] text-[#b98a3d]"
                initial={{ opacity: 0, scale: 0.86, rotate: -12 }}
                animate={{ opacity: 1, scale: 1, rotate: 348 }}
                transition={{
                  opacity: { duration: 0.7, ease: 'easeOut' },
                  scale: { duration: 0.85, ease: [0.22, 1, 0.36, 1] },
                  rotate: { duration: 64, repeat: Infinity, ease: 'linear' },
                }}
              >
                <circle cx="260" cy="260" r="236" stroke="currentColor" strokeOpacity="0.16" strokeWidth="0.9" />
                <circle cx="260" cy="260" r="224" stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.9" strokeDasharray="2 8" />
                {/* 24 fine radiating Las Palmas sunburst rays */}
                {Array.from({ length: 24 }).map((_, index) => {
                  const angle = (index * 360) / 24
                  const isMajor = index % 2 === 0
                  return (
                    <line
                      key={angle}
                      x1="260"
                      y1={isMajor ? '16' : '32'}
                      x2="260"
                      y2={isMajor ? '64' : '54'}
                      stroke="currentColor"
                      strokeOpacity={isMajor ? '0.24' : '0.13'}
                      strokeWidth={isMajor ? '1.1' : '0.75'}
                      transform={`rotate(${angle} 260 260)`}
                    />
                  )
                })}
                {/* Cardinal Diamond Accents on Ring */}
                {[0, 90, 180, 270].map((angle) => (
                  <polygon
                    key={angle}
                    points="260,18 264,24 260,30 256,24"
                    fill="currentColor"
                    fillOpacity="0.34"
                    transform={`rotate(${angle} 260 260)`}
                  />
                ))}
              </motion.svg>

              {/* Inner Counter-Rotating Geometric Filigree */}
              <motion.svg
                viewBox="0 0 380 380"
                fill="none"
                className="absolute h-[320px] w-[320px] sm:h-[360px] sm:w-[360px] text-[#caa24c]"
                initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
                animate={{ opacity: 1, scale: 1, rotate: -360 }}
                transition={{
                  opacity: { duration: 0.8, delay: 0.12 },
                  scale: { duration: 0.85, delay: 0.12, ease: [0.22, 1, 0.36, 1] },
                  rotate: { duration: 48, repeat: Infinity, ease: 'linear' },
                }}
              >
                <circle cx="190" cy="190" r="168" stroke="currentColor" strokeOpacity="0.16" strokeWidth="0.85" />
                <rect
                  x="71"
                  y="71"
                  width="238"
                  height="238"
                  stroke="currentColor"
                  strokeOpacity="0.11"
                  strokeWidth="0.75"
                />
                <rect
                  x="71"
                  y="71"
                  width="238"
                  height="238"
                  stroke="currentColor"
                  strokeOpacity="0.11"
                  strokeWidth="0.75"
                  transform="rotate(45 190 190)"
                />
                <circle cx="190" cy="190" r="118" stroke="currentColor" strokeOpacity="0.14" strokeWidth="0.75" strokeDasharray="4 6" />
              </motion.svg>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.52, ease: [0.23, 1, 0.32, 1] }}
              className="relative flex h-full flex-col justify-between px-6 pb-10 pt-28 sm:px-10"
            >
              <div className="mx-auto w-full max-w-md">
                <LuxorAxisLockup
                  className="mb-10 w-full max-w-[220px]"
                  showDivider={false}
                />
                <nav className="flex flex-col gap-1" aria-label={spanish ? 'Menú principal' : 'Main menu'}>
                  {navLinks.map((item, idx) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.32, delay: idx * 0.04, ease: [0.23, 1, 0.32, 1] }}
                      className="border-b border-[#caa24c]/14 py-3"
                    >
                      {item.label === 'Events' ? (
                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <Link
                              href={eventsHref}
                              onClick={() => setMobileMenuOpen(false)}
                              className="font-serif text-2xl tracking-[0.08em] text-[#241d17] transition-colors hover:text-[#8d672b] sm:text-[1.65rem]"
                            >
                              {spanish ? item.labelEs : item.label}
                            </Link>
                            <button
                              type="button"
                              aria-expanded={mobileEventsOpen}
                              aria-controls="mobile-events-collections"
                              aria-label={
                                spanish
                                  ? mobileEventsOpen
                                    ? 'Cerrar colecciones de eventos'
                                    : 'Mostrar colecciones de eventos'
                                  : mobileEventsOpen
                                    ? 'Collapse event collections'
                                    : 'Expand event collections'
                              }
                              onClick={() => setMobileEventsOpen((open) => !open)}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#8d672b] transition-colors hover:bg-[#caa24c]/10"
                            >
                              <ChevronDown
                                size={20}
                                aria-hidden
                                className={`transition-transform duration-[420ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${mobileEventsOpen ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>
                          <div
                            id="mobile-events-collections"
                            className="grid transition-[grid-template-rows] duration-[420ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
                            style={{ gridTemplateRows: mobileEventsOpen ? '1fr' : '0fr' }}
                            inert={!mobileEventsOpen}
                            aria-hidden={!mobileEventsOpen}
                          >
                            <div className="overflow-hidden">
                              <ul className="mt-2 space-y-0.5 pl-1 pt-2">
                                {LUXOR_EVENT_COLLECTIONS.map((collection) => (
                                  <li key={collection.href}>
                                    <Link
                                      href={eventCollectionHref(collection, spanish)}
                                      onClick={() => setMobileMenuOpen(false)}
                                      className="block py-2.5 pl-3 text-base text-[#4f4338] transition-colors hover:text-[#8d672b]"
                                    >
                                      {spanish ? collection.titleEs : collection.title}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={publicSitePath(item.href, spanish)}
                          onClick={() => setMobileMenuOpen(false)}
                          className="block font-serif text-2xl tracking-[0.08em] text-[#241d17] transition-colors hover:text-[#8d672b] sm:text-[1.65rem]"
                        >
                          {spanish ? item.labelEs : item.label}
                        </Link>
                      )}
                    </motion.div>
                  ))}
                </nav>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mx-auto w-full max-w-md space-y-3"
              >
                <Link
                  href={`${publicSitePath('/visit', spanish)}#visit-booking`}
                  data-conversion="visit_cta_click"
                  data-conversion-label="Mobile menu"
                  onClick={() => setMobileMenuOpen(false)}
                  className="luxor-gold-raised flex min-h-12 items-center justify-center gap-2 rounded-md px-6 py-3 text-sm uppercase tracking-[0.16em]"
                >
                  <CalendarDays size={18} />
                  {spanish ? 'Agendar una visita' : 'Schedule a Visit'}
                </Link>
                <PublicPhoneLink className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#caa24c]/40 px-6 py-3 text-sm font-semibold tracking-[0.12em] text-[#241d17] transition-colors hover:border-[#8d672b] hover:text-[#8d672b]" />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}


