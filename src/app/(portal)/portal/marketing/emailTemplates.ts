// Email block types and pre-built template definitions for the Luxor email builder.

export type BlockType =
  | 'hero'
  | 'text'
  | 'image_text'
  | 'button'
  | 'two_column'
  | 'divider'
  | 'spacer'
  | 'footer'

export interface HeroBlock {
  id: string
  type: 'hero'
  headline: string
  subheadline: string
  backgroundImage: string
  overlayOpacity: number
  textAlign: 'left' | 'center' | 'right'
  ctaLabel: string
  ctaUrl: string
  ctaVisible: boolean
}

export interface TextBlock {
  id: string
  type: 'text'
  content: string
  fontSize: number
  textAlign: 'left' | 'center' | 'right'
  color: string
}

export interface ImageTextBlock {
  id: string
  type: 'image_text'
  imageUrl: string
  imageAlt: string
  imagePosition: 'left' | 'right'
  headline: string
  body: string
  ctaLabel: string
  ctaUrl: string
}

export interface ButtonBlock {
  id: string
  type: 'button'
  label: string
  url: string
  align: 'left' | 'center' | 'right'
  bgColor: string
  textColor: string
}

export interface TwoColumnBlock {
  id: string
  type: 'two_column'
  leftHeadline: string
  leftBody: string
  rightHeadline: string
  rightBody: string
}

export interface DividerBlock {
  id: string
  type: 'divider'
  color: string
  thickness: number
  style: 'solid' | 'dashed' | 'dotted'
}

export interface SpacerBlock {
  id: string
  type: 'spacer'
  height: number
}

export interface FooterBlock {
  id: string
  type: 'footer'
  companyName: string
  address: string
  phone: string
  website: string
  unsubscribeUrl: string
  showSocial: boolean
  instagramUrl: string
  facebookUrl: string
}

export type EmailBlock =
  | HeroBlock
  | TextBlock
  | ImageTextBlock
  | ButtonBlock
  | TwoColumnBlock
  | DividerBlock
  | SpacerBlock
  | FooterBlock

export interface EmailTemplate {
  id: string
  name: string
  description: string
  category: 'promo' | 'event' | 'nurture' | 'transactional' | 'seasonal' | 'custom'
  previewColor: string
  blocks: EmailBlock[]
}

// Default footer used across most templates
const defaultFooter: FooterBlock = {
  id: 'footer-default',
  type: 'footer',
  companyName: 'Luxor Event Space',
  address: '803 Castroville Rd #402, San Antonio, TX 78237',
  phone: 'Private venue tours by appointment.',
  website: 'luxoratlaspalmas.com',
  unsubscribeUrl: '#unsubscribe',
  showSocial: true,
  instagramUrl: 'https://instagram.com/luxoratlaspalmas',
  facebookUrl: 'https://facebook.com/luxoratlaspalmas',
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // ─── WELCOME ────────────────────────────────────────────────────────────────
  {
    id: 'welcome',
    name: 'Welcome',
    description: 'Warm first-touch intro for new inquiries and subscribers.',
    category: 'nurture',
    previewColor: '#b8924a',
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        headline: 'Welcome to Luxor',
        subheadline: 'A world-class event space nestled in the heart of Las Palmas. We are delighted to have you with us.',
        backgroundImage: '',
        overlayOpacity: 0.55,
        textAlign: 'center',
        ctaLabel: 'Explore Our Spaces',
        ctaUrl: 'https://luxoratlaspalmas.com/spaces',
        ctaVisible: true,
      },
      {
        id: 'text-1',
        type: 'text',
        content: 'Thank you for your interest in Luxor. Whether you are planning a corporate gathering, a wedding, a quinceañera, or an intimate celebration, our team is here to make your vision a reality.\n\nWe would love to learn more about what you have in mind.',
        fontSize: 15,
        textAlign: 'center',
        color: 'rgba(215,194,154,0.78)',
      },
      {
        id: 'button-1',
        type: 'button',
        label: 'Book a Tour',
        url: 'https://luxoratlaspalmas.com/tour',
        align: 'center',
        bgColor: '#b8924a',
        textColor: '#ffffff',
      },
      { id: 'spacer-1', type: 'spacer', height: 32 },
      defaultFooter,
    ],
  },

  // ─── EVENT PROMO ─────────────────────────────────────────────────────────────
  {
    id: 'event_promo',
    name: 'Event Promo',
    description: 'High-impact announcement for a specific upcoming event or open date.',
    category: 'promo',
    previewColor: '#1a56db',
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        headline: 'An Unforgettable Evening Awaits',
        subheadline: 'Limited dates available for Q4. Reserve your event space today.',
        backgroundImage: '',
        overlayOpacity: 0.6,
        textAlign: 'center',
        ctaLabel: 'Reserve Now',
        ctaUrl: 'https://luxoratlaspalmas.com/pricing',
        ctaVisible: true,
      },
      {
        id: 'two-col-1',
        type: 'two_column',
        leftHeadline: 'Premium Packages',
        leftBody: 'From intimate gatherings of 30 to grand celebrations of 300+, our flexible packages include AV, catering coordination, and on-site management.',
        rightHeadline: 'Available Dates',
        rightBody: 'September, October, and November slots are filling fast. Contact us now to lock in your preferred date before it is gone.',
      },
      { id: 'divider-1', type: 'divider', color: '#e0c97c', thickness: 1, style: 'solid' },
      {
        id: 'button-1',
        type: 'button',
        label: 'View Pricing & Availability',
        url: 'https://luxoratlaspalmas.com/pricing',
        align: 'center',
        bgColor: '#caa24c',
        textColor: '#050505',
      },
      { id: 'spacer-1', type: 'spacer', height: 24 },
      defaultFooter,
    ],
  },

  // ─── QUINCEAÑERA ─────────────────────────────────────────────────────────────
  {
    id: 'quinceanera',
    name: 'Quinceañera Package',
    description: 'Targeted pitch for quinceañera families — warm, personal, elegant.',
    category: 'event',
    previewColor: '#9c27b0',
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        headline: 'She Deserves the Most Beautiful Day',
        subheadline: 'Celebrate her Quinceañera in a venue as extraordinary as she is.',
        backgroundImage: '',
        overlayOpacity: 0.5,
        textAlign: 'center',
        ctaLabel: 'Plan Her Quinceañera',
        ctaUrl: 'https://luxoratlaspalmas.com/events',
        ctaVisible: true,
      },
      {
        id: 'text-1',
        type: 'text',
        content: 'At Luxor, every Quinceañera is a masterpiece. From the first waltz to the final toast, our dedicated team ensures every detail reflects her personality and style.\n\nOur all-inclusive packages include:\n- Elegant ballroom with up to 300 guests\n- Premium catering coordination\n- Ambient lighting & sound design\n- Full event planning support',
        fontSize: 15,
        textAlign: 'left',
        color: 'rgba(215,194,154,0.78)',
      },
      {
        id: 'image-text-1',
        type: 'image_text',
        imageUrl: '',
        imageAlt: 'Quinceañera celebration at Luxor',
        imagePosition: 'left',
        headline: 'Your Vision, Our Expertise',
        body: 'We have hosted hundreds of quinceañeras and understand exactly what this milestone means. Let us bring your dream to life -- every flower, every light, every moment.',
        ctaLabel: 'Schedule a Consultation',
        ctaUrl: 'https://luxoratlaspalmas.com/tour',
      },
      { id: 'divider-1', type: 'divider', color: '#d4a0e0', thickness: 1, style: 'solid' },
      {
        id: 'button-1',
        type: 'button',
        label: 'Explore Quinceañera Packages',
        url: 'https://luxoratlaspalmas.com/events',
        align: 'center',
        bgColor: '#9c27b0',
        textColor: '#ffffff',
      },
      { id: 'spacer-1', type: 'spacer', height: 24 },
      defaultFooter,
    ],
  },

  // ─── CORPORATE FOLLOW-UP ─────────────────────────────────────────────────────
  {
    id: 'corporate_followup',
    name: 'Corporate Follow-Up',
    description: 'Professional post-inquiry nurture for corporate event planners.',
    category: 'nurture',
    previewColor: '#0f4c81',
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        content: 'Thank you for your inquiry.',
        fontSize: 22,
        textAlign: 'center',
        color: '#f7efe3',
      },
      {
        id: 'text-2',
        type: 'text',
        content: 'We have reviewed your event details and are confident that Luxor can deliver a seamless, impressive experience for your team and clients.\n\nFrom board meetings and product launches to gala dinners and team-building events -- our corporate packages are designed to make you look exceptional.',
        fontSize: 15,
        textAlign: 'left',
        color: 'rgba(215,194,154,0.78)',
      },
      {
        id: 'two-col-1',
        type: 'two_column',
        leftHeadline: 'What Is Included',
        leftBody: 'Full AV suite, high-speed WiFi, breakout rooms, catering, branded signage, and a dedicated event coordinator.',
        rightHeadline: 'Why Luxor',
        rightBody: 'Central location, flexible layouts, and a track record of hosting 200+ corporate events with a 98% client satisfaction rate.',
      },
      { id: 'divider-1', type: 'divider', color: '#ccd6e8', thickness: 1, style: 'solid' },
      {
        id: 'button-1',
        type: 'button',
        label: 'Schedule a Site Visit',
        url: 'https://luxoratlaspalmas.com/tour',
        align: 'center',
        bgColor: '#caa24c',
        textColor: '#050505',
      },
      { id: 'spacer-1', type: 'spacer', height: 24 },
      defaultFooter,
    ],
  },

  // ─── SEASONAL OFFER ───────────────────────────────────────────────────────────
  {
    id: 'seasonal_offer',
    name: 'Seasonal Offer',
    description: 'Holiday or seasonal promotional campaign with urgency CTA.',
    category: 'seasonal',
    previewColor: '#c0392b',
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        headline: 'Celebrate the Season at Luxor',
        subheadline: 'Special holiday packages now available -- for a limited time only.',
        backgroundImage: '',
        overlayOpacity: 0.6,
        textAlign: 'center',
        ctaLabel: 'View Holiday Packages',
        ctaUrl: 'https://luxoratlaspalmas.com/pricing',
        ctaVisible: true,
      },
      {
        id: 'text-1',
        type: 'text',
        content: 'This season, give your guests an experience they will remember long after the last glass is raised. Our holiday packages include:\n\n- Complimentary seasonal decor\n- Exclusive early-bird pricing (book by December 1)\n- Priority date selection\n- Dedicated holiday event coordinator',
        fontSize: 15,
        textAlign: 'center',
        color: 'rgba(215,194,154,0.78)',
      },
      { id: 'divider-1', type: 'divider', color: '#e74c3c', thickness: 2, style: 'solid' },
      {
        id: 'button-1',
        type: 'button',
        label: 'Claim Your Holiday Package',
        url: 'https://luxoratlaspalmas.com/pricing',
        align: 'center',
        bgColor: '#c0392b',
        textColor: '#ffffff',
      },
      { id: 'spacer-1', type: 'spacer', height: 24 },
      defaultFooter,
    ],
  },

  // ─── TOUR CONFIRMATION ────────────────────────────────────────────────────────
  {
    id: 'tour_confirmation',
    name: 'Tour Confirmation',
    description: 'Transactional email confirming a booked venue tour.',
    category: 'transactional',
    previewColor: '#2ecc71',
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        content: 'Your Tour is Confirmed',
        fontSize: 26,
        textAlign: 'center',
        color: '#f7efe3',
      },
      {
        id: 'text-2',
        type: 'text',
        content: 'We are looking forward to showing you around Luxor. Please find your tour details below:\n\nDate & Time: [INSERT DATE]\nLocation: Luxor Event Space, Las Palmas\nYour Host: [INSERT HOST NAME]\n\nIf you need to reschedule or have any questions before your visit, do not hesitate to reach out -- we are here to help.',
        fontSize: 15,
        textAlign: 'center',
        color: 'rgba(215,194,154,0.78)',
      },
      { id: 'divider-1', type: 'divider', color: '#27ae60', thickness: 1, style: 'solid' },
      {
        id: 'text-3',
        type: 'text',
        content: 'What to expect during your tour:\n- A full walkthrough of our event spaces\n- Capacity planning and layout options\n- Catering & AV demonstrations\n- Pricing and package overview\n- Q&A with our event team',
        fontSize: 14,
        textAlign: 'left',
        color: 'rgba(215,194,154,0.78)',
      },
      {
        id: 'button-1',
        type: 'button',
        label: 'Get Directions',
        url: 'https://luxoratlaspalmas.com/visit',
        align: 'center',
        bgColor: '#2ecc71',
        textColor: '#ffffff',
      },
      { id: 'spacer-1', type: 'spacer', height: 24 },
      defaultFooter,
    ],
  },
]
