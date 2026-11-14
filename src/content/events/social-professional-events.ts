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
  heroImage: '/images/dining-hall/main-hall-corporate-cocktail.png',
  heroImageAlt: 'Corporate cocktail reception setup in the Luxor main hall',
  introEyebrow: 'Gatherings at Luxor',
  introTitle: 'Bring People Together.',
  introBody:
    'From professional networking to meaningful community gatherings, Luxor provides a versatile setting for events that bring people together.',
  gallery: [
    {
      src: '/images/dining-hall/main-hall-corporate-cocktail.png',
      alt: 'Corporate cocktail reception with standing guests in the Luxor main hall',
      label: 'Corporate Events',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-corporate.png',
      alt: 'Luxor lounge arranged for a corporate conference or presentation',
      label: 'Conferences',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-cocktail-event.jpg',
      alt: 'Networking reception with cocktail tables in the Luxor lounge',
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
      src: '/images/luxor-lounge/luxor-lounge-empty.png',
      alt: 'Cocktail party setup in the Luxor lounge with bar and seating',
      label: 'Cocktail Parties',
    },
    {
      src: '/images/dining-hall/main-hall-table-candid.png',
      alt: 'Private celebration with guests seated at an elegant table in the Luxor main hall',
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
  heroImage: '/images/dining-hall/main-hall-corporate-cocktail.png',
  heroImageAlt: 'Recepción corporativa estilo cóctel en el salón principal de Luxor',
  introEyebrow: 'Reuniones en Luxor',
  introTitle: 'Reúne a las personas.',
  introBody:
    'Desde el networking profesional hasta encuentros comunitarios con sentido, Luxor ofrece un entorno versátil para eventos que conectan.',
  gallery: [
    {
      src: '/images/dining-hall/main-hall-corporate-cocktail.png',
      alt: 'Recepción corporativa con invitados de pie en el salón principal de Luxor',
      label: 'Eventos corporativos',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-corporate.png',
      alt: 'Lounge de Luxor preparado para una conferencia o presentación corporativa',
      label: 'Conferencias',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-cocktail-event.jpg',
      alt: 'Recepción de networking con mesas de cóctel en el lounge de Luxor',
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
      src: '/images/luxor-lounge/luxor-lounge-empty.png',
      alt: 'Montaje de fiesta de cócteles en el lounge de Luxor con barra y asientos',
      label: 'Fiestas de cócteles',
    },
    {
      src: '/images/dining-hall/main-hall-table-candid.png',
      alt: 'Celebración privada con invitados en mesa elegante del salón de Luxor',
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