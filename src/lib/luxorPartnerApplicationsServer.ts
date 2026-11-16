import 'server-only'

import {
  LUXOR_CHRISTMAS_MARKET_EVENT_SLUG,
  LUXOR_MARKET_VENDOR_CATEGORIES,
  LUXOR_MARKET_VENDOR_DISPLAY_OPTIONS,
  LUXOR_MARKET_VENDOR_SPACES,
  type LuxorMarketVendorSpaceKey,
  type LuxorPartnerApplicationStatus,
  type LuxorPartnerApplicationType,
  type LuxorPartnerPaymentStatus,
} from '@/lib/luxorPartnerApplicationTypes'
import {
  inspectLuxorPartnerApplicationPhoto,
  LUXOR_PARTNER_PHOTO_MAX_COUNT,
  LUXOR_PARTNER_PHOTO_MIN_COUNT,
  luxorPartnerApplicationPhotoPath,
  removeLuxorPartnerApplicationPhoto,
  uploadLuxorPartnerApplicationPhoto,
} from '@/lib/luxorPartnerApplicationPhotosServer'
import { postgrestSchemaUnavailable } from '@/lib/luxorPostgrestSchema'
import { supabaseRest, supabaseRestStrict } from '@/lib/supabaseRestServer'

export type LuxorPartnerApplicationRow = {
  id: string
  created_at: string
  updated_at: string
  application_type: LuxorPartnerApplicationType
  event_id: string | null
  status: LuxorPartnerApplicationStatus
  payment_status: LuxorPartnerPaymentStatus | null
  business_name: string
  contact_name: string
  email: string
  phone: string
  instagram_handle: string | null
  city: string | null
  website_url: string | null
  vendor_category: string | null
  selected_space: LuxorMarketVendorSpaceKey | null
  selected_space_price_cents: number | null
  requires_electricity: boolean | null
  additional_displays: unknown
  answers: Record<string, unknown>
  internal_notes: string | null
  submission_key: string
}

export type LuxorPartnerApplicationFileRow = {
  id: string
  application_id: string
  storage_path: string
  file_name: string
  content_type: string
  size_bytes: number
  sort_order: number
}

export type LuxorMarketEventRow = {
  id: string
  slug: string
  title: string
  event_date: string
  location: string
}

const applicationSelect =
  'id,created_at,updated_at,application_type,event_id,status,payment_status,business_name,contact_name,email,phone,instagram_handle,city,website_url,vendor_category,selected_space,selected_space_price_cents,requires_electricity,additional_displays,answers,internal_notes,submission_key'

const fileSelect = 'id,application_id,storage_path,file_name,content_type,size_bytes,sort_order'

export function partnerApplicationsSchemaUnavailable(error: unknown) {
  return postgrestSchemaUnavailable(error)
}

export async function getLuxorMarketEventBySlug(slug: string) {
  const [row] = await supabaseRestStrict<LuxorMarketEventRow[]>(
    `luxor_market_events?select=id,slug,title,event_date,location&slug=eq.${encodeURIComponent(slug)}&limit=1`,
  )
  return row ?? null
}

export async function getLuxorPartnerApplicationBySubmissionKey(submissionKey: string) {
  const [row] = await supabaseRestStrict<LuxorPartnerApplicationRow[]>(
    `${'luxor_partner_applications'}?select=${applicationSelect}&submission_key=eq.${encodeURIComponent(submissionKey)}&limit=1`,
  )
  return row ?? null
}

export async function listLuxorPartnerApplications(options?: {
  type?: LuxorPartnerApplicationType | 'all'
  search?: string
  limit?: number
}) {
  const params = [`select=${applicationSelect}`, 'order=created_at.desc']
  if (options?.type && options.type !== 'all') {
    params.push(`application_type=eq.${encodeURIComponent(options.type)}`)
  }
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000)
  params.push(`limit=${limit}`)
  let rows = await supabaseRestStrict<LuxorPartnerApplicationRow[]>(`luxor_partner_applications?${params.join('&')}`)
  const query = options?.search?.trim().toLowerCase()
  if (query) {
    rows = rows.filter((row) => {
      const haystack = [
        row.business_name,
        row.contact_name,
        row.email,
        row.phone,
        row.city,
        row.vendor_category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }
  return rows
}

export async function getLuxorPartnerApplication(id: string) {
  const [row] = await supabaseRestStrict<LuxorPartnerApplicationRow[]>(
    `luxor_partner_applications?select=${applicationSelect}&id=eq.${encodeURIComponent(id)}&limit=1`,
  )
  return row ?? null
}

export async function listLuxorPartnerApplicationFiles(applicationId: string) {
  return supabaseRestStrict<LuxorPartnerApplicationFileRow[]>(
    `luxor_partner_application_files?select=${fileSelect}&application_id=eq.${encodeURIComponent(applicationId)}&order=sort_order.asc,created_at.asc`,
  )
}

export async function updateLuxorPartnerApplication(
  id: string,
  updates: Partial<Pick<LuxorPartnerApplicationRow, 'status' | 'payment_status' | 'internal_notes'>>,
) {
  const body: Record<string, unknown> = {}
  if (updates.status) body.status = updates.status
  if (updates.payment_status !== undefined) body.payment_status = updates.payment_status
  if (updates.internal_notes !== undefined) body.internal_notes = updates.internal_notes
  if (!Object.keys(body).length) return getLuxorPartnerApplication(id)
  const [row] = await supabaseRestStrict<LuxorPartnerApplicationRow[]>(
    `luxor_partner_applications?select=${applicationSelect}&id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) },
  )
  return row ?? null
}

function normalizeInstagram(handle: string) {
  const trimmed = handle.trim().replace(/^@+/, '')
  return trimmed.slice(0, 80)
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) throw new Error('Enter a valid phone number.')
  return phone.trim().slice(0, 40)
}

function parseYesNo(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'yes' || normalized === 'true') return true
  if (normalized === 'no' || normalized === 'false') return false
  throw new Error('Choose whether you require electricity.')
}

export type MarketVendorSubmitInput = {
  businessName: string
  contactName: string
  email: string
  phone: string
  instagramHandle: string
  city: string
  websiteUrl?: string
  vendorCategory: string
  productDescription: string
  selectedSpace: LuxorMarketVendorSpaceKey
  requiresElectricity: boolean
  additionalDisplays: string[]
  guidelinesAcknowledged: boolean
  finalAcknowledged: boolean
  formStartedAt?: number
  submissionKey: string
  ipHash?: string
  userAgent?: string
  photos: File[]
}

export async function submitLuxorMarketVendorApplication(input: MarketVendorSubmitInput) {
  if (!input.guidelinesAcknowledged || !input.finalAcknowledged) {
    throw new Error('Confirm both acknowledgments before submitting.')
  }
  if (input.formStartedAt && Date.now() - input.formStartedAt < 800) {
    throw new Error('Please wait a moment and try again.')
  }

  const existing = await getLuxorPartnerApplicationBySubmissionKey(input.submissionKey)
  if (existing) return { application: existing, replayed: true as const }

  const event = await getLuxorMarketEventBySlug(LUXOR_CHRISTMAS_MARKET_EVENT_SLUG)
  if (!event) throw new Error('The Christmas Market is not accepting applications yet.')

  const businessName = input.businessName.trim()
  const contactName = input.contactName.trim()
  const email = input.email.trim().toLowerCase()
  const phone = normalizePhone(input.phone)
  const instagramHandle = normalizeInstagram(input.instagramHandle)
  const city = input.city.trim()
  const websiteUrl = input.websiteUrl?.trim() || null

  if (!businessName || businessName.length > 200) throw new Error('Enter your business name.')
  if (!contactName || contactName.length > 200) throw new Error('Enter a contact person.')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.')
  if (!instagramHandle) throw new Error('Enter your Instagram handle.')
  if (!city || city.length > 160) throw new Error('Enter your city.')
  if (websiteUrl && websiteUrl.length > 500) throw new Error('Shorten the website or social link.')

  if (!(LUXOR_MARKET_VENDOR_CATEGORIES as readonly string[]).includes(input.vendorCategory)) {
    throw new Error('Choose a vendor category.')
  }

  const productDescription = input.productDescription.trim()
  if (productDescription.length < 10 || productDescription.length > 4000) {
    throw new Error('Describe the products you intend to sell (at least 10 characters).')
  }

  const space = LUXOR_MARKET_VENDOR_SPACES[input.selectedSpace]
  if (!space) throw new Error('Choose a vendor space.')

  const displays = input.additionalDisplays.filter((item) =>
    (LUXOR_MARKET_VENDOR_DISPLAY_OPTIONS as readonly string[]).includes(item),
  )

  if (input.photos.length < LUXOR_PARTNER_PHOTO_MIN_COUNT || input.photos.length > LUXOR_PARTNER_PHOTO_MAX_COUNT) {
    throw new Error(`Upload ${LUXOR_PARTNER_PHOTO_MIN_COUNT}–${LUXOR_PARTNER_PHOTO_MAX_COUNT} photos.`)
  }

  const inspectedPhotos = []
  for (const photo of input.photos) {
    inspectedPhotos.push(await inspectLuxorPartnerApplicationPhoto(photo))
  }

  const applicationId = crypto.randomUUID()
  const uploadedPaths: string[] = []
  const fileRows: Array<{ id: string; storage_path: string; file_name: string; content_type: string; size_bytes: number; sort_order: number }> = []

  try {
    for (let index = 0; index < inspectedPhotos.length; index += 1) {
      const inspected = inspectedPhotos[index]
      const fileId = crypto.randomUUID()
      const storagePath = luxorPartnerApplicationPhotoPath(applicationId, fileId, inspected.safeName)
      await uploadLuxorPartnerApplicationPhoto(storagePath, inspected.bytes, inspected.contentType)
      uploadedPaths.push(storagePath)
      fileRows.push({
        id: fileId,
        storage_path: storagePath,
        file_name: inspected.safeName,
        content_type: inspected.contentType,
        size_bytes: inspected.bytes.length,
        sort_order: index,
      })
    }

    const answers = {
      product_description: productDescription,
      guidelines_acknowledged_at: new Date().toISOString(),
      final_acknowledgment_at: new Date().toISOString(),
      event_slug: LUXOR_CHRISTMAS_MARKET_EVENT_SLUG,
      event_title: event.title,
    }

    const [created] = await supabaseRestStrict<LuxorPartnerApplicationRow[]>(
      `luxor_partner_applications?select=${applicationSelect}`,
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          id: applicationId,
          application_type: 'market_vendor',
          event_id: event.id,
          status: 'new',
          payment_status: null,
          business_name: businessName,
          contact_name: contactName,
          email,
          phone,
          instagram_handle: instagramHandle,
          city,
          website_url: websiteUrl,
          vendor_category: input.vendorCategory,
          selected_space: input.selectedSpace,
          selected_space_price_cents: space.priceCents,
          requires_electricity: input.requiresElectricity,
          additional_displays: displays,
          answers,
          internal_notes: null,
          submission_key: input.submissionKey,
          ip_hash: input.ipHash || null,
          user_agent: input.userAgent || null,
        }),
      },
    )

    if (!created) throw new Error('Unable to save your application.')

    for (const file of fileRows) {
      await supabaseRestStrict(`luxor_partner_application_files`, {
        method: 'POST',
        body: JSON.stringify({
          id: file.id,
          application_id: applicationId,
          storage_path: file.storage_path,
          file_name: file.file_name,
          content_type: file.content_type,
          size_bytes: file.size_bytes,
          sort_order: file.sort_order,
        }),
      })
    }

    return { application: created, replayed: false as const }
  } catch (error) {
  await Promise.all(uploadedPaths.map((path) => removeLuxorPartnerApplicationPhoto(path)))
    throw error
  }
}

export function parseMarketVendorFormData(form: FormData) {
  const get = (key: string) => String(form.get(key) || '').trim()
  const displays = form
    .getAll('additionalDisplays')
    .map((value) => String(value).trim())
    .filter(Boolean)
  const photos = form
    .getAll('photos')
    .filter((value): value is File => value instanceof File && value.size > 0)

  return {
    businessName: get('businessName'),
    contactName: get('contactName'),
    email: get('email'),
    phone: get('phone'),
    instagramHandle: get('instagramHandle'),
    city: get('city'),
    websiteUrl: get('websiteUrl'),
    vendorCategory: get('vendorCategory'),
    productDescription: get('productDescription'),
    selectedSpace: get('selectedSpace') as LuxorMarketVendorSpaceKey,
    requiresElectricity: parseYesNo(get('requiresElectricity')),
    additionalDisplays: displays,
    guidelinesAcknowledged: form.get('guidelinesAcknowledged') === 'true',
    finalAcknowledged: form.get('finalAcknowledged') === 'true',
    formStartedAt: Number(form.get('formStartedAt') || 0) || undefined,
    websiteHoneypot: get('website'),
    photos,
  }
}