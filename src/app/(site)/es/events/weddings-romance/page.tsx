import type { Metadata } from 'next'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getWeddingsRomanceCategoryContent } from '@/content/events/weddings-romance'

export const metadata: Metadata = {
  title: 'Salón de bodas y eventos en San Antonio | Luxor',
  description:
    'Celebra bodas, compromisos, bridal showers y aniversarios en Luxor at Las Palmas, un venue versátil en San Antonio, Texas.',
  alternates: buildLuxorBilingualAlternates('/es/events/weddings-romance', '/events/weddings-romance', '/es/events/weddings-romance'),
}

export default function SpanishWeddingsRomanceCategoryPage() {
  return <EventCategoryPage {...getWeddingsRomanceCategoryContent('es')} />
}