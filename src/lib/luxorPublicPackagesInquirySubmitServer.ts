import 'server-only'

import {
  calculatePublicPackagesQuote,
  publicPackagesSelectionForProposalConversion,
  type PublicPackagesConfiguratorInput,
} from '@/lib/luxorPublicPackagesConfigurator'
import {
  decodePackagesDraftToken,
  getPackagesInquiryDraft,
  attachPackagesDraftToInquiry,
} from '@/lib/luxorPublicPackagesInquiryDraftServer'
import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { createLuxorInquiry, findRecentDuplicateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { LUXOR_INQUIRY_PACKAGE_INTEREST_OPTIONS, type LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import { hashPublicRequestIp } from '@/lib/luxorPublicEventsServer'

const PACKAGE_LABELS: Record<string, string> = {
  essentials: 'Essentials',
  signature: 'Signature',
  luxor: 'Luxor',
}

function packageInterestLabel(packageTierId: string) {
  const match = LUXOR_INQUIRY_PACKAGE_INTEREST_OPTIONS.find((item) => item.value.toLowerCase() === packageTierId)
  return match?.label || PACKAGE_LABELS[packageTierId] || packageTierId
}

export async function submitPublicPackagesInquiry(input: {
  draftToken: string
  firstName: string
  lastName: string
  email: string
  phone: string
  emailInquiryOptIn?: boolean
  smsOptIn?: boolean
  smsMarketingOptIn?: boolean
  marketingOptIn?: boolean
  locale?: 'en' | 'es'
  pagePath?: string
  sessionId?: string
  formStartedAt?: number
  userAgent?: string
  idempotencyKey?: string
  ipHash?: string
  isTest?: boolean
}) {
  const token = decodePackagesDraftToken(input.draftToken)
  if (!token) throw new Error('Your event configuration expired. Return to Packages and build your event again.')

  const draft = await getPackagesInquiryDraft(token.draftId)
  if (!draft) throw new Error('Your event configuration expired. Return to Packages and build your event again.')

  const configuratorInput = draft.configurator_input as PublicPackagesConfiguratorInput
  const pricing = await getDefaultLuxorProposalPricing()
  const quote = calculatePublicPackagesQuote(configuratorInput, pricing.config, pricing.version)
  if (quote.errors.length || quote.totals.totalEstimate === null) {
    throw new Error(quote.errors[0] || 'Pricing is unavailable for the saved configuration.')
  }

  const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`.replace(/\s+/g, ' ').trim()
  const packageInterest = packageInterestLabel(configuratorInput.packageTierId)
  const payload: LuxorInquiryInput = {
    fullName,
    email: input.email.trim(),
    phone: input.phone.trim(),
    eventType: configuratorInput.eventType || undefined,
    targetDate: configuratorInput.eventDate,
    guestCount: String(configuratorInput.guestCount),
    packageInterest,
    message: 'Website packages configurator inquiry.',
    source: 'website_packages',
    flow: 'packages_event_inquiry',
    emailInquiryOptIn: input.emailInquiryOptIn,
    smsOptIn: input.smsOptIn,
    smsMarketingOptIn: input.smsMarketingOptIn,
    marketingOptIn: input.marketingOptIn,
    formStartedAt: input.formStartedAt,
    sessionId: input.sessionId,
    pagePath: input.pagePath,
    metadata: {
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      websiteLocale: input.locale || draft.locale,
      packagesConfigurator: {
        ...publicPackagesSelectionForProposalConversion(quote),
        configurator_input: configuratorInput,
        draft_id: draft.id,
        rental_period: configuratorInput.rentalPeriod,
        event_type: configuratorInput.eventType,
      },
      ...(input.isTest ? { is_test_record: true } : {}),
    },
  }

  if (input.idempotencyKey) {
    const duplicate = await findRecentDuplicateLuxorInquiry({
      ...payload,
      metadata: { ...payload.metadata, idempotencyKey: input.idempotencyKey },
    }, 30)
    if (duplicate) return { inquiry: duplicate, replayed: true, quote }
  }

  const bookingOptions: { idempotencyKey?: string; replayed?: boolean } = {}
  if (input.idempotencyKey) bookingOptions.idempotencyKey = input.idempotencyKey

  if (input.isTest) {
    payload.metadata = {
      ...payload.metadata,
      is_test_record: true,
      submittedFrom: 'packages_configurator_test',
    }
  }

  const inquiry = await createLuxorInquiry(payload, input.userAgent, bookingOptions)
  if (inquiry?.id) await attachPackagesDraftToInquiry(draft.id, inquiry.id)

  return {
    inquiry,
    replayed: Boolean(bookingOptions.replayed),
    quote,
  }
}

export function packagesInquiryTestIpHash() {
  return hashPublicRequestIp('packages-configurator-test')
}
