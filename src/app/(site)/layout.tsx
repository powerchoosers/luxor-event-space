import type { Metadata } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import '../globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { LuxorConciergeChat } from '@/components/LuxorConciergeChat'
import { SiteScrollGuard } from '@/components/SiteScrollGuard'

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
  title: 'Luxor | San Antonio Event Space',
  description: 'A modern San Antonio event space for weddings, quinceañeras, and corporate events.',
  icons: {
    icon: '/luxor-palm-mark.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${cormorant.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-[#050505] text-[#f6efe8]">
        <SiteScrollGuard />
        <Header />
        <main className="flex-grow">
          {children}
        </main>
        <LuxorConciergeChat />
        <Footer />
      </body>
    </html>
  )
}
