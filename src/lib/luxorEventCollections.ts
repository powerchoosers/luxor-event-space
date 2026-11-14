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
    href: '/events/weddings-romance',
    image: '/images/luxor-lounge/luxor-lounge-wedding.png',
    imageAlt: 'Elegant wedding ceremony setup with romantic lighting at Luxor',
  },
  {
    number: '02',
    title: 'Milestones & Family Celebrations',
    titleEs: 'Hitos y celebraciones familiares',
    href: '/events/milestones-family-celebrations',
    image: '/images/dining-hall/main-hall-quinceanera-angle.png',
    imageAlt: 'Quinceañera ballroom with grand floral arch at Luxor',
  },
  {
    number: '03',
    title: 'Social & Professional Events',
    titleEs: 'Eventos sociales y profesionales',
    href: '/events/social-professional-events',
    image: '/images/luxor-lounge/luxor-lounge-corporate.png',
    imageAlt: 'Corporate dinner with chandeliers and banquet tables at Luxor',
  },
]