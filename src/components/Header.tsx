'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Menu, X } from 'lucide-react'
import { LuxorWordmark } from '@/components/LuxorWordmark'
import { motion, AnimatePresence } from 'framer-motion'

const navLinks = [
  { label: 'Events', href: '/#events' },
  { label: 'Spaces', href: '/#spaces' },
  { label: 'Gallery', href: '/#gallery' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Visit', href: '/#visit' },
]

export const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header 
      id="shared-header"
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-all duration-500 ease-in-out
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
              href="/#visit"
              className="hidden rounded-md border border-[#f1d27a]/45 bg-[#caa24c] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#050505] shadow-[0_18px_36px_-24px_rgba(202,162,76,0.8)] transition-all duration-300 hover:bg-[#dfbd68] sm:inline-flex sm:items-center sm:gap-2"
            >
              <CalendarDays className="h-3.5 w-3.5 text-[#caa24c]" />
              Request Tour
            </Link>
          </motion.div>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#d7c29a]/80 transition-colors hover:text-[#f1d27a] lg:hidden"
            aria-label="Open navigation menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-40 bg-black/95 backdrop-blur-2xl lg:hidden"
          >
            <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
              <LuxorWordmark compact horizontal align="center" subline={false} />
              {navLinks.map((item, idx) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="font-serif text-2xl tracking-[0.22em] text-[#f8f3ed] transition-colors hover:text-[#caa24c]"
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
                  href="/#visit"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-4 flex items-center gap-2 rounded-md border border-[#caa24c]/60 bg-[#caa24c] px-8 py-4 text-sm font-bold uppercase tracking-[0.18em] text-black shadow-xl"
                >
                  <CalendarDays size={18} />
                  Schedule a Tour
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}







