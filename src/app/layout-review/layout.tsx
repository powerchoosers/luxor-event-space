import type { Metadata } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import Image from 'next/image'
import type { ReactNode } from 'react'
import '../globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Review your event layout | Luxor Event Space',
  description: 'Privately review your saved Luxor Event Space layout.',
  robots: { index: false, follow: false },
}

export default function LayoutReviewLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} min-h-full bg-[#171410] antialiased`}>
      <body className="min-h-full bg-[#171410] font-sans text-[#f7f1e8] selection:bg-[#caa24c]/35 selection:text-white">
        <header className="border-b border-white/10 bg-[#171410]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#caa24c]/65 bg-[#0e0c0a] p-0.5">
                <Image src="/luxor-portal-mark-gold-tight.png" alt="Luxor Event Space" fill sizes="36px" className="object-contain p-0.5" priority />
              </div>
              <div>
                <p className="font-serif text-[15px] font-semibold tracking-[0.08em] text-[#ead5ad]">Luxor Event Space</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#968b7d]">Private layout review</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 text-[10px] font-semibold tracking-wide text-[#bdb2a4] sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Secure review link
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="border-t border-white/8 px-4 py-4 text-center text-[10px] font-medium text-[#82776b] sm:px-6">
          This private link is intended only for its recipient.
        </footer>
      </body>
    </html>
  )
}
