export type LuxorPublicEventPage = {
  slug: string
  name: string
  singular: string
  eyebrow: string
  headline: string
  introduction: string
  heroImage: string
  secondaryImage: string
  moments: Array<{ title: string; copy: string }>
  walkthrough: string[]
  faqs: Array<{ question: string; answer: string }>
}

export const LUXOR_PUBLIC_EVENT_PAGES: LuxorPublicEventPage[] = [
  {
    slug: 'weddings',
    name: 'Weddings',
    singular: 'Wedding',
    eyebrow: 'San Antonio weddings',
    headline: 'A wedding room that carries the whole evening.',
    introduction: 'Plan the ceremony, dinner, portraits, speeches, and dancing as one connected guest experience—with a dark, warm backdrop that already feels finished.',
    heroImage: '/images/dining-hall/main-hall-wedding-wide.png',
    secondaryImage: '/images/dining-hall/main-hall-wedding-dance-candid.png',
    moments: [
      { title: 'The arrival', copy: 'Create a clear welcome and an entrance that feels intentional from the first guest through the wedding party.' },
      { title: 'Dinner together', copy: 'Shape family seating, service paths, speeches, and sightlines around the people who matter most.' },
      { title: 'The celebration', copy: 'Give portraits, the first dance, and the open dance floor room to become distinct moments.' },
    ],
    walkthrough: ['Ceremony and reception layout', 'Sweetheart, family, and guest-table placement', 'DJ, dance floor, cake, and photo locations', 'Vendor access and timing questions'],
    faqs: [
      { question: 'Can we hold the ceremony and reception at Luxor?', answer: 'The room can be discussed for both moments. The final layout depends on guest count, timing, and the transition you want, so confirm the exact plan during your walkthrough.' },
      { question: 'How many guests can we plan for?', answer: 'Luxor can accommodate events up to 200 guests. The practical count may be lower for layouts that need more room for a ceremony, dance floor, or production.' },
      { question: 'Can we bring our own vendors?', answer: 'Bring your vendor list to the tour. The Luxor team will confirm access, timing, and any venue requirements before you commit.' },
    ],
  },
  {
    slug: 'quinceaneras',
    name: 'Quinceañeras',
    singular: 'Quinceañera',
    eyebrow: 'San Antonio quinceañeras',
    headline: 'Give every quinceañera moment its own sense of arrival.',
    introduction: 'Plan the court entrance, family seating, portraits, cake, traditions, and dancing in a room made to feel dramatic without competing with your colors or story.',
    heroImage: '/images/dining-hall/main-hall-quinceanera-angle.png',
    secondaryImage: '/images/luxor-lounge/luxor-lounge-quinceanera.png',
    moments: [
      { title: 'The grand entrance', copy: 'Map the court and family entrance so the room is focused on the quinceañera from the first step.' },
      { title: 'Family traditions', copy: 'Protect space and sightlines for the toast, changing of the shoes, dances, cake, and other family traditions.' },
      { title: 'Portraits and dancing', copy: 'Use the hall and lounge to give formal photos and the party their own energy.' },
    ],
    walkthrough: ['Court and family seating', 'Entrance and tradition locations', 'Cake, gifts, portraits, and lounge use', 'DJ, dance floor, and decor scale'],
    faqs: [
      { question: 'Can the decor match our colors?', answer: 'Yes. Luxor’s dark, gold, and neutral foundation works with many palettes. Bring inspiration images so the team can discuss the scale and placement of your decor.' },
      { question: 'Is there room for a court?', answer: 'Court seating and entrances can be planned into the layout. The best arrangement depends on court size and total guest count, which is why a walkthrough matters.' },
      { question: 'What is the maximum guest count?', answer: 'Luxor can accommodate up to 200 guests, subject to the final layout and the space needed for traditions, dining, and dancing.' },
    ],
  },
  {
    slug: 'baby-showers',
    name: 'Baby showers',
    singular: 'Baby shower',
    eyebrow: 'San Antonio baby showers',
    headline: 'A softer celebration inside a room with real presence.',
    introduction: 'Bring together brunch or lunch, gifts, dessert, games, and family photos without making the gathering feel lost inside a generic room.',
    heroImage: '/images/luxor-lounge/luxor-lounge-baby-shower.png',
    secondaryImage: '/images/luxor-lounge/luxor-lounge-family.png',
    moments: [
      { title: 'A warm welcome', copy: 'Create an easy arrival for relatives and friends across generations.' },
      { title: 'The details', copy: 'Give the dessert, gifts, signage, and photo backdrop clear places instead of crowding one corner.' },
      { title: 'Time together', copy: 'Build a comfortable seating plan for food, conversation, games, and opening gifts.' },
    ],
    walkthrough: ['Brunch or lunch seating', 'Gift, dessert, and backdrop placement', 'Lounge use and family comfort', 'Setup timing and package fit'],
    faqs: [
      { question: 'Can Luxor host a daytime shower?', answer: 'Yes. Morning rental windows run from 8 AM to 3 PM, depending on the day and availability.' },
      { question: 'Can we personalize the room?', answer: 'Yes. Bring your color palette and inspiration so the team can help you think through backdrop, dessert, and table placement.' },
      { question: 'Do you offer smaller-event options?', answer: 'Luxor has venue and service options that can be shaped around the guest count. Use the rates page as a starting point, then request a specific quote.' },
    ],
  },
  {
    slug: 'corporate-events',
    name: 'Corporate events',
    singular: 'Corporate event',
    eyebrow: 'San Antonio corporate events',
    headline: 'A professional setting that does not feel like a conference room.',
    introduction: 'Host awards, networking, company dinners, presentations, and milestone gatherings in a space that feels deliberate for both the program and the people.',
    heroImage: '/images/dining-hall/main-hall-corporate-cocktail.png',
    secondaryImage: '/images/luxor-lounge/luxor-lounge-corporate.png',
    moments: [
      { title: 'The program', copy: 'Build clear attention around awards, remarks, presentations, or a company milestone.' },
      { title: 'The connections', copy: 'Use the hall and lounge to separate focused programming from cocktails and conversation.' },
      { title: 'The dinner', copy: 'Plan seating and service flow without losing the professional tone of the event.' },
    ],
    walkthrough: ['Presentation and awards placement', 'Cocktail and networking flow', 'Dinner seating and service access', 'AV, vendor, and timing requirements'],
    faqs: [
      { question: 'Can the room support a presentation?', answer: 'Presentation placement and guest sightlines can be planned during the walkthrough. Confirm any specific AV needs with the team before booking.' },
      { question: 'Can we use the lounge for networking?', answer: 'The lounge can support a separate cocktail or conversation zone. The final use depends on your event layout and package.' },
      { question: 'Do you offer weekday rentals?', answer: 'Yes. Monday through Thursday morning, evening, and full-day rental windows are available, subject to the calendar.' },
    ],
  },
]

export function getLuxorPublicEventPage(slug: string) {
  return LUXOR_PUBLIC_EVENT_PAGES.find((event) => event.slug === slug)
}
