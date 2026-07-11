import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Venue Gallery',
  description: 'Browse main-hall and Luxor Lounge layouts for weddings, quinceañeras, private celebrations, and corporate gatherings.',
}

export default function GalleryLayout({ children }: { children: ReactNode }) {
  return children
}
