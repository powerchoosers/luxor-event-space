import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
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
  title: 'Luxor | Owner Portal Login',
  description: 'Secure Zoho login for the Luxor owner portal.',
  manifest: '/luxor-portal.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Luxor Portal',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: [{ url: '/apple-icon.png', sizes: '1024x1024', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050505',
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#050505] text-[#f6efe8]">{children}</body>
    </html>
  )
}
