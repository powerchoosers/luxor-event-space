import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Request a Private Venue Tour',
  description: 'Request a private walkthrough of Luxor Event Space at 803 Castroville Road in San Antonio.',
}

export default function VisitLayout({ children }: { children: ReactNode }) {
  return children
}
