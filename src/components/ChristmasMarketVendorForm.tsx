'use client'

import Link from 'next/link'
import { FormEvent, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckCircle2,
  ClipboardList,
  Image as ImageIcon,
  Loader2,
  Building,
  Grid,
  Tag,
  Zap,
  Upload,
  XCircle,
} from '@/lib/icons/phosphor-compat'
import { focusPublicConfirmation } from '@/lib/focusPublicConfirmation'
import {
  LUXOR_MARKET_VENDOR_CATEGORIES,
  LUXOR_MARKET_VENDOR_DISPLAY_OPTIONS,
  LUXOR_MARKET_VENDOR_SPACES,
  type LuxorMarketVendorSpaceKey,
} from '@/lib/luxorPartnerApplicationTypes'

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

const fieldClass =
  'w-full min-h-11 rounded-xl border border-[#caa24c]/25 bg-white px-4 py-2.5 text-sm text-[#241d17] outline-none transition placeholder:text-[#998a7a] focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/15'

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.14em] text-[#8d672b]'

export function ChristmasMarketVendorForm() {
  const formStartedAt = useMemo(() => Date.now(), [])
  const submissionKeyRef = useRef(crypto.randomUUID())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null)

  const [selectedSpace, setSelectedSpace] = useState<LuxorMarketVendorSpaceKey | ''>('')
  const [requiresElectricity, setRequiresElectricity] = useState('')
  const [additionalDisplays, setAdditionalDisplays] = useState<string[]>([])
  const [guidelinesAcknowledged, setGuidelinesAcknowledged] = useState(false)
  const [finalAcknowledged, setFinalAcknowledged] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleDisplay(option: string) {
    setAdditionalDisplays((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    )
  }

  function onPhotoChange(files: FileList | null) {
    if (!files) return
    const next = Array.from(files).slice(0, 4)
    setPhotos(next)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!guidelinesAcknowledged || !finalAcknowledged) {
      setError('Confirm both acknowledgments before submitting.')
      return
    }
    if (!selectedSpace) {
      setError('Choose a vendor space.')
      return
    }
    if (!requiresElectricity) {
      setError('Choose whether you require electricity.')
      return
    }
    if (photos.length < 2 || photos.length > 4) {
      setError('Upload 2–4 product or booth photos.')
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('selectedSpace', selectedSpace)
    formData.set('requiresElectricity', requiresElectricity)
    formData.set('guidelinesAcknowledged', guidelinesAcknowledged ? 'true' : 'false')
    formData.set('finalAcknowledged', finalAcknowledged ? 'true' : 'false')
    formData.set('formStartedAt', String(formStartedAt))
    formData.set('submissionKey', submissionKeyRef.current)
    formData.delete('photos')
    photos.forEach((file) => formData.append('photos', file))
    additionalDisplays.forEach((item) => formData.append('additionalDisplays', item))

    setSubmitting(true)
    try {
      const response = await fetch('/api/public/partner-applications/market-vendor', {
        method: 'POST',
        headers: { 'Idempotency-Key': submissionKeyRef.current },
        body: formData,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : 'Unable to submit your application.')
      }
      setSubmitted(true)
      focusPublicConfirmation(confirmationHeadingRef.current)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit your application.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <section
        id="application-confirmation"
        className="mx-auto max-w-2xl rounded-2xl border border-[#caa24c]/30 bg-white px-6 py-12 text-center shadow-sm sm:px-10"
      >
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#8d672b]" aria-hidden />
        <h2 ref={confirmationHeadingRef} tabIndex={-1} className="mt-4 font-serif text-3xl text-[#241d17]">
          Application received
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#665a4e]">
          Thank you for applying to the Luxor Christmas Market. Your submission is pending review. Luxor will follow up
          after your application has been reviewed.
        </p>
        <Link href="/work-with-us" className="mt-8 inline-flex text-sm font-semibold text-[#8d672b] hover:underline">
          Back to Work With Us
        </Link>
      </section>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10" noValidate>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="sr-only" aria-hidden />

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8" aria-labelledby="vendor-guidelines-heading">
        <div className="flex items-start gap-3">
          <GiftIconPlaceholder />
          <div className="min-w-0 flex-1">
            <h2 id="vendor-guidelines-heading" className="font-serif text-2xl uppercase tracking-[0.12em] text-[#241d17]">
              Vendor Guidelines
            </h2>
            <p className="mt-2 text-sm text-[#665a4e]">Please review the guidelines below before completing your application.</p>
          </div>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          <GuidelineItem icon={<Building className="h-5 w-5" />} text="All food items must be premade, properly packaged, and ready for sale." />
          <GuidelineItem
            icon={<XCircle className="h-5 w-5" />}
            text="No on-site cooking, baking, or food preparation is permitted."
          />
          <GuidelineItem icon={<XCircle className="h-5 w-5" />} text="No sales or distribution of alcoholic beverages are allowed." />
        </ul>

        <ul className="mt-6 grid gap-2 text-sm text-[#665a4e] sm:grid-cols-2">
          {[
            'Vendors must provide their own tables, chairs, tablecloths, and displays.',
            'Electricity is limited and must be requested in advance.',
            'All displays must remain within your assigned space.',
            'Vendor applications are subject to approval by Luxor management.',
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8d672b]" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="luxor-deco-divider text-[#caa24c]">
        <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#8d672b]">Vendor Application</span>
      </div>

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8">
        <header className="mb-6 flex items-center gap-2 text-[#8d672b]">
          <Building className="h-5 w-5" aria-hidden />
          <h2 className="font-serif text-xl text-[#241d17]">Business Information</h2>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-1">
            <span className={labelClass}>Business Name *</span>
            <input required name="businessName" className={`mt-2 ${fieldClass}`} maxLength={200} />
          </label>
          <label className="block sm:col-span-1">
            <span className={labelClass}>Contact Person *</span>
            <input required name="contactName" className={`mt-2 ${fieldClass}`} maxLength={200} />
          </label>
          <label className="block">
            <span className={labelClass}>Email Address *</span>
            <input required type="email" name="email" className={`mt-2 ${fieldClass}`} maxLength={320} />
          </label>
          <label className="block">
            <span className={labelClass}>Phone Number *</span>
            <input
              required
              name="phone"
              className={`mt-2 ${fieldClass}`}
              inputMode="tel"
              onChange={(event) => {
                event.target.value = formatPhoneNumber(event.target.value)
              }}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Instagram Handle *</span>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#998a7a]">@</span>
              <input required name="instagramHandle" className={`${fieldClass} pl-8`} maxLength={80} />
            </div>
          </label>
          <label className="block">
            <span className={labelClass}>City *</span>
            <input required name="city" placeholder="San Antonio, TX" className={`mt-2 ${fieldClass}`} maxLength={160} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClass}>Website or Social Media Link</span>
            <input name="websiteUrl" type="url" className={`mt-2 ${fieldClass}`} maxLength={500} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8">
        <header className="mb-6 flex items-center gap-2 text-[#8d672b]">
          <Tag className="h-5 w-5" aria-hidden />
          <h2 className="font-serif text-xl text-[#241d17]">Vendor Details</h2>
        </header>
        <label className="block">
          <span className={labelClass}>Vendor Category *</span>
          <select required name="vendorCategory" className={`mt-2 ${fieldClass}`} defaultValue="">
            <option value="" disabled>
              Select a category
            </option>
            {LUXOR_MARKET_VENDOR_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block">
          <span className={labelClass}>Describe the products you intend to sell *</span>
          <textarea
            required
            name="productDescription"
            rows={5}
            className={`mt-2 ${fieldClass}`}
            maxLength={4000}
          />
        </label>

        <div className="mt-6">
          <p className={labelClass}>Upload Photos (2–4) *</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#caa24c]/45 bg-[#faf5ec] px-4 py-8 text-sm text-[#665a4e] transition hover:border-[#caa24c]/70"
          >
            <Upload className="h-6 w-6 text-[#8d672b]" aria-hidden />
            <span>Drag and drop files here, or click to upload.</span>
            <span className="text-xs">PNG, JPG, or HEIC (max 10MB each)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif"
            multiple
            className="sr-only"
            onChange={(event) => onPhotoChange(event.target.files)}
          />
          {photos.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-[#665a4e]">
              {photos.map((file) => (
                <li key={`${file.name}-${file.size}`} className="flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5 text-[#8d672b]" aria-hidden />
                  {file.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8">
        <header className="mb-2 flex items-center gap-2 text-[#8d672b]">
          <Grid className="h-5 w-5" aria-hidden />
          <h2 className="font-serif text-xl text-[#241d17]">Vendor Space Selection</h2>
        </header>
        <p className="mb-6 text-sm text-[#665a4e]">
          Vendors provide their own tables and chairs. The dimensions below describe approximate space allocation, not
          tables provided by Luxor.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {(Object.keys(LUXOR_MARKET_VENDOR_SPACES) as LuxorMarketVendorSpaceKey[]).map((key) => {
            const space = LUXOR_MARKET_VENDOR_SPACES[key]
            const selected = selectedSpace === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedSpace(key)}
                className={`relative flex h-full flex-col rounded-2xl border p-5 text-left transition ${
                  selected
                    ? 'border-[#caa24c] bg-[#fff8ea] ring-2 ring-[#caa24c]/25'
                    : 'border-[#caa24c]/25 bg-white hover:border-[#caa24c]/45'
                }`}
                aria-pressed={selected}
              >
                {key === 'double' ? (
                  <span className="absolute right-4 top-4 rounded-full bg-[#caa24c] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Best Value
                  </span>
                ) : null}
                <p className="font-serif text-lg text-[#241d17]">{space.label}</p>
                <p className="mt-1 text-sm text-[#665a4e]">{space.description}</p>
                <p className="mt-4 font-serif text-2xl text-[#8d672b]">${space.priceCents / 100}</p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8">
        <header className="mb-6 flex items-center gap-2 text-[#8d672b]">
          <Zap className="h-5 w-5" aria-hidden />
          <h2 className="font-serif text-xl text-[#241d17]">Additional Information</h2>
        </header>
        <label className="block max-w-sm">
          <span className={labelClass}>Will you require electricity?</span>
          <select
            required
            value={requiresElectricity}
            onChange={(event) => setRequiresElectricity(event.target.value)}
            className={`mt-2 ${fieldClass}`}
          >
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <fieldset className="mt-6">
          <legend className={labelClass}>Will you bring additional displays?</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {LUXOR_MARKET_VENDOR_DISPLAY_OPTIONS.map((option) => {
              const checked = additionalDisplays.includes(option)
              return (
                <label
                  key={option}
                  className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                    checked ? 'border-[#caa24c] bg-[#fff8ea]' : 'border-[#caa24c]/25 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-[#caa24c]"
                    checked={checked}
                    onChange={() => toggleDisplay(option)}
                  />
                  {option}
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8">
        <header className="mb-4 flex items-center gap-2 text-[#8d672b]">
          <ClipboardList className="h-5 w-5" aria-hidden />
          <h2 className="font-serif text-xl text-[#241d17]">Acknowledgment</h2>
        </header>
        <label className="flex items-start gap-3 text-sm leading-6 text-[#665a4e]">
          <input
            type="checkbox"
            className="mt-1 accent-[#caa24c]"
            checked={guidelinesAcknowledged}
            onChange={(event) => setGuidelinesAcknowledged(event.target.checked)}
          />
          <span>
            I have read and agree to the{' '}
            <a href="#vendor-guidelines-heading" className="font-semibold text-[#8d672b] underline">
              Vendor Guidelines
            </a>
            , including the food, cooking, and alcohol restrictions.
          </span>
        </label>
        <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-[#665a4e]">
          <input
            type="checkbox"
            className="mt-1 accent-[#caa24c]"
            checked={finalAcknowledged}
            onChange={(event) => setFinalAcknowledged(event.target.checked)}
          />
          <span>I confirm this information is accurate and understand approval is required before securing a market space.</span>
        </label>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-300/50 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <div className="text-center">
        <button
          type="submit"
          disabled={submitting}
          className="luxor-gold-raised inline-flex min-h-12 min-w-[min(100%,16rem)] items-center justify-center gap-2 rounded-md px-8 py-3 text-sm font-semibold uppercase tracking-[0.16em] disabled:opacity-70"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Submitting…
            </>
          ) : (
            'Submit Application'
          )}
        </button>
      </div>
    </form>
  )
}

function GuidelineItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="rounded-xl border border-[#caa24c]/18 bg-[#faf5ec] px-4 py-3 text-sm leading-6 text-[#665a4e]">
      <div className="mb-2 text-[#8d672b]">{icon}</div>
      {text}
    </li>
  )
}

function GiftIconPlaceholder() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-[#faf5ec] text-[#8d672b]">
      <Tag className="h-5 w-5" aria-hidden />
    </span>
  )
}