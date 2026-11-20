/** PostgREST `or` tuple filters use `column.operator.value`, not top-level `column=eq.value`. */
export function agentTranscriptSidebandClaimOrFilter() {
  return '(metadata->>agent_transcript_sideband.is.null,metadata->>agent_transcript_sideband.eq.failed,metadata->>agent_transcript_sideband.eq.partial)'
}

export function agentTranscriptSidebandClaimQuerySuffix() {
  return `&or=${agentTranscriptSidebandClaimOrFilter()}`
}

/** Stay under the Vercel function wall (~13 min) while leaving time to flush the last turn. */
export const ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_MAX_MS = 11 * 60_000
export const ELENA_INBOUND_AGENT_TRANSCRIPT_STALE_RUNNING_MS = ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_MAX_MS + 2 * 60_000
export const ELENA_AGENT_TRANSCRIPT_CLAIM_MAX_ATTEMPTS = 8

const DEFAULT_WORKER_ORIGIN = 'https://www.luxoratlaspalmas.com'

function sidebandStartedAt(metadata: Record<string, unknown>) {
  const value = metadata.agent_transcript_sideband_started_at
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Number.NaN
}

export function isStaleAgentTranscriptSideband(metadata: Record<string, unknown>) {
  return metadata.agent_transcript_sideband === 'running'
    && Number.isFinite(sidebandStartedAt(metadata))
    && Date.now() - sidebandStartedAt(metadata) > ELENA_INBOUND_AGENT_TRANSCRIPT_STALE_RUNNING_MS
}

/** Skip duplicate worker POSTs while a fresh sideband is already running. */
export function shouldStartAgentTranscriptSideband(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== 'object') return true
  const status = metadata.agent_transcript_sideband
  if (status === 'completed') return false
  if (status === 'running') return isStaleAgentTranscriptSideband(metadata)
  return true
}

export function agentTranscriptSidebandClaimDelayMs(attempt: number) {
  return Math.min(50 * attempt, 400)
}

/** Worker POSTs must hit www; apex redirects can drop the body. Override only via NEXT_PUBLIC_SITE_URL. */
export function resolveElenaInboundAgentTranscriptWorkerOrigin(siteUrl?: string | null) {
  const trimmed = siteUrl?.trim().replace(/\/$/, '') || ''
  if (!trimmed) return DEFAULT_WORKER_ORIGIN
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (parsed.hostname === 'luxoratlaspalmas.com') parsed.hostname = 'www.luxoratlaspalmas.com'
    return parsed.origin
  } catch {
    return DEFAULT_WORKER_ORIGIN
  }
}