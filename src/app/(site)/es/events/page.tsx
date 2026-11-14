import type { Metadata } from 'next'
import EventsPage from '../../events/page'

export const metadata: Metadata = {
  title: 'Eventos | Luxor at Las Palmas Events',
  description:
    'Celebra bodas, quinceañeras, baby showers, eventos corporativos y reuniones especiales en Luxor at Las Palmas en San Antonio.',
  alternates: { canonical: '/es/events', languages: { en: '/events', es: '/es/events' } },
}

export default EventsPage