import { eventCollectionHref, LUXOR_EVENT_COLLECTIONS } from '@/lib/luxorEventCollections'
import type { EventCategoryPageProps } from '@/components/events/EventCategoryPage'

type Locale = 'en' | 'es'

const SLUG = 'weddings-romance'

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
  title: 'Weddings & Romance',
  subtitle: 'Celebrate love in a modern, elegant setting designed for your most meaningful moments.',
  heroImage: '/images/dining-hall/main-hall-wedding-wide.png',
  heroImageAlt: 'Wide view of the Luxor main hall prepared for a wedding reception',
  introEyebrow: 'In this collection',
  introTitle: 'Love stories worth celebrating.',
  introBody:
    'From vows and first dances to intimate dinners with everyone you love, Luxor gives weddings and romantic gatherings a polished ballroom setting with room to shape every detail.',
  gallery: [
    {
      src: '/images/dining-hall/main-hall-wedding-wide.png',
      alt: 'Luxor ballroom prepared for a wedding reception',
      label: 'Weddings',
    },
    {
      src: '/images/dining-hall/main-hall-conversation-candid.png',
      alt: 'Couple celebrating at an engagement-style dinner at Luxor',
      label: 'Engagements',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
      alt: 'Seated bridal shower gathering in the Luxor lounge with gift tables and lounge seating',
      label: 'Bridal Showers',
    },
    {
      src: '/images/dining-hall/main-hall-dinner-service-candid.png',
      alt: 'Rehearsal dinner tables with warm lighting at Luxor',
      label: 'Rehearsal Dinners',
    },
    {
      src: '/images/dining-hall/main-hall-table-toast-candid.png',
      alt: 'Anniversary toast at a candlelit table in the Luxor ballroom',
      label: 'Anniversaries',
    },
    {
      src: '/images/dining-hall/main-hall-wedding-dance-candid.png',
      alt: 'Couple dancing at a vow renewal celebration at Luxor',
      label: 'Vow Renewals',
    },
  ],
  closingTitle: 'Curated for Love & Lifelong Moments.',
  closingBody: 'Flexible packages, elegant spaces, and personalized support for your celebration.',
  closingImage: '/images/dining-hall/main-hall-reception-professional.png',
  closingImageAlt: 'Ballroom with warm chandelier light prepared for a wedding reception',
  otherCollections: otherCollections('en'),
}

const es: Omit<EventCategoryPageProps, 'spanish'> = {
  slug: SLUG,
  eyebrow: 'Colección de eventos',
  title: 'Bodas y romance',
  subtitle: 'Celebra el amor en un ambiente moderno y elegante, pensado para tus momentos más significativos.',
  heroImage: '/images/dining-hall/main-hall-wedding-wide.png',
  heroImageAlt: 'Vista amplia del salón principal de Luxor preparado para una recepción de boda',
  introEyebrow: 'En esta colección',
  introTitle: 'Historias de amor que merecen celebrarse.',
  introBody:
    'Desde los votos y el primer baile hasta cenas íntimas con quienes más importan, Luxor ofrece un salón refinado con espacio para personalizar cada detalle.',
  gallery: [
    {
      src: '/images/dining-hall/main-hall-wedding-wide.png',
      alt: 'Salón principal de Luxor preparado para una recepción de boda',
      label: 'Bodas',
    },
    {
      src: '/images/dining-hall/main-hall-conversation-candid.png',
      alt: 'Pareja celebrando en un ambiente de compromiso en Luxor',
      label: 'Compromisos',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
      alt: 'Bridal shower en el lounge de Luxor con mesas de regalos y asientos tipo lounge',
      label: 'Bridal showers',
    },
    {
      src: '/images/dining-hall/main-hall-dinner-service-candid.png',
      alt: 'Mesas de cena de ensayo con luz cálida en Luxor',
      label: 'Cenas de ensayo',
    },
    {
      src: '/images/dining-hall/main-hall-table-toast-candid.png',
      alt: 'Brindis de aniversario a la luz de las velas en Luxor',
      label: 'Aniversarios',
    },
    {
      src: '/images/dining-hall/main-hall-wedding-dance-candid.png',
      alt: 'Pareja bailando en una renovación de votos en Luxor',
      label: 'Renovación de votos',
    },
  ],
  closingTitle: 'Pensado para el amor y los momentos que perduran.',
  closingBody: 'Paquetes flexibles, espacios elegantes y acompañamiento personalizado para tu celebración.',
  closingImage: '/images/dining-hall/main-hall-reception-professional.png',
  closingImageAlt: 'Salón con arañas cálidas preparado para una recepción de boda',
  otherCollections: otherCollections('es'),
}

export function getWeddingsRomanceCategoryContent(locale: Locale): EventCategoryPageProps {
  const base = locale === 'es' ? es : en
  return { ...base, spanish: locale === 'es' }
}