/** PostgREST `or` tuple filters use `column.operator.value`, not top-level `column=eq.value`. */
export function agentTranscriptSidebandClaimOrFilter() {
  return '(metadata->>agent_transcript_sideband.is.null,metadata->>agent_transcript_sideband.eq.failed,metadata->>agent_transcript_sideband.eq.partial)'
}

export function agentTranscriptSidebandClaimQuerySuffix() {
  return `&or=${agentTranscriptSidebandClaimOrFilter()}`
}

const DEFAULT_WORKER_ORIGIN = 'https://www.luxoratlaspalmas.com'

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