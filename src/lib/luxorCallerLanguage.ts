/** A stated language is evidence about the caller, never an ASR/translation inference. */
export function normalizeCallerSpokenLanguage(value: unknown): string | null {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) return null
  const language = value.trim().replace(/\s+/g, ' ')
  return language.length <= 60 && /^[\p{L}][\p{L}\p{M} ()'-]*$/u.test(language) ? language : null
}

export function getConfirmedCallerLanguage(metadata: Record<string, unknown> | null | undefined): string | null {
  const evidence = metadata?.spokenLanguage
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null
  const record = evidence as Record<string, unknown>
  if (record.source !== 'caller_confirmed' || typeof record.confirmedAt !== 'string' || !Number.isFinite(Date.parse(record.confirmedAt))) return null
  return normalizeCallerSpokenLanguage(record.language)
}
