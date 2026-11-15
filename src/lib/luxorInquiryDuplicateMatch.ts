type DuplicateInquiry = {
  id: string
  flow?: string | null
  source?: string | null
  message?: string | null
  metadata?: Record<string, unknown> | null
}

type DuplicateInput = {
  flow?: string | null
  source?: string | null
  message?: string | null
  metadata?: Record<string, unknown> | null
}

function isPackagesInquiry(value: Pick<DuplicateInput, 'flow' | 'source'>) {
  return value.flow === 'packages_event_inquiry' || value.source === 'website_packages'
}

function packagesConfiguratorDraftId(metadata: Record<string, unknown> | null | undefined) {
  const configurator = metadata?.packagesConfigurator
  if (!configurator || typeof configurator !== 'object' || Array.isArray(configurator)) return null
  const draftId = (configurator as Record<string, unknown>).draft_id
  return typeof draftId === 'string' && draftId.trim() ? draftId.trim() : null
}

function packagesInquiryMatches(input: DuplicateInput, inquiry: DuplicateInquiry) {
  if (!isPackagesInquiry(inquiry)) return false
  const inputDraftId = packagesConfiguratorDraftId(input.metadata)
  if (!inputDraftId) return true
  const existingDraftId = packagesConfiguratorDraftId(inquiry.metadata)
  return existingDraftId === inputDraftId
}

export function findRecentLuxorInquiryMatch(input: DuplicateInput, existing: DuplicateInquiry[]) {
  const isContactForm = input.flow === 'contact_form' || input.source === 'contact_page'
  if (isContactForm) {
    const message = typeof input.message === 'string' ? input.message.trim() : ''
    if (!message) return null
    return existing.find((inquiry) =>
      (inquiry.flow === 'contact_form' || inquiry.source === 'contact_page')
      && typeof inquiry.message === 'string'
      && inquiry.message.trim() === message,
    ) ?? null
  }

  if (isPackagesInquiry(input)) {
    return existing.find((inquiry) => packagesInquiryMatches(input, inquiry)) ?? null
  }

  return existing.find((inquiry) => inquiry.flow !== 'contact_form' && inquiry.source !== 'contact_page') ?? null
}