import { filterLuxorEventTypes, normalizeLuxorEventType } from './luxorInquiryTypes'

const QUINCE_PATTERN = /\b(quince(?:anera|añera)?|xv\s*años|xv|sweet\s*(?:15|sixteen)|cincoañera|cincoañera)\b/i

/** Prefer what Elena understood in conversation over a noisy STT label (e.g. "Pizza" for "quince"). */
export function resolveElenaCallerEventType(raw: unknown, conversationalHint?: unknown) {
  const transcript = typeof raw === 'string' ? raw.trim() : ''
  const spoken = typeof conversationalHint === 'string' ? conversationalHint.trim() : ''
  const combined = [spoken, transcript].filter(Boolean).join(' ')
  if (!combined) return null

  if (/\bpizza\b/i.test(transcript) && QUINCE_PATTERN.test(spoken)) return 'Quinceañera'
  if (QUINCE_PATTERN.test(combined)) {
    if (/\bsweet\s*(?:16|sixteen)\b/i.test(combined)) return 'Sweet 16'
    return 'Quinceañera'
  }

  const canonical = filterLuxorEventTypes(combined)
  if (canonical.length === 1) return canonical[0]
  if (canonical.includes('Quinceañera')) return 'Quinceañera'

  try {
    const normalized = normalizeLuxorEventType(transcript || combined)
    return normalized || null
  } catch {
    return transcript || combined.slice(0, 120)
  }
}

export function elenaEventTypeClarificationQuestion(value: string) {
  if (/\b(quince|xv|15|fifteen|sweet)\b/i.test(value) && !/quinceañera/i.test(value)) {
    return 'Did you mean a quinceañera celebration?'
  }
  return null
}