import 'server-only'

import { getVerifiedLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

// These fields are unverified claims. This helper does not retrieve or retain
// evidence bytes and does not determine whether a payment was settled.
export type HistoricalPaymentReviewClaim = {
  expenseId: string
  requestId: string
  supersedesId: string | null
  claimedEvidenceReference: string
  claimedEvidenceVersion: string
  claimedEvidenceSha256: string
  reviewNote: string
}

/** The caller cannot supply an actor; it comes from the verified portal cookie. */
export async function recordHistoricalPaymentReview(claim: HistoricalPaymentReviewClaim) {
  const session = await getVerifiedLuxorPortalSession()
  if (!session) throw new Error('Authorized portal session required.')
  const member = await getLuxorPortalMember(session.email)
  const revokedAt = member?.sessions_revoked_at ? Date.parse(member.sessions_revoked_at) : null
  if (!member || member.email.trim().toLowerCase() !== session.email.trim().toLowerCase()
    || member.status !== 'active' || !memberCan(member, 'operations') || !memberCan(member, 'finances')
    || !Number.isSafeInteger(session.issuedAt) || !Number.isSafeInteger(session.expiresAt)
    || session.issuedAt <= 0 || session.issuedAt > Date.now() || session.expiresAt <= Date.now()
    || session.expiresAt - session.issuedAt > 7 * 24 * 60 * 60 * 1000
    || (revokedAt !== null && (!Number.isFinite(revokedAt) || session.issuedAt <= revokedAt))) {
    throw new Error('Active operations and finance access required.')
  }

  return supabaseRestStrict<unknown>('rpc/luxor_record_historical_payment_review', {
    method: 'POST',
    body: JSON.stringify({
      p_expense_id: claim.expenseId,
      p_request_id: claim.requestId,
      p_supersedes_id: claim.supersedesId,
      p_evidence_reference: claim.claimedEvidenceReference,
      p_evidence_version: claim.claimedEvidenceVersion,
      p_evidence_sha256: claim.claimedEvidenceSha256,
      p_review_note: claim.reviewNote,
      p_actor: session.email.trim().toLowerCase(),
      p_session_issued_at_ms: session.issuedAt,
      p_session_expires_at_ms: session.expiresAt,
    }),
  })
}
