'use client'

import { FormEvent, useState } from 'react'
import { Check, Loader2, Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function LuxorContactForm({
  locale = 'en',
  className = '',
}: {
  locale?: 'en' | 'es'
  className?: string
}) {
  const spanish = locale === 'es'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!fullName.trim()) {
      setError(spanish ? 'Por favor ingresa tu nombre completo.' : 'Please enter your full name.')
      return
    }

    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(spanish ? 'Por favor ingresa un correo electrónico válido.' : 'Please enter a valid email address.')
      return
    }

    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
      setError(spanish ? 'Por favor ingresa un número de teléfono válido (10 dígitos).' : 'Please enter a valid 10-digit phone number.')
      return
    }

    if (!message.trim()) {
      setError(spanish ? 'Por favor escribe tu mensaje o consulta.' : 'Please write your message or question.')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        message: message.trim(),
        eventType: 'Private celebration',
        source: 'contact_page',
        flow: 'contact_form',
        pagePath: typeof window === 'undefined' ? '/contact' : window.location.pathname,
        metadata: {
          contactFormSubmittedAt: new Date().toISOString(),
          locale,
        },
      }

      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) {
        throw new Error(data.error || (spanish ? 'No se pudo enviar tu mensaje. Inténtalo de nuevo.' : 'Unable to submit your message. Please try again.'))
      }

      setSubmitted(true)

      try {
        const { trackLuxorPublicEvent } = await import('@/lib/luxorPublicAttribution')
        trackLuxorPublicEvent('contact_submitted', {
          source: 'contact_page',
          locale,
        })
      } catch {
        // Non-blocking
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (spanish ? 'Ocurrió un error. Inténtalo de nuevo.' : 'An error occurred. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`rounded-2xl border border-[#b98a3d]/30 bg-white p-6 sm:p-8 shadow-[0_25px_80px_-44px_rgba(56,38,20,0.4)] ${className}`}>
      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="contact-confirmation"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-center py-8"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#b98a3d] bg-[#faf6ef] text-[#8d672b]">
              <Check className="h-7 w-7 stroke-[2.5]" />
            </div>

            <h3 className="mt-4 font-serif text-3xl font-semibold text-[#241d17]">
              {spanish ? '¡Gracias por contactarnos!' : 'Thank You for Reaching Out!'}
            </h3>

            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#665a4e]">
              {spanish
                ? 'Hemos recibido tu mensaje. Nuestro equipo de coordinación te responderá a la brevedad posible.'
                : 'We’ve received your message. Our event coordination team will follow up with you promptly.'}
            </p>

            <div className="mt-6 pt-6 border-t border-[#b98a3d]/20">
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false)
                  setFullName('')
                  setEmail('')
                  setPhone('')
                  setMessage('')
                }}
                className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8d672b] underline underline-offset-4 hover:text-[#5f441b]"
              >
                {spanish ? 'Enviar otro mensaje' : 'Send another message'}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="contact-form-body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#241d17]">
              {spanish ? 'Envíanos un mensaje' : 'Send us a message'}
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[#665a4e]">
              {spanish
                ? 'Completa el formulario y nos comunicaremos contigo de inmediato.'
                : 'Fill out the form below and we’ll get back to you promptly.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Full Name */}
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                  {spanish ? 'Nombre completo *' : 'Full Name *'}
                </span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={spanish ? 'Tu nombre y apellido' : 'First and last name'}
                  className="min-h-12 w-full rounded-xl border border-[#d8c4a4] bg-[#fffdfa] px-3.5 text-sm text-[#241d17] outline-none transition placeholder:text-[#8b7b6b] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#b98a3d]/15"
                />
              </label>

              {/* Email & Phone Grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                    {spanish ? 'Correo electrónico *' : 'Email Address *'}
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={spanish ? 'tunombre@ejemplo.com' : 'you@example.com'}
                    className="min-h-12 w-full rounded-xl border border-[#d8c4a4] bg-[#fffdfa] px-3.5 text-sm text-[#241d17] outline-none transition placeholder:text-[#8b7b6b] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#b98a3d]/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                    {spanish ? 'Teléfono *' : 'Phone Number *'}
                  </span>
                  <input
                    type="tel"
                    required
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    placeholder="(210) 555-5555"
                    className="min-h-12 w-full rounded-xl border border-[#d8c4a4] bg-[#fffdfa] px-3.5 text-sm text-[#241d17] outline-none transition placeholder:text-[#8b7b6b] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#b98a3d]/15"
                  />
                </label>
              </div>

              {/* Message */}
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d672b]">
                  {spanish ? 'Mensaje *' : 'Message *'}
                </span>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={spanish ? '¿En qué podemos ayudarte?' : 'How can we help you?'}
                  className="w-full rounded-xl border border-[#d8c4a4] bg-[#fffdfa] p-3.5 text-sm text-[#241d17] outline-none transition placeholder:text-[#8b7b6b] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#b98a3d]/15"
                />
              </label>

              {/* Error alert */}
              {error && (
                <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800">
                  {error}
                </div>
              )}

              {/* Submit CTA */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#b98a3d] px-6 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-[#9d722e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{spanish ? 'Enviando...' : 'Sending...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>{spanish ? 'Enviar mensaje' : 'Send Message'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
