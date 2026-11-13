import type { ReactNode } from 'react'
import { Manrope } from 'next/font/google'
import '../globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  display: 'swap',
})

export default function PreferredVendorsQaLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} h-full scroll-smooth antialiased`}>
      <body
        className="h-[100dvh] min-h-full overflow-hidden bg-[color:var(--portal-bg)] font-sans text-[color:var(--portal-text)] antialiased selection:bg-[#caa24c]/30"
        data-portal-theme="light"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}
