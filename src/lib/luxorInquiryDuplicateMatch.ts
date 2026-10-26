type DuplicateInquiry = {
  id: string
  flow?: string | null
  source?: string | null
  message?: string | null
}

type DuplicateInput = {
  flow?: string | null
  source?: string | null
  message?: string | null
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

  return existing.find((inquiry) => inquiry.flow !== 'contact_form' && inquiry.source !== 'contact_page') ?? null
}
