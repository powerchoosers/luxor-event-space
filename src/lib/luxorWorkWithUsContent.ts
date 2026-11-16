export type WorkWithUsOpportunity = {
  key: string
  title: string
  description: string
  cta: string
  href: string
  image: string
  imageAlt: string
  iconName: 'store' | 'handshake' | 'users' | 'palette' | 'gift' | 'sparkles'
}

export const WORK_WITH_US_OPPORTUNITIES: WorkWithUsOpportunity[] = [
  {
    key: 'market-vendor',
    title: 'Become a Market Vendor',
    description:
      'Apply to be a vendor at our upcoming markets and community events, including the Christmas Market.',
    cta: 'Vendor Application',
    href: '/work-with-us/market-vendor',
    image: '/images/dining-hall/main-hall-reception-professional.png',
    imageAlt: 'Elegant table settings at Luxor',
    iconName: 'store',
  },
  {
    key: 'preferred-vendor',
    title: 'Preferred Vendors',
    description: 'Join our curated vendor list for weddings, parties, and corporate events at Luxor.',
    cta: 'Preferred Vendor Form',
    href: '/work-with-us/preferred-vendor',
    image: '/images/dining-hall/main-hall-wedding-dance-candid.png',
    imageAlt: 'Wedding reception at Luxor',
    iconName: 'handshake',
  },
  {
    key: 'workshop',
    title: 'Host a Workshop',
    description: 'Share your expertise and host a workshop, class, or community event at Luxor.',
    cta: 'Workshop Request',
    href: '/work-with-us/workshop',
    image: '/images/dining-hall/main-hall-corporate-cocktail.png',
    imageAlt: 'Event tables prepared for a workshop-style gathering',
    iconName: 'users',
  },
  {
    key: 'sponsorship',
    title: 'Sponsor an Event',
    description: 'Partner with Luxor and showcase your brand at one of our upcoming events.',
    cta: 'Sponsorship Inquiry',
    href: '/work-with-us/sponsorship',
    image: '/images/luxor-lounge/luxor-lounge-cocktail-event.jpg',
    imageAlt: 'Cocktail event atmosphere at Luxor',
    iconName: 'gift',
  },
  {
    key: 'activity-partner',
    title: 'Activity Partner',
    description:
      'Collaborate with us by providing a free activity, craft, or experience for our community events.',
    cta: 'Activity Partner Form',
    href: '/work-with-us/activity-partner',
    image: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
    imageAlt: 'Decor and craft-ready event setup',
    iconName: 'palette',
  },
  {
    key: 'general',
    title: 'General Inquiry',
    description: 'Have a different partnership idea or collaboration in mind? We’d love to hear from you!',
    cta: 'Contact Us',
    href: '/contact',
    image: '/images/dining-hall/main-hall-conversation-candid.png',
    imageAlt: 'Guests conversing in the Luxor ballroom',
    iconName: 'sparkles',
  },
]

export type WorkWithUsComingSoonSlug =
  | 'preferred-vendor'
  | 'workshop'
  | 'sponsorship'
  | 'activity-partner'

export const WORK_WITH_US_COMING_SOON: Record<
  WorkWithUsComingSoonSlug,
  { title: string; description: string }
> = {
  'preferred-vendor': {
    title: 'Preferred Vendor Application',
    description: 'This application will open soon. For urgent vendor partnerships, contact Luxor directly.',
  },
  workshop: {
    title: 'Workshop Request',
    description: 'Workshop hosting applications are coming soon. We appreciate your interest in sharing your craft at Luxor.',
  },
  sponsorship: {
    title: 'Sponsorship Inquiry',
    description: 'Sponsorship applications are being prepared. Check back shortly or reach out through our contact page.',
  },
  'activity-partner': {
    title: 'Activity Partner Application',
    description: 'Activity partner forms are almost ready. Thank you for wanting to bring experiences to Luxor guests.',
  },
}