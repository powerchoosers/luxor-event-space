export function formatActivityAuthor(author?: string | null, clientName?: string | null): string {
  if (!author || !author.trim()) return 'Arianna Patterson'
  const trimmed = author.trim()
  const lower = trimmed.toLowerCase()

  if (
    lower === 'admin owner' ||
    lower === 'portal user' ||
    lower === 'portal owner' ||
    lower === 'admin' ||
    lower === 'owner' ||
    lower === 'system' ||
    lower === 'portal staff' ||
    lower === 'staff' ||
    lower === 'arianna' ||
    lower.includes('a.patterson') ||
    lower.includes('booking@luxor') ||
    lower.includes('hello@luxor') ||
    lower.includes('patterson')
  ) {
    return 'Arianna Patterson'
  }

  if (lower === 'client') {
    return clientName?.trim() ? `${clientName.trim()} (Client)` : 'Client'
  }

  if (lower === 'signature portal') return 'Signature Portal'
  if (lower === 'proposal portal') return 'Proposal Portal'
  if (lower === 'luxor agreement delivery') return 'Agreement Delivery'
  if (lower === 'client payment portal') return 'Payment Portal'

  if (lower.includes('@')) {
    const local = trimmed.split('@')[0].replace(/[._-]+/g, ' ')
    return local.replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return trimmed
}
