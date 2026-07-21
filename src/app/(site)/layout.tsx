import type { Metadata } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import '../globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { LuxorConciergeChat } from '@/components/LuxorConciergeChat'
import { SiteScrollGuard } from '@/components/SiteScrollGuard'
import { RouteTransition } from '@/components/RouteTransition'

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

const venueStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'EventVenue',
  name: 'Luxor Event Space',
  url: 'https://luxoratlaspalmas.com',
  email: 'booking@luxoratlaspalmas.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '803 Castroville Rd #402',
    addressLocality: 'San Antonio',
    addressRegion: 'TX',
    postalCode: '78237',
    addressCountry: 'US',
  },
  sameAs: [
    'https://www.instagram.com/luxoratlaspalmas?utm_source=qr',
    'https://www.facebook.com/share/1DD3mKM8XJ/?mibextid=wwXIfr',
    'https://www.tiktok.com/@luxoratlaspalmas?_r=1&_t=ZT-97vnzmYjFUM',
  ],
}


export const metadata: Metadata = {
  metadataBase: new URL('https://luxoratlaspalmas.com'),
  title: {
    default: 'Luxor Event Space | San Antonio Weddings & Celebrations',
    template: '%s | Luxor Event Space',
  },
  description: 'A modern San Antonio event space for weddings, quinceañeras, and corporate events.',
  keywords: ['San Antonio event venue', 'San Antonio wedding venue', 'Quinceañera venue', 'private event space', 'corporate event venue'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Luxor Event Space',
    title: 'Luxor Event Space | San Antonio Weddings & Celebrations',
    description: 'A modern San Antonio event space for weddings, quinceañeras, private celebrations, and corporate events.',
    images: [{ url: '/images/dining-hall/main-hall-wedding-wide.png', alt: 'Luxor main hall prepared for a reception' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Luxor Event Space | San Antonio',
    description: 'Weddings, quinceañeras, private celebrations, and corporate events in San Antonio.',
    images: ['/images/dining-hall/main-hall-wedding-wide.png'],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(venueStructuredData) }}
        />
        <SiteScrollGuard />
        <Header />
        <main className="flex-grow">
          <RouteTransition surface="site">{children}</RouteTransition>
        </main>
        <LuxorConciergeChat />
        <Footer />
      </body>
    </html>
  )
}
