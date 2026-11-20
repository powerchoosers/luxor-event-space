import 'server-only'

import type { LuxorInquiryInput } from '@/lib/luxorInquiryTypes'
import type { LuxorPartnerApplicationType } from '@/lib/luxorPartnerApplicationTypes'

const EVENT_HOSTING_PATTERN =
  /\b(wedding|quinceañera|quinceanera|xv\s* años|sweet\s*16|cincoañera|birthday|reception|shower|graduation|corporate event|host(?:ing)?\s+(?:my|our|a)\s+event|book(?:ing)?\s+(?:the\s+)?venue|rent(?:ing)?\s+(?:the\s+)?(?:space|venue|ballroom)|tour|visit|availability|event date|guests?|celebration|funeral|memorial|repast|anniversary|vow renewal)\b/i

const PARTNERSHIP_STRONG_PATTERN =
  /\b(work with us|partnership|collaborat(?:e|ion)|vendor application|preferred vendor(?:\s+list)?|market vendor|sponsor(?:ship)?(?:\s+inquiry)?|activity partner|host a workshop|workshop request|join your vendor|sell (?:to|at) luxor|offer our services|marketing agency|promote our brand|advertis(?:e|ing)\s+(?:with|at)|become a vendor|vendor at your|partner with luxor)\b/i

const PARTNERSHIP_SOFT_PATTERN =
  /\b(vendor|partner|sponsorship|workshop|collaborat|marketing services|promotional|brand partner)\b/i

const MARKETING_OUTREACH_PATTERN =
  /\b(marketing|advertis(?:e|ing)|promot(?:e|ion)|seo|social media management|media buy|lead generation)\b/i

export type LuxorWorkWithUsIntakeContext = {
  flow?: string | null
  source?: string | null
  message?: string | null
  eventType?: string | null
  pagePath?: string | null
  referrer?: string | null
  metadata?: Record<string, unknown> | null
}

function haystackFromContext(context: LuxorWorkWithUsIntakeContext) {
  const metadata = context.metadata && typeof context.metadata === 'object' ? context.metadata : {}
  const intent = typeof metadata.workWithUsIntent === 'string' ? metadata.workWithUsIntent : ''
  const landing = metadata.attribution && typeof metadata.attribution === 'object'
    ? String((metadata.attribution as Record<string, unknown>).landingPage || '')
    : ''
  return [
    context.message || '',
    context.pagePath || '',
    context.referrer || '',
    landing,
    intent,
    typeof metadata.contactIntent === 'string' ? metadata.contactIntent : '',
  ]
    .join('\n')
    .toLowerCase()
}

function hasExplicitWorkWithUsIntent(context: LuxorWorkWithUsIntakeContext) {
  const metadata = context.metadata && typeof context.metadata === 'object' ? context.metadata : {}
  if (metadata.workWithUsIntent === true || metadata.workWithUsIntent === 'work-with-us') return true
  const queryIntent = typeof metadata.contactIntent === 'string' ? metadata.contactIntent.trim().toLowerCase() : ''
  if (queryIntent === 'work-with-us' || queryIntent === 'partnership') return true
  const path = `${context.pagePath || ''} ${context.referrer || ''}`.toLowerCase()
  return path.includes('/work-with-us')
}

function looksLikeDefaultContactPlaceholder(eventType: string | null | undefined) {
  const value = (eventType || '').trim().toLowerCase()
  return !value || value === 'private celebration'
}

export function inferLuxorPartnerApplicationType(message: string): LuxorPartnerApplicationType {
  const lower = message.toLowerCase()
  if (/\b(market vendor|christmas market|vendor booth|vendor space)\b/.test(lower)) return 'market_vendor'
  if (/\b(preferred vendor|vendor list|approved vendor)\b/.test(lower)) return 'preferred_vendor'
  if (/\b(host a workshop|workshop request|teach a class|class at luxor)\b/.test(lower)) return 'workshop'
  if (/\b(sponsor(?:ship)?)\b/.test(lower)) return 'sponsorship'
  if (/\b(activity partner|free activity|craft experience)\b/.test(lower)) return 'activity_partner'
  return 'general'
}

export function classifyLuxorWorkWithUsIntake(context: LuxorWorkWithUsIntakeContext): {
  isWorkWithUs: boolean
  applicationType: LuxorPartnerApplicationType | null
} {
  if (context.flow !== 'contact_form' && context.source !== 'contact_page') {
    return { isWorkWithUs: false, applicationType: null }
  }

  const haystack = haystackFromContext(context)
  const message = (context.message || '').trim()
  const explicitIntent = hasExplicitWorkWithUsIntent(context)
  const eventTypeForSignals = looksLikeDefaultContactPlaceholder(context.eventType) ? '' : (context.eventType || '')
  const eventSignals = EVENT_HOSTING_PATTERN.test(`${message} ${eventTypeForSignals}`)
  const strongPartnership = PARTNERSHIP_STRONG_PATTERN.test(haystack)
  const softPartnership = PARTNERSHIP_SOFT_PATTERN.test(haystack)
  const marketingOutreach = MARKETING_OUTREACH_PATTERN.test(haystack)
  const placeholderEventType = looksLikeDefaultContactPlaceholder(context.eventType)

  if (explicitIntent && !eventSignals) {
    return { isWorkWithUs: true, applicationType: inferLuxorPartnerApplicationType(message) }
  }

  if (strongPartnership && !eventSignals) {
    return { isWorkWithUs: true, applicationType: inferLuxorPartnerApplicationType(message) }
  }

  if (marketingOutreach && placeholderEventType && !eventSignals) {
    return { isWorkWithUs: true, applicationType: 'general' }
  }

  if (softPartnership && placeholderEventType && !eventSignals && message.length >= 12) {
    return { isWorkWithUs: true, applicationType: inferLuxorPartnerApplicationType(message) }
  }

  return { isWorkWithUs: false, applicationType: null }
}

export function shouldRouteLuxorInquiryToWorkWithUs(
  input: Pick<LuxorInquiryInput, 'flow' | 'source' | 'message' | 'eventType' | 'pagePath' | 'referrer' | 'metadata'>,
) {
  return classifyLuxorWorkWithUsIntake(input).isWorkWithUs
}
