import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import '../globals.css'
import { PortalLoginHandoffProvider } from '@/components/portal/PortalLoginHandoff'

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
  description: 'Secure owner login for the Luxor owner portal.',
  manifest: '/luxor-portal.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Luxor Portal',
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

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const savedTheme = (await cookies()).get('luxor-portal-theme')?.value
  const theme = savedTheme === 'dark' ? 'dark' : 'light'
  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable} h-full antialiased`}>
      <body data-portal-theme={theme} suppressHydrationWarning className="min-h-full font-sans bg-[color:var(--portal-bg)] text-[color:var(--portal-text)]"><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('luxor-portal-theme');if(t=== 'light' || t=== 'dark')document.body.dataset.portalTheme=t}catch(e){}" }} /><PortalLoginHandoffProvider>{children}</PortalLoginHandoffProvider></body>
    </html>
  )
}



