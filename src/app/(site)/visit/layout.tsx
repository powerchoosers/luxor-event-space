import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Schedule a Tour',
  description: 'Schedule a private walkthrough of Luxor at Las Palmas Events in San Antonio.',
}

export default function VisitLayout({ children }: { children: ReactNode }) {
  return children
}
