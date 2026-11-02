import type { Metadata } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import '../globals.css'

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], display: 'swap' })
const cormorant = Cormorant_Garamond({ variable: '--font-cormorant', subsets: ['latin'], weight: ['400','500','600','700'], display: 'swap' })

export const metadata: Metadata = {
  title: 'Private event design | Luxor Event Space',
  description: 'A private, email-verified Luxor event design presentation.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function PlannerReviewLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${manrope.variable} ${cormorant.variable} min-h-full bg-[#171410] antialiased`}><body className="min-h-full bg-[#171410] font-sans text-[#f7f1e8] selection:bg-[#caa24c]/35 selection:text-white">{children}</body></html>
}
