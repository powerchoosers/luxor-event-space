import { eventCollectionHref, LUXOR_EVENT_COLLECTIONS } from '@/lib/luxorEventCollections'
import type { EventCategoryPageProps } from '@/components/events/EventCategoryPage'

type Locale = 'en' | 'es'

const SLUG = 'social-professional-events'

function otherCollections(locale: Locale): EventCategoryPageProps['otherCollections'] {
  const spanish = locale === 'es'
  return LUXOR_EVENT_COLLECTIONS.filter((c) => !c.href.endsWith(SLUG)).map((c) => ({
    title: spanish ? c.titleEs : c.title,
    href: eventCollectionHref(c, spanish),
  }))
}

const en: Omit<EventCategoryPageProps, 'spanish'> = {
  slug: SLUG,
  eyebrow: 'Event collection',
  title: 'Social & Professional Events',
  subtitle:
    'A sophisticated space for corporate gatherings, holiday events, private celebrations, and community functions.',
  heroImage: '/images/luxor-lounge/luxor-lounge-corporate.png',
  heroImageAlt: 'Corporate dinner with chandeliers and banquet tables at Luxor',
  introEyebrow: 'Gatherings at Luxor',
  introTitle: 'Bring People Together.',
  introBody:
    'From professional networking to meaningful community gatherings, Luxor provides a versatile setting for events that bring people together.',
  gallery: [
    {
      src: '/images/luxor-lounge/luxor-lounge-corporate.png',
      alt: 'Corporate event with banquet seating and chandeliers at Luxor',
      label: 'Corporate Events',
    },
    {
      src: '/images/dining-hall/main-hall-reception-professional.png',
      alt: 'Main hall set for a professional conference or presentation',
      label: 'Conferences',
    },
    {
      src: '/images/dining-hall/main-hall-corporate-cocktail.png',
      alt: 'Cocktail-style networking setup in the Luxor ballroom',
      label: 'Networking Events',
    },
    {
      src: '/images/dining-hall/main-hall-wedding-wide.png',
      alt: 'Grand ballroom prepared for a formal gala dinner',
      label: 'Galas',
    },
    {
      src: '/images/dining-hall/main-hall-table-toast-candid.png',
      alt: 'Guests toasting at a fundraiser dinner at Luxor',
      label: 'Fundraisers',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-cocktail-event.jpg',
      alt: 'Cocktail party with lounge seating and warm lighting',
      label: 'Cocktail Parties',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-family.png',
      alt: 'Private celebration with elegant table settings at Luxor',
      label: 'Private Celebrations',
    },
  ],
  closingTitle: 'Make It a Signature Event.',
  closingBody:
    'From professional gatherings to milestone celebrations, Luxor offers a versatile setting designed for connection, celebration, and impact.',
  closingImage: '/images/dining-hall/main-hall-dinner-service-candid.png',
  closingImageAlt: 'Ballroom dinner service with warm chandelier lighting at Luxor',
  otherCollections: otherCollections('en'),
}

const es: Omit<EventCategoryPageProps, 'spanish'> = {
  slug: SLUG,
  eyebrow: 'Colección de eventos',
  title: 'Eventos sociales y profesionales',
  subtitle:
    'Un espacio sofisticado para reuniones corporativas, fiestas navideñas, celebraciones privadas y eventos comunitarios.',
  heroImage: '/images/luxor-lounge/luxor-lounge-corporate.png',
  heroImageAlt: 'Cena corporativa con arañas y mesas banquete en Luxor',
  introEyebrow: 'Reuniones en Luxor',
  introTitle: 'Reúne a las personas.',
  introBody:
    'Desde el networking profesional hasta encuentros comunitarios con sentido, Luxor ofrece un entorno versátil para eventos que conectan.',
  gallery: [
    {
      src: '/images/luxor-lounge/luxor-lounge-corporate.png',
      alt: 'Evento corporativo con mesas banquete y arañas en Luxor',
      label: 'Eventos corporativos',
    },
    {
      src: '/images/dining-hall/main-hall-reception-professional.png',
      alt: 'Salón principal preparado para conferencia o presentación',
      label: 'Conferencias',
    },
    {
      src: '/images/dining-hall/main-hall-corporate-cocktail.png',
      alt: 'Montaje de networking estilo cóctel en el salón de Luxor',
      label: 'Eventos de networking',
    },
    {
      src: '/images/dining-hall/main-hall-wedding-wide.png',
      alt: 'Gran salón preparado para una gala formal',
      label: 'Galas',
    },
    {
      src: '/images/dining-hall/main-hall-table-toast-candid.png',
      alt: 'Invitados brindando en una cena de recaudación en Luxor',
      label: 'Recaudaciones de fondos',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-cocktail-event.jpg',
      alt: 'Fiesta de cócteles con lounge y luz cálida',
      label: 'Fiestas de cócteles',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-family.png',
      alt: 'Celebración privada con mesas elegantes en Luxor',
      label: 'Celebraciones privadas',
    },
  ],
  closingTitle: 'Conviértelo en un evento memorable.',
  closingBody:
    'Desde reuniones profesionales hasta celebraciones importantes, Luxor ofrece un espacio versátil pensado para conectar, celebrar y causar impacto.',
  closingImage: '/images/dining-hall/main-hall-dinner-service-candid.png',
  closingImageAlt: 'Servicio de cena en el salón con luz cálida de arañas en Luxor',
  otherCollections: otherCollections('es'),
}

export function getSocialProfessionalEventsCategoryContent(locale: Locale): EventCategoryPageProps {
  const base = locale === 'es' ? es : en
  return { ...base, spanish: locale === 'es' }
}