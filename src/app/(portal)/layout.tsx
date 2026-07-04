import type { Metadata } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import React from "react";
import { PortalShell } from "@/components/portal/PortalShell";
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
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${cormorant.variable} h-full scroll-smooth antialiased`}
    >
      <PortalShell>{children}</PortalShell>
    </html>
  );
}
