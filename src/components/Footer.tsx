'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { CalendarDays, Mail, MapPin } from 'lucide-react'
import { LuxorAxisLockup } from '@/components/LuxorWordmark'
import { PublicPhoneLink } from '@/components/PublicPhoneLink'

const navLinks = [
  { label: 'Grand Opening', href: '/grand-opening-rsvp' },
  { label: 'Events', href: '/events' },
  { label: 'Spaces', href: '/spaces' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Visit', href: '/visit' },
]

const socialLinks = [
  { label: 'Instagram', href: 'https://www.instagram.com/luxoratlaspalmas?utm_source=qr', icon: '/social-instagram.png' },
  { label: 'Facebook', href: 'https://www.facebook.com/share/1DD3mKM8XJ/?mibextid=wwXIfr', icon: '/social-facebook.png' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@luxoratlaspalmas?_r=1&_t=ZT-97vnzmYjFUM', icon: '/social-tiktok.png' },
] as const

export const Footer = () => {
  return (
    <footer id="shared-footer" className="relative isolate overflow-hidden bg-[#050505] pt-24 pb-12 text-[#f8f3ed] sm:pt-32 sm:pb-16">
      <div className="absolute inset-0 luxor-noise opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(202,162,76,0.16),transparent_28rem),linear-gradient(180deg,rgba(5,5,5,0.1),rgba(5,5,5,0.96))]" />
      
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <Link href="/" className="mx-auto block w-full max-w-[460px]">
          <LuxorAxisLockup dividerClassName="text-[#8e6829]" />
        </Link>

        <div className="mt-14 grid grid-cols-1 gap-12 text-center lg:grid-cols-12 lg:text-left">
          {/* Quick Links */}
          <div className="lg:col-span-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.45em] text-[#caa24c]">Navigation</h3>
            <ul className="mt-6 space-y-4">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-[#d7c29a]/62 transition-colors hover:text-[#f8f3ed]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Brand Info */}
          <div className="lg:col-span-5">
            <p className="mx-auto max-w-sm text-base leading-7 text-[#d7c29a]/68 lg:mx-0">
              A modern San Antonio event space built for the celebrations families remember.
              Host your wedding, quinceañera, or baby shower in elegance.
            </p>
            <div className="mt-8 space-y-3 text-sm text-[#d7c29a]/62">
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=803+Castroville+Rd+%23402%2C+San+Antonio%2C+TX+78237"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-3 transition-colors hover:text-[#f8f3ed] lg:justify-start"
              >
                <MapPin className="h-4 w-4 shrink-0 text-[#caa24c]" />
                <span>803 Castroville Rd #402, San Antonio, TX 78237</span>
              </a>
              <a
                href="mailto:booking@luxoratlaspalmas.com"
                className="flex items-center justify-center gap-3 transition-colors hover:text-[#f8f3ed] lg:justify-start"
              >
                <Mail className="h-4 w-4 shrink-0 text-[#caa24c]" />
                <span>booking@luxoratlaspalmas.com</span>
              </a>
              <PublicPhoneLink className="flex items-center justify-center gap-3 transition-colors hover:text-[#f8f3ed] lg:justify-start" />
              <p>Private venue tours by appointment.</p>
            </div>
          </div>

          {/* Contact / Action */}
          <div className="lg:col-span-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.45em] text-[#caa24c]">Get in Touch</h3>
            <div className="mt-6 flex flex-col gap-4">
              <Link 
                href="/visit"
                className="mt-4 inline-flex items-center justify-center gap-2.5 rounded-md border border-[#f1d27a]/40 bg-[#caa24c] px-6 py-4 text-sm font-bold uppercase tracking-[0.16em] text-[#050505] shadow-2xl transition-all duration-300 hover:scale-[1.03] hover:shadow-[#caa24c]/30 active:scale-95"
              >
                <CalendarDays className="h-4 w-4" />
                Book Your Tour
              </Link>
              <div className="flex items-center justify-center gap-3 lg:justify-start" aria-label="Luxor social media">
                {socialLinks.map((social) => (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Follow Luxor on ${social.label}`}
                    className="flex h-11 w-11 items-center justify-center rounded-md border border-[#caa24c]/24 bg-black/30 transition hover:border-[#f1d27a]/55 hover:bg-[#caa24c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1d27a]"
                  >
                    <Image src={social.icon} alt="" width={20} height={20} />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 luxor-deco-divider text-[#8e6829]">
          <span className="luxor-diamond" />
        </div>

        <div className="mt-8 overflow-hidden">
          <p className="hidden text-center font-mono text-[10px] uppercase tracking-[0.55em] text-[#caa24c]/85 sm:block">
            Timeless <span className="mx-4 text-[#caa24c]">◆</span> Elegant <span className="mx-4 text-[#caa24c]">◆</span> Celebratory <span className="mx-4 text-[#caa24c]">◆</span> Luxurious
          </p>
          <div className="luxor-footer-marquee sm:hidden" aria-label="Timeless, elegant, celebratory, luxurious">
            <div className="luxor-footer-marquee-track">
              {[0, 1].map((item) => (
                <span key={item} className="luxor-footer-marquee-line">
                  Timeless <span>◆</span> Elegant <span>◆</span> Celebratory <span>◆</span> Luxurious <span>◆</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-6 border-t border-[#caa24c]/18 pt-8 sm:flex-row">
          <p className="text-xs text-[#d7c29a]/60">
            &copy; {new Date().getFullYear()} Luxor Event Space. Built with Elegance in San Antonio.
          </p>
          <div className="flex gap-8 text-[10px] font-mono uppercase tracking-[0.2em] text-[#d7c29a]/60 transition-colors hover:text-[#f7efe3]">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

