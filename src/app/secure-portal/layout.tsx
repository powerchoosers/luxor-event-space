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
  title: 'Review your agreement | Luxor Event Space',
  description: 'Review and sign your Luxor Event Space agreement.',
  robots: { index: false, follow: false },
}

export default function SecurePortalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#171410] text-[#f7f1e8] font-sans selection:bg-[#b88a44]/35 selection:text-white">
        <header className="sticky top-0 z-50 border-b border-white/8 bg-[#171410]/96 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#b88a44]/70 bg-[#0e0c0a] p-0.5">
                <Image
                  src="/luxor-portal-mark-gold-tight.png"
                  alt="Luxor Event Space"
                  fill
                  className="object-contain p-0.5"
                />
              </div>
              <div>
                <span className="block font-serif text-[15px] font-semibold tracking-[0.08em] text-[#ead5ad]">
                  Luxor Event Space
                </span>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#92887c]">
                  Event agreement
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-wide text-[#aaa096]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Secure signing
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
