import type { Metadata } from 'next'
import Link from 'next/link'
import { Calendar, Mail, MapPin, Phone } from 'lucide-react'
import { LuxorContactForm } from '@/components/LuxorContactForm'
import { PublicPhoneLink } from '@/components/PublicPhoneLink'

export const metadata: Metadata = {
  title: 'Contact Us | Luxor at Las Palmas Events',
  description: 'Get in touch with Luxor at Las Palmas Events in San Antonio for venue inquiries, questions, or appointment scheduling.',
  alternates: { canonical: '/contact', languages: { en: '/contact', es: '/es/contact' } },
}

const googleMapsUrl = 'https://maps.app.goo.gl/qQyX6MP98A9FNwvr6?g_st=ic'
const appleMapsUrl = 'https://maps.apple/p/SYUX3ViRAh0KJ2'

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#faf7f2] pt-28 text-[#241d17]">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        {/* Eyebrow and Page Heading */}
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-[#8d672b]">
            Get In Touch
          </p>
          <h1 className="mt-3 font-serif text-4xl sm:text-5xl lg:text-6xl text-[#241d17]">
            We’d Love to Hear From You
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#665a4e] leading-relaxed">
            Whether you have questions about venue capacity, catering options, or are planning a celebration, our team is here to assist.
          </p>
        </div>

        {/* 2-Column Content: Left Details & Map, Right Form */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:items-start">
          {/* Left Column: Contact Cards, Information & Map */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#b98a3d]/25 bg-white p-6 sm:p-8 shadow-sm">
              <h2 className="font-serif text-2xl font-semibold text-[#241d17]">
                Contact Information
              </h2>
              <p className="mt-1 text-xs text-[#665a4e]">
                Reach out directly by phone, email, or schedule an in-person visit.
              </p>

              <div className="mt-6 space-y-4">
                {/* Phone */}
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faf5ec] text-[#b98a3d]">
                    <Phone size={18} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                      Phone
                    </p>
                    <PublicPhoneLink showIcon={false} className="mt-0.5 inline-block text-sm font-semibold text-[#241d17] hover:text-[#8d672b] transition" />
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-3.5 border-t border-[#b98a3d]/15 pt-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faf5ec] text-[#b98a3d]">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                      Email
                    </p>
                    <a
                      href="mailto:booking@luxoratlaspalmas.com"
                      className="mt-0.5 inline-block text-sm font-semibold text-[#241d17] hover:text-[#8d672b] transition"
                    >
                      booking@luxoratlaspalmas.com
                    </a>
                  </div>
                </div>

                {/* Address */}
                <div className="flex items-start gap-3.5 border-t border-[#b98a3d]/15 pt-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faf5ec] text-[#b98a3d]">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                      Address
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[#241d17]">
                      803 Castroville Rd #402, San Antonio, TX 78237
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[#8d672b] underline underline-offset-4 hover:text-[#5f441b]"
                      >
                        Google Maps
                      </a>
                      <span className="text-[#b98a3d]/40">•</span>
                      <a
                        href={appleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[#8d672b] underline underline-offset-4 hover:text-[#5f441b]"
                      >
                        Apple Maps
                      </a>
                    </div>
                  </div>
                </div>

                {/* Appointment Note */}
                <div className="flex items-start gap-3.5 border-t border-[#b98a3d]/15 pt-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faf5ec] text-[#b98a3d]">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                      Private Visits
                    </p>
                    <p className="mt-0.5 text-sm text-[#665a4e]">
                      Private venue walkthroughs and visits are available by appointment.
                    </p>
                    <Link
                      href="/visit"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#8d672b] underline underline-offset-4 hover:text-[#5f441b]"
                    >
                      Schedule a Visit Now →
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Map Embed */}
            <div className="overflow-hidden rounded-2xl border border-[#b98a3d]/25 bg-white shadow-sm">
              <iframe
                title="Luxor at Las Palmas Events location map"
                src="https://www.google.com/maps?q=803+Castroville+Rd+%23402,+San+Antonio,+TX+78237&output=embed"
                className="h-64 w-full border-0 sm:h-72"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div>
            <LuxorContactForm locale="en" />
          </div>
        </div>
      </div>
    </main>
  )
}
