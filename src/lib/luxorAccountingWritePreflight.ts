/** Preflight only. This cannot authorize a write or replace transaction-time checks. */
export function accountingWriteRequestIsSameOriginJson(origin: string | null, requestUrl: string, contentType: string | null): boolean {
  try {
    const requestOrigin = new URL(requestUrl).origin
    return Boolean(origin && origin === requestOrigin && /^application\/json(?:\s*;|$)/i.test(contentType || ''))
  } catch { return false }
}

/** Values must come from the server-verified session and a fresh member lookup, never request JSON. */
export function accountingWritePreflightAllowed(input: {
  session: { email: string; issuedAt: number; expiresAt: number } | null
  member: { email: string; role: string; status: string; permissions: string[]; sessions_revoked_at: string | null } | null
  now: number
}): boolean {
  const { session, member, now } = input
  if (!session || !member || !Number.isFinite(now) || !Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt)
    || session.issuedAt > now || session.expiresAt <= now || typeof session.email !== 'string' || typeof member.email !== 'string' || !session.email.trim()
    || session.email.trim().toLowerCase() !== member.email.trim().toLowerCase()
    || member.status !== 'active' || !['owner', 'admin'].includes(member.role) || !Array.isArray(member.permissions)) return false
  if (member.role !== 'owner' && (!member.permissions.includes('finances') || !member.permissions.includes('settings'))) return false
  if (member.sessions_revoked_at !== null) {
    const revokedAt = Date.parse(member.sessions_revoked_at)
    if (!Number.isFinite(revokedAt) || session.issuedAt <= revokedAt) return false
  }
  return true
}

/** Classification only; the database must enforce uniqueness atomically and bind a trusted actor. */
export function accountingWriteReplay(existing: { actorId: string; digest: string } | null, actorId: string, digest: string): 'new' | 'replay' | 'conflict' {
  if (!actorId || !digest) return 'conflict'
  if (!existing) return 'new'
  return existing.actorId === actorId && existing.digest === digest ? 'replay' : 'conflict'
}
