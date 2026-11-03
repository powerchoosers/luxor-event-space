// Email block types and pre-built template definitions for the Luxor email builder.
// The document envelope is versioned so Elena, saved templates, and automated
// email renderers can share one stable contract as the editor evolves.

import type { LuxorEmailTheme } from '@/lib/luxorEmailDesignSystem'
import { cloneLuxorEmailTheme } from '@/lib/luxorEmailDesignSystem'
import { LUXOR_VENUE_ADDRESS } from '@/lib/luxorVenue'
export type { LuxorEmailTheme, LuxorEmailThemeMode } from '@/lib/luxorEmailDesignSystem'

export const LUXOR_EMAIL_DOCUMENT_VERSION = 2 as const

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
  tiktokUrl?: string
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
  subject?: string
  description: string
  category: 'promo' | 'event' | 'nurture' | 'transactional' | 'seasonal' | 'custom'
  previewColor: string
  blocks: EmailBlock[]
  schemaVersion?: typeof LUXOR_EMAIL_DOCUMENT_VERSION
  preheader?: string
  theme?: LuxorEmailTheme
}

export interface LuxorEmailDocument {
  schemaVersion: typeof LUXOR_EMAIL_DOCUMENT_VERSION
  subject: string
  preheader: string
  theme: LuxorEmailTheme
  blocks: EmailBlock[]
}

// Default footer used across most templates
const defaultFooter: FooterBlock = {
  id: 'footer-default',
  type: 'footer',
  companyName: 'Luxor Event Space',
  address: LUXOR_VENUE_ADDRESS,
  phone: 'Private venue tours by appointment.',
  website: 'luxoratlaspalmas.com',
  unsubscribeUrl: '#unsubscribe',
  showSocial: true,
  instagramUrl: 'https://www.instagram.com/luxoratlaspalmas?utm_source=qr',
  facebookUrl: 'https://www.facebook.com/share/1DD3mKM8XJ/?mibextid=wwXIfr',
  tiktokUrl: 'https://www.tiktok.com/@luxoratlaspalmas?_r=1&_t=ZT-97vnzmYjFUM',
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'open_house_editorial',
    name: 'Open House Invitation',
    subject: "You're Invited to Explore Luxor",
    description: 'Editorial invitation with event details, venue story, and a focused RSVP.',
    category: 'event',
    previewColor: '#b88732',
    schemaVersion: LUXOR_EMAIL_DOCUMENT_VERSION,
    preheader: 'Explore our space and discuss the plans for your event.',
    theme: cloneLuxorEmailTheme('brand'),
    blocks: [
      {
        id: 'open-house-hero',
        type: 'hero',
        headline: 'An Evening at Luxor',
        subheadline: 'Explore our indoor venue and talk with our team about your celebration.',
        backgroundImage: '/images/dining-hall/main-hall-wedding-wide.png',
        overlayOpacity: 0.62,
        textAlign: 'center',
        ctaLabel: 'Plan a Visit',
        ctaUrl: 'https://www.luxoratlaspalmas.com/tour',
        ctaVisible: true,
      },
      {
        id: 'open-house-details',
        type: 'two_column',
        leftHeadline: 'Visit Luxor',
        leftBody: 'Request a convenient tour time and our team will confirm the details.',
        rightHeadline: 'What to expect',
        rightBody: 'See the venue, discuss your guest count and event plans, and ask questions about next steps.',
      },
      {
        id: 'open-house-feature',
        type: 'image_text',
        imageUrl: '/images/luxor-lounge/luxor-lounge-wedding.png',
        imageAlt: 'Elegant event setup at Luxor Event Space',
        imagePosition: 'left',
        headline: 'Designed for unforgettable moments',
        body: 'From intimate gatherings to grand celebrations, our versatile spaces are designed to bring your vision to life.',
        ctaLabel: 'Explore Our Spaces',
        ctaUrl: 'https://www.luxoratlaspalmas.com/spaces',
      },
      { ...defaultFooter, id: 'open-house-footer' },
    ],
  },
  {
    id: 'tour_follow_up_editorial',
    name: 'Tour Follow-up',
    subject: 'Thank you for touring Luxor',
    description: 'Warm post-tour recap with next steps and a proposal action.',
    category: 'nurture',
    previewColor: '#d8c5a3',
    schemaVersion: LUXOR_EMAIL_DOCUMENT_VERSION,
    preheader: 'A quick recap and thoughtful next steps for your event.',
    theme: cloneLuxorEmailTheme('light'),
    blocks: [
      {
        id: 'tour-follow-hero',
        type: 'hero',
        headline: 'Thank You for Visiting Luxor',
        subheadline: 'It was a pleasure learning more about your celebration. We would be honored to help bring it to life.',
        backgroundImage: '/images/dining-hall/main-hall-table-toast-candid.png',
        overlayOpacity: 0.58,
        textAlign: 'center',
        ctaLabel: 'Review Package Options',
        ctaUrl: 'https://www.luxoratlaspalmas.com/pricing',
        ctaVisible: true,
      },
      {
        id: 'tour-follow-next',
        type: 'two_column',
        leftHeadline: 'Your next step',
        leftBody: 'Review the package options and let us know what best fits your event. A tailored proposal follows a review of your plans.',
        rightHeadline: 'Let’s connect',
        rightBody: 'Reply with questions or adjustments and our planning team will help.',
      },
      { ...defaultFooter, id: 'tour-follow-footer' },
    ],
  },
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
        subheadline: 'An indoor event venue in San Antonio. We look forward to hearing about your plans.',
        backgroundImage: '',
        overlayOpacity: 0.55,
        textAlign: 'center',
        ctaLabel: 'Explore Our Spaces',
        ctaUrl: 'https://www.luxoratlaspalmas.com/spaces',
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
        url: 'https://www.luxoratlaspalmas.com/tour',
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
        subheadline: 'Explore Luxor for your next celebration and ask about your preferred date.',
        backgroundImage: '',
        overlayOpacity: 0.6,
        textAlign: 'center',
        ctaLabel: 'Explore Packages',
        ctaUrl: 'https://www.luxoratlaspalmas.com/pricing',
        ctaVisible: true,
      },
      {
        id: 'two-col-1',
        type: 'two_column',
        leftHeadline: 'Premium Packages',
        leftBody: 'Our indoor venue accommodates up to 180 guests. Review the current package options with our team to choose what fits your plans.',
        rightHeadline: 'Available Dates',
        rightBody: 'Share your preferred date and guest count so our team can check availability and discuss the next step.',
      },
      { id: 'divider-1', type: 'divider', color: '#e0c97c', thickness: 1, style: 'solid' },
      {
        id: 'button-1',
        type: 'button',
        label: 'View Pricing',
        url: 'https://www.luxoratlaspalmas.com/pricing',
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
        ctaUrl: 'https://www.luxoratlaspalmas.com/events',
        ctaVisible: true,
      },
      {
        id: 'text-1',
        type: 'text',
        content: 'Plan a Quinceañera that reflects her personality and style. Luxor offers a fully indoor setting for up to 180 guests.\n\nTell us about your preferred date, guest count, and ideas. Our team can walk you through the current package options and help you choose a clear next step.',
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
        body: 'A venue visit gives your family a chance to see the space, talk through your ideas, and ask the questions that matter to you.',
        ctaLabel: 'Schedule a Consultation',
        ctaUrl: 'https://www.luxoratlaspalmas.com/tour',
      },
      { id: 'divider-1', type: 'divider', color: '#d4a0e0', thickness: 1, style: 'solid' },
      {
        id: 'button-1',
        type: 'button',
        label: 'Explore Quinceañera Packages',
        url: 'https://www.luxoratlaspalmas.com/events',
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
        content: 'Thank you for considering Luxor for your team or client event.\n\nShare your preferred date, guest count, and event format so we can discuss whether our indoor venue fits your plans.',
        fontSize: 15,
        textAlign: 'left',
        color: 'rgba(215,194,154,0.78)',
      },
      {
        id: 'two-col-1',
        type: 'two_column',
        leftHeadline: 'Plan Your Event',
        leftBody: 'Discuss your layout, schedule, and equipment needs with our team. We will confirm the services and inclusions that apply to your proposal.',
        rightHeadline: 'Why Luxor',
        rightBody: 'A fully indoor venue in San Antonio for up to 180 guests. A site visit can help you assess the space and ask about your requirements.',
      },
      { id: 'divider-1', type: 'divider', color: '#ccd6e8', thickness: 1, style: 'solid' },
      {
        id: 'button-1',
        type: 'button',
        label: 'Schedule a Site Visit',
        url: 'https://www.luxoratlaspalmas.com/tour',
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
    description: 'A seasonal celebration invitation with one clear next step.',
    category: 'seasonal',
    previewColor: '#c0392b',
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        headline: 'Celebrate the Season at Luxor',
        subheadline: 'Bring your team, friends, or family together for a seasonal celebration.',
        backgroundImage: '',
        overlayOpacity: 0.6,
        textAlign: 'center',
        ctaLabel: 'Explore Package Options',
        ctaUrl: 'https://www.luxoratlaspalmas.com/pricing',
        ctaVisible: true,
      },
      {
        id: 'text-1',
        type: 'text',
        content: 'Planning a seasonal gathering? Luxor offers an indoor setting for up to 180 guests.\n\nShare your preferred date and guest count so our team can check current availability and explain the package options that fit your plans.',
        fontSize: 15,
        textAlign: 'center',
        color: 'rgba(215,194,154,0.78)',
      },
      { id: 'divider-1', type: 'divider', color: '#e74c3c', thickness: 2, style: 'solid' },
      {
        id: 'button-1',
        type: 'button',
        label: 'Explore Package Options',
        url: 'https://www.luxoratlaspalmas.com/pricing',
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
    description: 'Tour details for clients with an already confirmed visit.',
    category: 'transactional',
    previewColor: '#2ecc71',
    blocks: [
      {
        id: 'text-1',
        type: 'text',
        content: 'Your Upcoming Luxor Tour',
        fontSize: 26,
        textAlign: 'center',
        color: '#f7efe3',
      },
      {
        id: 'text-2',
        type: 'text',
        content: `We look forward to showing you Luxor. Your tour details:\n\nDate: {{tour_date}}\nTime: {{tour_time}}\nLocation: ${LUXOR_VENUE_ADDRESS}\n\nIf you need to confirm or adjust your visit, reply to this email and our team will help.`,
        fontSize: 15,
        textAlign: 'center',
        color: 'rgba(215,194,154,0.78)',
      },
      { id: 'divider-1', type: 'divider', color: '#27ae60', thickness: 1, style: 'solid' },
      {
        id: 'text-3',
        type: 'text',
        content: 'During your tour, you can see the venue, discuss your guest count and layout ideas, review current package options, and ask questions about your event.',
        fontSize: 14,
        textAlign: 'left',
        color: 'rgba(215,194,154,0.78)',
      },
      {
        id: 'button-1',
        type: 'button',
        label: 'Get Directions',
        url: 'https://www.luxoratlaspalmas.com/visit',
        align: 'center',
        bgColor: '#2ecc71',
        textColor: '#ffffff',
      },
      { id: 'spacer-1', type: 'spacer', height: 24 },
      defaultFooter,
    ],
  },
]
