import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  CarFront,
  ChefHat,
  Crown,
  DoorOpen,
  Layers3,
  Sofa,
  Star,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { PublicPricingDay } from '@/lib/luxorPricingCatalog'

type AmenityIcon = ComponentType<{ 'aria-hidden'?: boolean | 'true' | 'false'; className?: string; strokeWidth?: number }>

function BanquetChairIcon({ className, strokeWidth = 1.25, ...props }: { 'aria-hidden'?: boolean | 'true' | 'false'; className?: string; strokeWidth?: number }) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="7" y="3" width="10" height="9" rx="1.25" />
      <path d="M6 12h12M7 12v9M17 12v9M7 16h10" />
    </svg>
  )
}

function RoundTableIcon({ className, strokeWidth = 1.25, ...props }: { 'aria-hidden'?: boolean | 'true' | 'false'; className?: string; strokeWidth?: number }) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="12" cy="6.5" rx="8" ry="3.25" />
      <path d="M4 6.5 5 19M20 6.5 19 19M8 9.25l-.45 9.25M16 9.25l.45 9.25" />
    </svg>
  )
}

function RectangleTableIcon({ className, strokeWidth = 1.25, ...props }: { 'aria-hidden'?: boolean | 'true' | 'false'; className?: string; strokeWidth?: number }) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="6" width="18" height="4" rx="0.75" />
      <path d="M5.5 10v9M18.5 10v9M8 10v5M16 10v5" />
    </svg>
  )
}

type Inclusion = {
  title: string
  description: string
  icon: AmenityIcon
}

const inclusions: Inclusion[] = [
  { title: 'Round Tables', description: 'Round tables are included with your venue rental.', icon: RoundTableIcon },
  { title: 'Rectangle Tables', description: 'Rectangle tables are included for flexible event layouts.', icon: RectangleTableIcon },
  { title: 'Chairs', description: 'Chairs are included for your guests.', icon: BanquetChairIcon },
  { title: 'Black or White Linens', description: 'Choose black or white linens to complement your event design.', icon: Layers3 },
  { title: 'Flexible Rental Options', description: 'Choose a half-day or full-day rental to fit your event.', icon: CalendarRange },
  { title: 'Kitchenette', description: 'Convenient kitchenette space for event prep and service.', icon: ChefHat },
  { title: 'Luxor Lounge', description: 'A stylish lounge space for guests to relax and gather.', icon: Sofa },
  { title: 'VIP Room', description: 'A private VIP space for special moments and added comfort.', icon: DoorOpen },
  { title: 'Ample Parking', description: 'Convenient onsite parking for you and your guests.', icon: CarFront },
  { title: 'Free Wi-Fi', description: 'Complimentary Wi-Fi is available throughout the venue.', icon: Wifi },
]

function SectionHeading({ id, title, subtitle, level = 'h2' }: { id: string; title: string; subtitle: string; level?: 'h1' | 'h2' }) {
  const Heading = level
  return (
    <div className="pricing-heading" id={id}>
      <Heading>{title}</Heading>
      <p>{subtitle}</p>
      <div className="pricing-ornament" aria-hidden="true"><span /></div>
    </div>
  )
}

export default function PricingPageContent({ pricingDays, feeDisclosure }: { pricingDays: PublicPricingDay[]; feeDisclosure: string }) {
  return (
    <main className="pricing-page" aria-labelledby="included-heading">
      <section className="pricing-section pricing-inclusions" aria-labelledby="included-heading">
        <div className="pricing-container">
          <SectionHeading id="included-heading" title="What’s Included" subtitle="Everything you need to bring your event to life." level="h1" />
          <div className="pricing-inclusion-grid">
            {inclusions.map(({ title, description, icon: Icon }) => (
              <article className="pricing-inclusion" key={title}>
                <Icon aria-hidden="true" className="pricing-inclusion-icon" strokeWidth={1.25} />
                <h2>{title}</h2>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-section pricing-rates" aria-labelledby="rental-pricing-heading">
        <div className="pricing-container">
          <SectionHeading id="rental-pricing-heading" title="Venue Rental Pricing" subtitle="Choose the day and time that works best for your event." />
          <div className="pricing-day-grid">
            {pricingDays.map(({ day, options, additionalTime }, index) => {
              const Icon: LucideIcon = index % 2 === 0 ? Crown : Star
              return (
              <article className="pricing-day" key={day}>
                <Icon aria-hidden="true" className="pricing-day-icon" strokeWidth={1.25} />
                <h2>{day}</h2>
                <div className="pricing-day-rule" aria-hidden="true"><span /></div>
                <div className="pricing-options">
                  {options.map((option) => (
                    <div className="pricing-option" key={option.label}>
                      <p className="pricing-option-label">{option.label}</p>
                      <p className="pricing-option-time">{option.time}</p>
                      <p className="pricing-option-price">{option.price}</p>
                      {option.note ? <p className="pricing-option-note">{option.note}</p> : null}
                    </div>
                  ))}
                </div>
                {additionalTime ? <div className="pricing-additional"><p>Additional time</p><strong>{additionalTime}</strong></div> : null}
              </article>
              )
            })}
          </div>
          <div className="pricing-cta">
            <CalendarDays aria-hidden="true" className="pricing-cta-icon" strokeWidth={1.25} />
            <div className="pricing-cta-copy"><h2>Ready to plan your event?</h2><p>Check availability and book your tour.</p></div>
            <Link href="/tour#tour-availability" data-conversion="tour_cta_click" data-conversion-label="Pricing page" className="pricing-cta-link">
              Check availability <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <p className="pricing-disclaimer">{feeDisclosure}</p>
        </div>
      </section>
    </main>
  )
}
