'use client'

import Link from 'next/link'
import { FormEvent, useId, useMemo, useRef, useState } from 'react'
import { LuxorPublicCheckboxField } from '@/components/LuxorPublicCheckbox'
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

const fieldClassBase =
  'w-full min-h-11 rounded-xl border bg-white px-4 py-2.5 text-sm text-[#241d17] outline-none transition placeholder:text-[#998a7a] focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/15'

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.14em] text-[#8d672b]'

type MarketVendorField =
  | 'businessName'
  | 'contactName'
  | 'email'
  | 'phone'
  | 'instagramHandle'
  | 'city'
  | 'vendorCategory'
  | 'productDescription'
  | 'guidelinesAcknowledged'
  | 'finalAcknowledged'

const VALIDATION_FIELD_ORDER: MarketVendorField[] = [
  'guidelinesAcknowledged',
  'businessName',
  'contactName',
  'email',
  'phone',
  'instagramHandle',
  'city',
  'vendorCategory',
  'productDescription',
  'finalAcknowledged',
]

function fieldInputClass(hasError: boolean) {
  return `${fieldClassBase} ${hasError ? 'border-rose-400/80 ring-2 ring-rose-200/80' : 'border-[#caa24c]/25'}`
}

function InlineFieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs leading-5 text-rose-900">
      {message}
    </p>
  )
}

export function ChristmasMarketVendorForm() {
  const baseId = useId()
  const fieldIds = {
    guidelinesAck: `${baseId}-guidelines-ack`,
    finalAck: `${baseId}-final-ack`,
    businessName: `${baseId}-business-name`,
    contactName: `${baseId}-contact-name`,
    email: `${baseId}-email`,
    phone: `${baseId}-phone`,
    instagramHandle: `${baseId}-instagram`,
    city: `${baseId}-city`,
    vendorCategory: `${baseId}-vendor-category`,
    productDescription: `${baseId}-product-description`,
  }

  const formStartedAt = useMemo(() => Date.now(), [])
  const submissionKeyRef = useRef(crypto.randomUUID())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const [selectedSpace, setSelectedSpace] = useState<LuxorMarketVendorSpaceKey | ''>('')
  const [requiresElectricity, setRequiresElectricity] = useState('')
  const [additionalDisplays, setAdditionalDisplays] = useState<string[]>([])
  const [guidelinesAcknowledged, setGuidelinesAcknowledged] = useState(false)
  const [finalAcknowledged, setFinalAcknowledged] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<MarketVendorField, string>>>({})

  function clearFieldError(key: MarketVendorField) {
    setFieldErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function toggleDisplay(option: string) {
    setAdditionalDisplays((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    )
  }

  function onPhotoChange(files: FileList | null) {
    if (!files) return
    setPhotos(Array.from(files).slice(0, 4))
  }

  function validateClientFields(form: HTMLFormElement) {
    const next: Partial<Record<MarketVendorField, string>> = {}
    const businessName = String(form.businessName?.value || '').trim()
    const contactName = String(form.contactName?.value || '').trim()
    const email = String(form.email?.value || '').trim()
    const phone = String(form.phone?.value || '').trim()
    const instagramHandle = String(form.instagramHandle?.value || '').trim()
    const city = String(form.city?.value || '').trim()
    const vendorCategory = String(form.vendorCategory?.value || '').trim()
    const productDescription = String(form.productDescription?.value || '').trim()

    if (!guidelinesAcknowledged) {
      next.guidelinesAcknowledged = 'Confirm that you have reviewed and agree to the Vendor Guidelines.'
    }
    if (!businessName) next.businessName = 'Enter your business name.'
    if (!contactName) next.contactName = 'Enter a contact person.'
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'Enter a valid email address.'
    }
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      next.phone = 'Enter a valid 10-digit phone number.'
    }
    if (!instagramHandle) next.instagramHandle = 'Enter your Instagram handle.'
    if (!city) next.city = 'Enter your city.'
    if (!vendorCategory) next.vendorCategory = 'Choose a vendor category.'
    if (productDescription.length < 10) {
      next.productDescription = 'Describe the products you intend to sell (at least 10 characters).'
    }
    if (!finalAcknowledged) {
      next.finalAcknowledged = 'Confirm the final acknowledgment before submitting.'
    }

    return next
  }

  function focusFirstInvalid(errors: Partial<Record<MarketVendorField, string>>) {
    const firstKey = VALIDATION_FIELD_ORDER.find((key) => errors[key])
    if (!firstKey || !formRef.current) return

    if (firstKey === 'guidelinesAcknowledged') {
      document.getElementById(fieldIds.guidelinesAck)?.focus()
      return
    }
    if (firstKey === 'finalAcknowledged') {
      document.getElementById(fieldIds.finalAck)?.focus()
      return
    }

    const control = formRef.current.elements.namedItem(firstKey)
    if (control instanceof HTMLElement) control.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setSummaryError(null)

    const validationErrors = validateClientFields(form)
    if (!selectedSpace) {
      setSummaryError('Choose a vendor space.')
      if (!Object.keys(validationErrors).length) {
        form.querySelector<HTMLButtonElement>('[data-space-option]')?.focus()
      }
    } else if (!requiresElectricity) {
      setSummaryError('Choose whether you require electricity.')
    } else if (photos.length < 2 || photos.length > 4) {
      setSummaryError('Upload 2–4 product or booth photos.')
    }

    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors)
      setSummaryError((current) => current || 'Please correct the highlighted fields.')
      focusFirstInvalid(validationErrors)
      return
    }

    if (!selectedSpace || !requiresElectricity || photos.length < 2 || photos.length > 4) {
      return
    }

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
      setSummaryError(submitError instanceof Error ? submitError.message : 'Unable to submit your application.')
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
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-10" noValidate>
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

        <div className="mt-6 border-t border-[#eadfce] pt-5">
          <LuxorPublicCheckboxField
            id={fieldIds.guidelinesAck}
            checked={guidelinesAcknowledged}
            onChange={(checked) => {
              setGuidelinesAcknowledged(checked)
              if (checked) clearFieldError('guidelinesAcknowledged')
            }}
            invalid={Boolean(fieldErrors.guidelinesAcknowledged)}
            errorId={`${fieldIds.guidelinesAck}-error`}
          >
            I have reviewed and agree to the Vendor Guidelines. <span className="font-semibold">Required</span>
          </LuxorPublicCheckboxField>
          <InlineFieldError id={`${fieldIds.guidelinesAck}-error`} message={fieldErrors.guidelinesAcknowledged} />
        </div>
      </section>

      <div className="flex items-center gap-3 text-[#caa24c]">
        <span className="h-px min-w-8 flex-1 bg-gradient-to-r from-transparent to-[#caa24c]/80" aria-hidden />
        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.22em] text-[#8d672b] sm:tracking-[0.35em]">
          Vendor Application
        </span>
        <span className="h-px min-w-8 flex-1 bg-gradient-to-l from-transparent to-[#caa24c]/80" aria-hidden />
      </div>

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8">
        <header className="mb-6 flex items-center gap-2 text-[#8d672b]">
          <Building className="h-5 w-5" aria-hidden />
          <h2 className="font-serif text-xl text-[#241d17]">Business Information</h2>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="block sm:col-span-1">
            <label htmlFor={fieldIds.businessName} className={labelClass}>
              Business Name *
            </label>
            <input
              id={fieldIds.businessName}
              name="businessName"
              className={`mt-2 ${fieldInputClass(Boolean(fieldErrors.businessName))}`}
              maxLength={200}
              aria-invalid={fieldErrors.businessName ? true : undefined}
              aria-describedby={fieldErrors.businessName ? `${fieldIds.businessName}-error` : undefined}
              onChange={() => clearFieldError('businessName')}
            />
            <InlineFieldError id={`${fieldIds.businessName}-error`} message={fieldErrors.businessName} />
          </div>
          <div className="block sm:col-span-1">
            <label htmlFor={fieldIds.contactName} className={labelClass}>
              Contact Person *
            </label>
            <input
              id={fieldIds.contactName}
              name="contactName"
              className={`mt-2 ${fieldInputClass(Boolean(fieldErrors.contactName))}`}
              maxLength={200}
              aria-invalid={fieldErrors.contactName ? true : undefined}
              aria-describedby={fieldErrors.contactName ? `${fieldIds.contactName}-error` : undefined}
              onChange={() => clearFieldError('contactName')}
            />
            <InlineFieldError id={`${fieldIds.contactName}-error`} message={fieldErrors.contactName} />
          </div>
          <div className="block">
            <label htmlFor={fieldIds.email} className={labelClass}>
              Email Address *
            </label>
            <input
              id={fieldIds.email}
              type="email"
              name="email"
              className={`mt-2 ${fieldInputClass(Boolean(fieldErrors.email))}`}
              maxLength={320}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? `${fieldIds.email}-error` : undefined}
              onChange={() => clearFieldError('email')}
            />
            <InlineFieldError id={`${fieldIds.email}-error`} message={fieldErrors.email} />
          </div>
          <div className="block">
            <label htmlFor={fieldIds.phone} className={labelClass}>
              Phone Number *
            </label>
            <input
              id={fieldIds.phone}
              name="phone"
              className={`mt-2 ${fieldInputClass(Boolean(fieldErrors.phone))}`}
              inputMode="tel"
              aria-invalid={fieldErrors.phone ? true : undefined}
              aria-describedby={fieldErrors.phone ? `${fieldIds.phone}-error` : undefined}
              onChange={(event) => {
                event.target.value = formatPhoneNumber(event.target.value)
                clearFieldError('phone')
              }}
            />
            <InlineFieldError id={`${fieldIds.phone}-error`} message={fieldErrors.phone} />
          </div>
          <div className="block">
            <label htmlFor={fieldIds.instagramHandle} className={labelClass}>
              Instagram Handle *
            </label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#998a7a]">@</span>
              <input
                id={fieldIds.instagramHandle}
                name="instagramHandle"
                className={`${fieldInputClass(Boolean(fieldErrors.instagramHandle))} pl-8`}
                maxLength={80}
                aria-invalid={fieldErrors.instagramHandle ? true : undefined}
                aria-describedby={fieldErrors.instagramHandle ? `${fieldIds.instagramHandle}-error` : undefined}
                onChange={() => clearFieldError('instagramHandle')}
              />
            </div>
            <InlineFieldError id={`${fieldIds.instagramHandle}-error`} message={fieldErrors.instagramHandle} />
          </div>
          <div className="block">
            <label htmlFor={fieldIds.city} className={labelClass}>
              City *
            </label>
            <input
              id={fieldIds.city}
              name="city"
              placeholder="San Antonio, TX"
              className={`mt-2 ${fieldInputClass(Boolean(fieldErrors.city))}`}
              maxLength={160}
              aria-invalid={fieldErrors.city ? true : undefined}
              aria-describedby={fieldErrors.city ? `${fieldIds.city}-error` : undefined}
              onChange={() => clearFieldError('city')}
            />
            <InlineFieldError id={`${fieldIds.city}-error`} message={fieldErrors.city} />
          </div>
          <label className="block sm:col-span-2">
            <span className={labelClass}>Website or Social Media Link</span>
            <input name="websiteUrl" type="url" className={`mt-2 ${fieldInputClass(false)}`} maxLength={500} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8">
        <header className="mb-6 flex items-center gap-2 text-[#8d672b]">
          <Tag className="h-5 w-5" aria-hidden />
          <h2 className="font-serif text-xl text-[#241d17]">Vendor Details</h2>
        </header>
        <div className="block">
          <label htmlFor={fieldIds.vendorCategory} className={labelClass}>
            Vendor Category *
          </label>
          <select
            id={fieldIds.vendorCategory}
            name="vendorCategory"
            className={`mt-2 ${fieldInputClass(Boolean(fieldErrors.vendorCategory))}`}
            defaultValue=""
            aria-invalid={fieldErrors.vendorCategory ? true : undefined}
            aria-describedby={fieldErrors.vendorCategory ? `${fieldIds.vendorCategory}-error` : undefined}
            onChange={() => clearFieldError('vendorCategory')}
          >
            <option value="" disabled>
              Select a category
            </option>
            {LUXOR_MARKET_VENDOR_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <InlineFieldError id={`${fieldIds.vendorCategory}-error`} message={fieldErrors.vendorCategory} />
        </div>
        <div className="mt-4 block">
          <label htmlFor={fieldIds.productDescription} className={labelClass}>
            Describe the products you intend to sell *
          </label>
          <textarea
            id={fieldIds.productDescription}
            name="productDescription"
            rows={5}
            className={`mt-2 ${fieldInputClass(Boolean(fieldErrors.productDescription))}`}
            maxLength={4000}
            aria-invalid={fieldErrors.productDescription ? true : undefined}
            aria-describedby={fieldErrors.productDescription ? `${fieldIds.productDescription}-error` : undefined}
            onChange={() => clearFieldError('productDescription')}
          />
          <InlineFieldError id={`${fieldIds.productDescription}-error`} message={fieldErrors.productDescription} />
        </div>

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
            const spaceLabel = `${space.label}, ${space.description}, $${space.priceCents / 100}`
            return (
              <button
                key={key}
                type="button"
                data-space-option
                onClick={() => setSelectedSpace(key)}
                className={`package-tier-option relative flex h-full flex-col rounded-2xl border p-5 text-left text-sm font-semibold transition ${
                  selected
                    ? 'border-[#caa24c] bg-[#caa24c]/16 text-[#241d17]'
                    : 'border-[#d8c4a4] bg-white text-[#665a4e]'
                }`}
                aria-pressed={selected}
                aria-label={spaceLabel}
              >
                {key === 'double' ? (
                  <span className="mb-3 inline-flex self-start rounded-full bg-[#caa24c] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Best Value
                  </span>
                ) : null}
                <p className="font-serif text-lg text-[#241d17]">{space.label}</p>
                <p className="mt-1 text-sm font-normal text-[#665a4e]">{space.description}</p>
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
            className={`mt-2 ${fieldInputClass(false)}`}
          >
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <fieldset className="mt-6">
          <legend className={labelClass}>Will you bring additional displays?</legend>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {LUXOR_MARKET_VENDOR_DISPLAY_OPTIONS.map((option) => (
              <li key={option}>
                <LuxorPublicCheckboxField
                  variant="tile"
                  checked={additionalDisplays.includes(option)}
                  onChange={() => toggleDisplay(option)}
                >
                  {option}
                </LuxorPublicCheckboxField>
              </li>
            ))}
          </ul>
        </fieldset>
      </section>

      <section className="rounded-2xl border border-[#caa24c]/25 bg-white p-6 sm:p-8">
        <header className="mb-4 flex items-center gap-2 text-[#8d672b]">
          <ClipboardList className="h-5 w-5" aria-hidden />
          <h2 className="font-serif text-xl text-[#241d17]">Final Acknowledgment</h2>
        </header>
        <LuxorPublicCheckboxField
          id={fieldIds.finalAck}
          checked={finalAcknowledged}
          onChange={(checked) => {
            setFinalAcknowledged(checked)
            if (checked) clearFieldError('finalAcknowledged')
          }}
          invalid={Boolean(fieldErrors.finalAcknowledged)}
          errorId={`${fieldIds.finalAck}-error`}
        >
          I confirm this information is accurate and understand approval is required before securing a market space.{' '}
          <span className="font-semibold">Required</span>
        </LuxorPublicCheckboxField>
        <InlineFieldError id={`${fieldIds.finalAck}-error`} message={fieldErrors.finalAcknowledged} />
      </section>

      {summaryError ? (
        <p role="alert" className="rounded-xl border border-rose-300/50 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {summaryError}
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