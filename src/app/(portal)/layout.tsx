import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import React from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { redirect } from 'next/navigation'
import { getLuxorUserProfile } from '@/lib/luxorUserProfileServer'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import { cookies } from 'next/headers'
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
  title: 'Luxor | Owner Portal',
  description: 'Luxor event space owner command center.',
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

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedPortalLayout>{children}</ProtectedPortalLayout>
}

async function ProtectedPortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getLuxorPortalSession()

  if (!session) {
    redirect('/portal/login')
  }

  const member = await getLuxorPortalMember(session.email)
  if (!member || member.status === 'suspended') redirect('/portal/login?error=unauthorized')

  const userProfile = await getLuxorUserProfile(session.email)
  const themeCookie = (await cookies()).get('luxor-portal-theme')?.value
  const initialTheme = themeCookie === 'dark' || themeCookie === 'light' ? themeCookie : 'light'

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${cormorant.variable} h-full scroll-smooth antialiased`}
    >
      <PortalShell session={session} initialProfile={userProfile} initialTheme={initialTheme} permissions={member.permissions} role={member.role}>{children}</PortalShell>
    </html>
  );
}
