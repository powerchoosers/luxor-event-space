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
  const recipients = [...new Set(sources.map(normalizeLuxorEmailAddress).filter(Boolean))]
  return recipients.length === 1 ? recipients : []
}

export function isLuxorBounceForCurrentAddress(currentAddress: unknown, bouncedAddress: unknown) {
  const current = normalizeLuxorEmailAddress(currentAddress)
  const bounced = normalizeLuxorEmailAddress(bouncedAddress)
  return Boolean(current && bounced && current === bounced)
}

export function luxorBounceNotificationId(eventId: unknown, bouncedAddress: unknown) {
  return `email_bounce_${String(eventId || '').trim()}_${normalizeLuxorEmailAddress(bouncedAddress)}`
}

export function isSameLuxorBounceTaskEvent(description: unknown, eventId: unknown, bouncedAddress: unknown) {
  const id = String(eventId || '').trim()
  const address = normalizeLuxorEmailAddress(bouncedAddress)
  return Boolean(id && address && String(description || '').includes(`Provider event: ${id}\nBounced recipient: ${address}`))
}
