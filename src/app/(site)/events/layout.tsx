import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Weddings, Quinceañeras & Private Events',
  description: 'Explore weddings, quinceañeras, showers, private celebrations, and corporate events at Luxor Event Space in San Antonio.',
}

export default function EventsLayout({ children }: { children: ReactNode }) {
  return children
}
