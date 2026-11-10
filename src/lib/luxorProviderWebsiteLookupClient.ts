'use client'

import type { LuxorVendor } from '@/lib/luxorInquiryTypes'

export type WebsiteSuggestion = { website: string; source: string }
const lookupCache = new Map<string, { promise: Promise<WebsiteSuggestion | null>; expiresAt: number }>()
// Old session-only entries must not prevent the first persistent server lookup.
const CACHE_PREFIX = 'luxor:provider-website:v5:'
const CACHE_TTL = 6 * 60 * 60 * 1000

function validSuggestion(value: unknown): value is WebsiteSuggestion {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WebsiteSuggestion>
  if (typeof candidate.website !== 'string' || typeof candidate.source !== 'string' || candidate.website.length > 2048 || candidate.source.length > 2048) return false
  try {
    const website = new URL(candidate.website)
    const source = new URL(candidate.source)
    const validUrl = (url: URL) => url.protocol === 'https:' && !url.username && !url.password && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)
    return validUrl(website) && validUrl(source) && (website.hostname === source.hostname || website.hostname.endsWith(`.${source.hostname}`) || source.hostname.endsWith(`.${website.hostname}`))
  } catch { return false }
}

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

function readStored(key: string): { value: WebsiteSuggestion | null } | null {
  try {
    const raw = storage()?.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as { expiresAt?: unknown; value?: unknown }
    if (typeof entry.expiresAt !== 'number' || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now() || entry.expiresAt > Date.now() + CACHE_TTL || !(entry.value === null || validSuggestion(entry.value))) return null
    return { value: entry.value }
  } catch { return null }
}

function storeResult(key: string, value: WebsiteSuggestion | null) {
  try { storage()?.setItem(CACHE_PREFIX + key, JSON.stringify({ expiresAt: Date.now() + CACHE_TTL, value })) } catch { /* Storage may be unavailable or full. */ }
}

/** Reuse in-flight and completed lookups during this portal session. */
function lookupWebsite(key: string, url: string, retry = false, missingIsEmpty = false): Promise<WebsiteSuggestion | null> {
  if (retry) {
    lookupCache.delete(key)
    try { storage()?.removeItem(CACHE_PREFIX + key) } catch { /* A fresh lookup still works without storage. */ }
  }
  const cached = lookupCache.get(key)
  if (cached && cached.expiresAt <= Date.now()) lookupCache.delete(key)
  let pending = lookupCache.get(key)?.promise
  if (!pending) {
    const stored = readStored(key)
    if (stored) return Promise.resolve(stored.value)
    pending = fetch(url, { method: 'POST', ...(retry ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retry: true }) } : {}) }).then(async (response) => {
      const result = await response.json() as { website?: string | null; source?: string; error?: string }
      if (!response.ok && !(missingIsEmpty && response.status === 404)) throw new Error(result.error || 'Website lookup failed.')
      const suggestion = response.ok && validSuggestion(result) ? { website: result.website!, source: result.source! } : null
      const entry = lookupCache.get(key)
      if (entry && entry.promise === pending) { entry.expiresAt = Date.now() + CACHE_TTL; storeResult(key, suggestion) }
      return suggestion
    }).catch((error) => {
      if (lookupCache.get(key)?.promise === pending) lookupCache.delete(key)
      throw error
    })
    lookupCache.set(key, { promise: pending, expiresAt: Infinity })
  }
  return pending
}

export function lookupProviderWebsite(vendor: LuxorVendor, retry = false): Promise<WebsiteSuggestion | null> {
  return lookupWebsite(JSON.stringify(['v4', vendor.id, vendor.name, vendor.vendor_type]), `/api/portal/vendor-profile/${encodeURIComponent(vendor.id)}/website-suggestion`, retry)
}

export function lookupBillProviderWebsite(id: string, name: string, updatedAt: string | null | undefined, retry = false): Promise<WebsiteSuggestion | null> {
  return lookupWebsite(JSON.stringify(['v4', 'bill', id, name, updatedAt]), `/api/operations/bills/${encodeURIComponent(id)}/website-suggestion`, retry, true)
}

export function lookupScheduleProviderWebsite(id: string, name: string, updatedAt: string | null | undefined, retry = false): Promise<WebsiteSuggestion | null> {
  return lookupWebsite(JSON.stringify(['v4', 'schedule', id, name, updatedAt]), `/api/expenses/templates/${encodeURIComponent(id)}/website-suggestion`, retry, true)
}
