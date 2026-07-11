import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Main Hall & Luxor Lounge',
  description: 'See the Luxor main hall and Luxor Lounge, including reception, cocktail, and guest-flow ideas for your San Antonio event.',
}

export default function SpacesLayout({ children }: { children: ReactNode }) {
  return children
}
