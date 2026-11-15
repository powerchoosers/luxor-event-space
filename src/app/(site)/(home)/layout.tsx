import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/',
      'es-US': '/es',
      'x-default': '/',
    },
  },
}

export default function HomeLayout({ children }: { children: ReactNode }) {
  return children
}