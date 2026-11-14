'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ChevronDown, Menu, X } from '@/lib/icons/phosphor-compat'
import { LuxorAxisLockup, LuxorWordmark } from '@/components/LuxorWordmark'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { PublicPhoneLink } from '@/components/PublicPhoneLink'
import { LUXOR_EVENT_COLLECTIONS, eventCollectionHref } from '@/lib/luxorEventCollections'
import { getPublicFooterNavLinks, getPublicNavEventsLink, getPublicNavLinks } from '@/lib/luxorPublicNavLinks'
import { publicSiteEventsActive, publicSitePath } from '@/lib/publicSitePaths'

export const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [eventsDropdownOpen, setEventsDropdownOpen] = useState(false)
  const [mobileEventsOpen, setMobileEventsOpen] = useState(false)
  const pathname = usePathname()
  const spanish = pathname.startsWith('/es')
  const eventsNavLink = getPublicNavEventsLink(spanish)
  const secondaryNavLinks = getPublicNavLinks(spanish)
  const mobileNavLinks = getPublicFooterNavLinks(spanish)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const eventsNavRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()
  const eventsActive = publicSiteEventsActive(pathname)
  const eventsHref = publicSitePath('/events', spanish)

  function isNavCurrent(href: string, key: string): boolean {
    if (key === 'Events') return eventsActive
    const current = pathname.replace(/\/$/, '') || '/'
    const target = href.replace(/\/$/, '') || '/'
    if (current === target) return true
    if (target !== '/' && current.startsWith(`${target}/`)) return true
    return false
  }

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
          <div
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
                  aria-current={eventsActive ? 'page' : undefined}
                  className={`site-header-link aria-[current=page]:after:scale-x-100 group relative font-serif text-[13px] font-semibold uppercase tracking-[0.22em] transition-colors hover:text-[#f1d27a] ${eventsActive || eventsDropdownOpen ? 'text-[#f1d27a]' : 'text-[#e5d2ac]/82'}`}
                >
                  {eventsNavLink.label}
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
          {secondaryNavLinks.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={isNavCurrent(item.href, item.key) ? 'page' : undefined}
              className="site-header-link aria-[current=page]:after:scale-x-100 group relative font-serif text-[13px] font-semibold uppercase tracking-[0.22em] text-[#e5d2ac]/82 transition-colors hover:text-[#f1d27a]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">

          <PublicPhoneLink
            iconOnly
            label={spanish ? 'Llamar a Luxor' : 'Call Luxor'}
            className="site-header-phone hidden min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 text-[#d7c29a]/85 transition-colors hover:border-[#caa24c]/55 hover:text-[#f1d27a] lg:inline-flex"
          />

          <Link
            href={`${publicSitePath('/visit', spanish)}#visit-booking`}
            data-conversion="visit_cta_click"
            data-conversion-label="Header"
            className="luxor-gold-raised hidden min-h-11 items-center rounded-md px-5 py-2.5 text-[10px] uppercase tracking-[0.22em] sm:inline-flex sm:gap-2"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {spanish ? 'Agendar una visita' : 'Schedule a Visit'}
          </Link>

          {/* Mobile Menu Toggle */}
          <button 
            ref={mobileMenuButtonRef}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="site-header-menu relative z-[120] flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[#d7c29a]/80 transition-colors hover:text-[#f1d27a] lg:hidden"
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
            className="fixed inset-0 z-[100] h-[100dvh] w-screen overflow-hidden bg-[#faf7f1] lg:hidden"
          >
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
                  {mobileNavLinks.map((item, idx) => (
                    <motion.div
                      key={item.key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.32, delay: idx * 0.04, ease: [0.23, 1, 0.32, 1] }}
                      className="border-b border-[#caa24c]/14 py-3"
                    >
                      {item.key === 'Events' ? (
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              href={eventsHref}
                              onClick={() => setMobileMenuOpen(false)}
                              className="flex min-h-11 flex-1 items-center font-serif text-2xl tracking-[0.08em] text-[#241d17] transition-colors hover:text-[#8d672b] sm:text-[1.65rem]"
                            >
                              {item.label}
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
                              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[#8d672b] transition-colors hover:bg-[#caa24c]/10"
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
                                      className="flex min-h-11 items-center py-1 pl-3 text-base text-[#4f4338] transition-colors hover:text-[#8d672b]"
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
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex min-h-11 items-center font-serif text-2xl tracking-[0.08em] text-[#241d17] transition-colors hover:text-[#8d672b] sm:text-[1.65rem]"
                        >
                          {item.label}
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


