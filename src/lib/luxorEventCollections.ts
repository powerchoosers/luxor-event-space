import { publicSitePath } from '@/lib/publicSitePaths'

/** Category page build order for later phases: breadcrumb → hero → intro → gallery → closing CTA. */
export const LUXOR_EVENT_CATEGORY_PAGE_SECTION_ORDER = [
  'breadcrumb',
  'hero',
  'intro',
  'gallery',
  'closingCta',
] as const

export type LuxorEventCollection = {
  number: string
  title: string
  titleEs: string
  eventTypesLine: string
  eventTypesLineEs: string
  href: string
  image: string
  imageAlt: string
}

export function eventCollectionHref(collection: LuxorEventCollection, spanish: boolean): string {
  return publicSitePath(collection.href, spanish)
}

export const LUXOR_EVENT_COLLECTIONS: LuxorEventCollection[] = [
  {
    number: '01',
    title: 'Weddings & Romance',
    titleEs: 'Bodas y romance',
    eventTypesLine: 'Weddings • Engagement Parties • Bridal Showers • Anniversaries',
    eventTypesLineEs: 'Bodas • Fiestas de compromiso • Despedidas de soltera • Aniversarios',
    href: '/events/weddings-romance',
    image: '/images/dining-hall/main-hall-wedding-wide.png',
    imageAlt: 'Luxor ballroom prepared for a wedding celebration',
  },
  {
    number: '02',
    title: 'Milestones & Family Celebrations',
    titleEs: 'Hitos y celebraciones familiares',
    eventTypesLine: 'Quinceañeras • Sweet Sixteens • Birthdays • Baby Showers • Graduation Parties',
    eventTypesLineEs: 'Quinceañeras • Sweet Sixteens • Cumpleaños • Baby showers • Fiestas de graduación',
    href: '/events/milestones-family-celebrations',
    image: '/images/dining-hall/main-hall-quinceanera-angle.png',
    imageAlt: 'Quinceañera ballroom with grand floral arch at Luxor',
  },
  {
    number: '03',
    title: 'Social & Professional Events',
    titleEs: 'Eventos sociales y profesionales',
    eventTypesLine: 'Corporate Events • Holiday Parties • Private Parties • Fundraisers • Community Events',
    eventTypesLineEs: 'Eventos corporativos • Fiestas navideñas • Fiestas privadas • Recaudaciones • Eventos comunitarios',
    href: '/events/social-professional-events',
    image: '/images/dining-hall/main-hall-corporate-cocktail.png',
    imageAlt: 'Corporate cocktail reception with ballroom styling at Luxor',
  },
]