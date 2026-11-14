import type { Metadata } from 'next'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getWeddingsRomanceCategoryContent } from '@/content/events/weddings-romance'

export const metadata: Metadata = {
  title: 'Salón de bodas y eventos en San Antonio | Luxor',
  description:
    'Celebra bodas, compromisos, bridal showers y aniversarios en Luxor at Las Palmas, un venue versátil en San Antonio, Texas.',
  alternates: {
    canonical: '/es/events/weddings-romance',
    languages: { en: '/events/weddings-romance', es: '/es/events/weddings-romance' },
  },
}

export default function SpanishWeddingsRomanceCategoryPage() {
  return <EventCategoryPage {...getWeddingsRomanceCategoryContent('es')} />
}