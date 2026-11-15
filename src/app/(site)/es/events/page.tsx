import type { Metadata } from 'next'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'
import EventsPage from '../../events/page'

export const metadata: Metadata = {
  title: 'Eventos',
  description:
    'Celebra bodas, quinceañeras, baby showers, eventos corporativos y reuniones especiales en Luxor at Las Palmas en San Antonio.',
  alternates: buildLuxorBilingualAlternates('/es/events', '/events', '/es/events'),
}

export default EventsPage