export function normalizeLuxorEmailAddress(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function resolveLuxorBounceRecipients(input: {
  linkedJobRecipient?: unknown
  providerRecipients?: unknown[] | null
  mailboxRecipients?: unknown[] | null
}) {
  const sources = input.linkedJobRecipient
    ? [input.linkedJobRecipient]
    : input.providerRecipients?.length
      ? input.providerRecipients
      : input.mailboxRecipients?.length === 1
        ? input.mailboxRecipients
        : []
  return [...new Set(sources.map(normalizeLuxorEmailAddress).filter(Boolean))]
}

export function isLuxorBounceForCurrentAddress(currentAddress: unknown, bouncedAddress: unknown) {
  const current = normalizeLuxorEmailAddress(currentAddress)
  const bounced = normalizeLuxorEmailAddress(bouncedAddress)
  return Boolean(current && bounced && current === bounced)
}

export function luxorBounceNotificationId(eventId: unknown, bouncedAddress: unknown) {
  return `email_bounce_${String(eventId || '').trim()}_${normalizeLuxorEmailAddress(bouncedAddress)}`
}

export function isSameLuxorBounceTaskEvent(description: unknown, eventId: unknown) {
  const id = String(eventId || '').trim()
  return Boolean(id && String(description || '').includes(`Provider event: ${id}`))
}
