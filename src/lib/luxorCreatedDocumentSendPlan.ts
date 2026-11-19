export type CreatedDocumentSigningOrder = 'parallel' | 'sequential'

export type CreatedDocumentInviteSigner = {
  id: string
  name: string
  email: string
  sign_order: number
  status: string
  invited_at?: string | null
}

const TEST_RECIPIENT = /^(elenaassistant@mail\.grokbot\.com|.+@example\.com)$/i

export function isLuxorCreatedDocumentTestRecipient(email: string) {
  return TEST_RECIPIENT.test(email.trim())
}

export function assertCreatedDocumentQueueRecipient(email: string, confirmLiveSend: boolean) {
  if (confirmLiveSend) return
  if (!isLuxorCreatedDocumentTestRecipient(email)) {
    throw new Error('Refusing to queue a created-document email for a non-test recipient.')
  }
}

export function planCreatedDocumentInvitations(
  signingOrder: CreatedDocumentSigningOrder,
  signers: CreatedDocumentInviteSigner[],
) {
  const ordered = signers
    .slice()
    .sort((left, right) => left.sign_order - right.sign_order || left.email.localeCompare(right.email))
  const stillNeeded = (signer: CreatedDocumentInviteSigner) => signer.status !== 'signed' && signer.status !== 'declined'
  if (signingOrder === 'sequential') {
    const next = ordered.find(stillNeeded)
    if (!next || next.invited_at || !next.email.trim()) return []
    const earlierStillOpen = ordered.some((signer) => signer.sign_order < next.sign_order && stillNeeded(signer))
    if (earlierStillOpen) return []
    return [next]
  }
  return ordered.filter((signer) => stillNeeded(signer) && signer.email.trim() && !signer.invited_at)
}

export function createdDocumentReminderSchedule(enabled: boolean, afterDays: number, now = Date.now()) {
  if (!enabled) return null
  const days = Math.min(30, Math.max(1, Math.round(afterDays) || 1))
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString()
}

export function rollupCreatedDocumentStatus(signers: Array<{ status: string; name?: string; email?: string; invited_at?: string | null }>) {
  const counted = signers.filter((signer) => {
    if (!('name' in signer) && !('email' in signer)) return true
    const name = typeof signer.name === 'string' ? signer.name.trim() : ''
    const email = typeof signer.email === 'string' ? signer.email.trim() : ''
    return Boolean(name || email || signer.invited_at)
  })
  if (!counted.length) return null
  if (counted.some((signer) => signer.status === 'declined')) return 'declined' as const
  const signedCount = counted.filter((signer) => signer.status === 'signed').length
  if (signedCount === counted.length) return 'signed' as const
  if (signedCount > 0) return 'partially_signed' as const
  if (counted.some((signer) => signer.status === 'viewed')) return 'opened' as const
  return 'sent' as const
}

export function createdDocumentRecipientSummary(signers: Array<{ name: string; email: string }>) {
  const parts = signers
    .map((signer) => signer.name.trim() || signer.email.trim())
    .filter(Boolean)
  const summary = parts.join(', ').slice(0, 500)
  return summary || null
}

export function createdDocumentLibraryStatusFilter(section: string) {
  if (section === 'my_documents') return 'status=eq.draft'
  if (section === 'out_for_signature') return 'status=in.(sent,opened,partially_signed)'
  if (section === 'completed') return 'status=in.(signed,declined,voided)'
  return null
}

export function executedCreatedDocumentPdfPath(documentId: string) {
  return `created-documents/${documentId}/final/executed.pdf`
}

export function isCreatedDocumentRecipientEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function createdDocumentSigningOrigin(input?: {
  forwardedHost?: string | null
  host?: string | null
  forwardedProto?: string | null
  vercelEnv?: string | null
  vercelUrl?: string | null
  siteUrl?: string | null
}) {
  const host = input?.forwardedHost?.split(',')[0]?.trim() || input?.host?.split(',')[0]?.trim() || ''
  if (host) {
    const proto = input?.forwardedProto?.split(',')[0]?.trim() || (host.includes('localhost') ? 'http' : 'https')
    return `${proto}://${host}`.replace(/\/$/, '')
  }
  if (input?.vercelEnv === 'preview' && input.vercelUrl) {
    const bare = input.vercelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    return `https://${bare}`
  }
  return (input?.siteUrl || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
}

export function addressedCreatedDocumentRecipients<T extends { name: string; email: string }>(signers: T[]) {
  return signers.filter((signer) => signer.name.trim() || signer.email.trim())
}
