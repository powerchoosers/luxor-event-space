import type { Metadata } from 'next'
import Link from 'next/link'
import { Calendar, Mail, MapPin, Phone } from 'lucide-react'
import { LuxorContactForm } from '@/components/LuxorContactForm'
import { PublicPhoneLink } from '@/components/PublicPhoneLink'

export const metadata: Metadata = {
  title: 'Contacto | Luxor at Las Palmas Events',
  description: 'Contáctanos en Luxor at Las Palmas Events en San Antonio para preguntas sobre el lugar, disponibilidad o agendar una visita.',
  alternates: { canonical: '/es/contact', languages: { en: '/contact', es: '/es/contact' } },
}

const googleMapsUrl = 'https://maps.app.goo.gl/qQyX6MP98A9FNwvr6?g_st=ic'
const appleMapsUrl = 'https://maps.apple/p/SYUX3ViRAh0KJ2'

export default function SpanishContactPage() {
  return (
    <main className="min-h-screen bg-[#faf7f2] pt-28 text-[#241d17]">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        {/* Eyebrow and Page Heading */}
        <div className="max-w-3xl">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.32em] text-[#8d672b]">
            Contáctanos
          </p>
          <h1 className="mt-3 font-serif text-4xl sm:text-5xl lg:text-6xl text-[#241d17]">
            Estamos para ayudarte
          </h1>
          <p className="mt-4 text-base sm:text-lg text-[#665a4e] leading-relaxed">
            Si tienes preguntas sobre la capacidad del salón, opciones de banquete o estás planeando una celebración, nuestro equipo te atenderá con gusto.
          </p>
        </div>

        {/* 2-Column Content: Left Details & Map, Right Form */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:items-start">
          {/* Left Column: Contact Cards, Information & Map */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#b98a3d]/25 bg-white p-6 sm:p-8 shadow-sm">
              <h2 className="font-serif text-2xl font-semibold text-[#241d17]">
                Información de contacto
              </h2>
              <p className="mt-1 text-xs text-[#665a4e]">
                Comunícate directamente por teléfono, correo o agenda una visita en persona.
              </p>

              <div className="mt-6 space-y-4">
                {/* Phone */}
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faf5ec] text-[#b98a3d]">
                    <Phone size={18} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                      Teléfono
                    </p>
                    <PublicPhoneLink className="mt-0.5 inline-block text-sm font-semibold text-[#241d17] hover:text-[#8d672b] transition" />
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-3.5 border-t border-[#b98a3d]/15 pt-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#faf5ec] text-[#b98a3d]">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                      Correo electrónico
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
                      Dirección
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
                      Visitas privadas
                    </p>
                    <p className="mt-0.5 text-sm text-[#665a4e]">
                      Las visitas privadas y recorridos se realizan únicamente con cita previa.
                    </p>
                    <Link
                      href="/es/visit"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#8d672b] underline underline-offset-4 hover:text-[#5f441b]"
                    >
                      Agendar una visita ahora →
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Map Embed */}
            <div className="overflow-hidden rounded-2xl border border-[#b98a3d]/25 bg-white shadow-sm">
              <iframe
                title="Mapa de ubicación de Luxor at Las Palmas Events"
                src="https://www.google.com/maps?q=803+Castroville+Rd+%23402,+San+Antonio,+TX+78237&output=embed"
                className="h-64 w-full border-0 sm:h-72"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div>
            <LuxorContactForm locale="es" />
          </div>
        </div>
      </div>
    </main>
  )
}
