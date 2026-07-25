import type { Metadata } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import '../../app/globals.css'
import Image from 'next/image'

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
  title: 'Secure Signature Room | Luxor Event Space',
  description: 'Review and sign your digital event agreement securely.',
  robots: { index: false, follow: false },
}

export default function SecurePortalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#050505] text-[#f6efe8] font-sans selection:bg-[#caa24c]/30 selection:text-white">
        {/* Minimal Clean Room Header - No Website Nav or Public Footer */}
        <header className="sticky top-0 z-50 border-b border-[#caa24c]/15 bg-[#080605]/95 backdrop-blur-xl px-6 py-3.5 shadow-2xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 rounded-full border border-[#caa24c] bg-[#080605] p-0.5 overflow-hidden shrink-0">
                <Image
                  src="/luxor-portal-mark-gold-tight.png"
                  alt="Luxor Crest"
                  fill
                  className="object-contain p-0.5"
                />
              </div>
              <div>
                <span className="block font-serif text-sm font-semibold uppercase tracking-[0.2em] text-[#caa24c]">
                  Luxor Event Space
                </span>
                <span className="block text-[8.5px] font-black uppercase tracking-[0.25em] text-zinc-500">
                  Digital Document Verification Room
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              256-Bit SSL Encrypted
            </div>
          </div>
        </header>

        {/* Main Clean Room Content Area */}
        <main className="py-8 sm:py-12 px-4 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  )
}
