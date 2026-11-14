import { eventCollectionHref, LUXOR_EVENT_COLLECTIONS } from '@/lib/luxorEventCollections'
import type { EventCategoryPageProps } from '@/components/events/EventCategoryPage'

type Locale = 'en' | 'es'

const SLUG = 'milestones-family-celebrations'

function otherCollections(locale: Locale): EventCategoryPageProps['otherCollections'] {
  const spanish = locale === 'es'
  return LUXOR_EVENT_COLLECTIONS.filter((c) => !c.href.endsWith(SLUG)).map((c) => ({
    title: spanish ? c.titleEs : c.title,
    href: eventCollectionHref(c, spanish),
  }))
}

const en: Omit<EventCategoryPageProps, 'spanish'> = {
  slug: SLUG,
  eyebrow: 'Celebrations at Luxor',
  title: 'Milestones & Family Celebrations',
  subtitle: 'Life’s biggest milestones deserve a space that brings family and friends together in style.',
  heroImage: '/images/dining-hall/main-hall-quinceanera-angle.png',
  heroImageAlt: 'Quinceañera ballroom with grand floral arch and elegant lighting at Luxor',
  introEyebrow: 'Family celebrations',
  introTitle: 'Celebrate Life’s Special Moments.',
  introBody:
    'From milestone birthdays to joyful family gatherings, Luxor provides a beautiful and versatile setting for the moments that matter most.',
  gallery: [
    {
      src: '/images/luxor-lounge/luxor-lounge-quinceanera.png',
      alt: 'Quinceañera celebration setup in the Luxor lounge',
      label: 'Quinceañeras',
    },
    {
      src: '/images/dining-hall/main-hall-table-candid.png',
      alt: 'Birthday celebration with guests seated at an elegant table at Luxor',
      label: 'Birthdays',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
      alt: 'Baby shower gathering in the Luxor lounge',
      label: 'Baby Showers',
    },
    {
      src: '/images/dining-hall/main-hall-side-dance-candid.png',
      alt: 'Guests dancing at a graduation celebration in the Luxor main hall',
      label: 'Graduations',
    },
    {
      src: '/images/dining-hall/main-hall-conversation-candid.png',
      alt: 'Family members conversing over dinner during a reunion at Luxor',
      label: 'Family Reunions',
    },
    {
      src: '/images/dining-hall/main-hall-reception-professional.png',
      alt: 'Luxor ballroom with warm chandelier light set for a holiday celebration',
      label: 'Holiday Celebrations',
    },
  ],
  closingTitle: 'Make Every Milestone Memorable.',
  closingBody: 'Celebrate life’s biggest moments in a beautiful setting surrounded by the people who matter most.',
  closingImage: '/images/dining-hall/main-hall-wedding-wide.png',
  closingImageAlt: 'Luxor ballroom with chandeliers prepared for a milestone celebration',
  otherCollections: otherCollections('en'),
}

const es: Omit<EventCategoryPageProps, 'spanish'> = {
  slug: SLUG,
  eyebrow: 'Celebraciones en Luxor',
  title: 'Hitos y celebraciones familiares',
  subtitle:
    'Los momentos más importantes merecen un espacio que reúna a familia y amigos con elegancia.',
  heroImage: '/images/dining-hall/main-hall-quinceanera-angle.png',
  heroImageAlt: 'Salón de quinceañera con arco floral e iluminación elegante en Luxor',
  introEyebrow: 'Celebraciones familiares',
  introTitle: 'Celebra los momentos especiales de la vida.',
  introBody:
    'Desde cumpleaños importantes hasta reuniones alegres en familia, Luxor ofrece un ambiente hermoso y versátil para los momentos que más importan.',
  gallery: [
    {
      src: '/images/luxor-lounge/luxor-lounge-quinceanera.png',
      alt: 'Montaje de quinceañera en el lounge de Luxor',
      label: 'Quinceañeras',
    },
    {
      src: '/images/dining-hall/main-hall-table-candid.png',
      alt: 'Celebración de cumpleaños en mesa elegante de Luxor',
      label: 'Cumpleaños',
    },
    {
      src: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
      alt: 'Baby shower en el lounge de Luxor',
      label: 'Baby showers',
    },
    {
      src: '/images/dining-hall/main-hall-side-dance-candid.png',
      alt: 'Invitados bailando en una celebración de graduación en el salón de Luxor',
      label: 'Graduaciones',
    },
    {
      src: '/images/dining-hall/main-hall-conversation-candid.png',
      alt: 'Familia conversando en la cena durante una reunión en Luxor',
      label: 'Reuniones familiares',
    },
    {
      src: '/images/dining-hall/main-hall-reception-professional.png',
      alt: 'Salón de Luxor con arañas cálidas preparado para una fiesta de temporada',
      label: 'Fiestas de temporada',
    },
  ],
  closingTitle: 'Haz que cada hito sea inolvidable.',
  closingBody: 'Celebra los momentos más importantes rodeado de quienes más importan.',
  closingImage: '/images/dining-hall/main-hall-wedding-wide.png',
  closingImageAlt: 'Salón de Luxor con arañas preparado para un hito familiar',
  otherCollections: otherCollections('es'),
}

export function getMilestonesFamilyCelebrationsCategoryContent(locale: Locale): EventCategoryPageProps {
  const base = locale === 'es' ? es : en
  return { ...base, spanish: locale === 'es' }
}