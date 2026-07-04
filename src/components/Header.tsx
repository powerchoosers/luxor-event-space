'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Menu, X } from 'lucide-react'
import { LuxorAxisLockup, LuxorWordmark } from '@/components/LuxorWordmark'
import { motion, AnimatePresence } from 'framer-motion'

const navLinks = [
  { label: 'Events', href: '/events' },
  { label: 'Spaces', href: '/spaces' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Visit', href: '/visit' },
]

export const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    document.documentElement.style.overflow = mobileMenuOpen ? 'hidden' : ''
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''

    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  useEffect(() => {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  }, [pathname])

  return (
    <header 
      id="shared-header"
      className={`fixed top-0 left-0 right-0 z-[90] border-b transition-all duration-500 ease-in-out
        ${isScrolled 
          ? 'h-[4.5rem] border-[#caa24c]/20 bg-black/[0.82] py-3 shadow-2xl backdrop-blur-xl' 
          : 'h-28 border-[#caa24c]/10 bg-black/20 py-6 backdrop-blur-[2px]'
        }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-8 h-full">
        <Link href="/" className="group transition-transform duration-300 hover:scale-[1.015]">
          <LuxorWordmark compact horizontal subline={false} />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-8 lg:flex xl:gap-10">
          {navLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="group relative text-[10px] font-mono uppercase tracking-[0.34em] text-[#d7c29a]/75 transition-colors hover:text-[#f1d27a]"
            >
              {item.label}
              <motion.span 
                className="absolute -bottom-2 left-0 h-px bg-[#caa24c]" 
                initial={{ width: 0 }}
                whileHover={{ width: '100%' }}
                transition={{ duration: 0.3 }}
              />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">

          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              href="/visit"
              className="hidden rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#050505] shadow-[0_18px_36px_-24px_rgba(202,162,76,0.8)] transition-all duration-300 hover:bg-[#dfbd68] sm:inline-flex sm:items-center sm:gap-2"
            >
              <CalendarDays className="h-3.5 w-3.5 text-[#caa24c]" />
              Request Tour
            </Link>
          </motion.div>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="relative z-[120] p-2 text-[#d7c29a]/80 transition-colors hover:text-[#f1d27a] lg:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
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
            className="fixed inset-0 z-[100] h-[100dvh] w-screen bg-[#050505] lg:hidden"
          >
            <div className="absolute inset-0 luxor-noise opacity-20" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(202,162,76,0.16),transparent_24rem),linear-gradient(180deg,#120d0c,#050505_58%)]" />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.52, ease: [0.23, 1, 0.32, 1] }}
              className="relative flex h-full translate-y-2 flex-col items-center justify-center gap-6 px-6 text-center"
            >
              <LuxorAxisLockup
                className="w-full max-w-[250px] sm:max-w-[280px]"
                showDivider={false}
              />
              {navLinks.map((item, idx) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.32, delay: idx * 0.045, ease: [0.23, 1, 0.32, 1] }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block font-serif text-4xl leading-none tracking-[0.16em] text-[#f8f3ed] transition-colors hover:text-[#caa24c]"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
              >
                <Link
                  href="/visit"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-3 flex items-center justify-center gap-2 rounded-md border border-[#caa24c]/60 bg-[#caa24c] px-8 py-4 text-sm font-bold uppercase tracking-[0.18em] text-black shadow-xl"
                >
                  <CalendarDays size={18} />
                  Schedule a Tour
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}







