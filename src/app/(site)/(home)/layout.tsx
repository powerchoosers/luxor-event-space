import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'

export const metadata: Metadata = {
  alternates: buildLuxorBilingualAlternates('/', '/', '/es'),
}

export default function HomeLayout({ children }: { children: ReactNode }) {
  return children
}