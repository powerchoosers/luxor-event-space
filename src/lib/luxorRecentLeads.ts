export interface RecentLeadItem {
  id: string
  fullName: string
  email?: string
  phone?: string
  eventType?: string
  status?: string
  avatarUrl?: string
  openedAt: number
}

const RECENT_LEADS_STORAGE_KEY = 'luxor_recent_leads'
const RECENT_LEADS_MAX = 8

let cachedRecentLeadsRaw: string | null = null
let cachedRecentLeads: RecentLeadItem[] = []
const EMPTY_RECENT_LEADS: RecentLeadItem[] = []

export function getRecentLeadsServerSnapshot(): RecentLeadItem[] {
  return EMPTY_RECENT_LEADS
}

export function getRecentLeads(): RecentLeadItem[] {
  if (typeof window === 'undefined') return EMPTY_RECENT_LEADS
  try {
    const raw = window.localStorage.getItem(RECENT_LEADS_STORAGE_KEY)
    if (raw === cachedRecentLeadsRaw) return cachedRecentLeads
    cachedRecentLeadsRaw = raw
    if (!raw) {
      cachedRecentLeads = EMPTY_RECENT_LEADS
      return cachedRecentLeads
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      cachedRecentLeads = EMPTY_RECENT_LEADS
      return cachedRecentLeads
    }
    cachedRecentLeads = parsed.filter(
      (item): item is RecentLeadItem =>
        Boolean(item && typeof item.id === 'string' && typeof item.fullName === 'string'),
    )
    return cachedRecentLeads
  } catch {
    cachedRecentLeads = EMPTY_RECENT_LEADS
    return cachedRecentLeads
  }
}

export function subscribeRecentLeads(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('luxor:recent-leads-updated', callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener('luxor:recent-leads-updated', callback)
    window.removeEventListener('storage', callback)
  }
}

export function saveRecentLead(lead: {
  id: string
  fullName: string
  email?: string | null
  phone?: string | null
  eventType?: string | null
  status?: string | null
  avatarUrl?: string | null
}): void {
  if (typeof window === 'undefined' || !lead.id || !lead.fullName) return
  try {
    const current = getRecentLeads()
    const nextItem: RecentLeadItem = {
      id: lead.id,
      fullName: lead.fullName,
      email: lead.email || undefined,
      phone: lead.phone || undefined,
      eventType: lead.eventType || undefined,
      status: lead.status || undefined,
      avatarUrl: lead.avatarUrl || undefined,
      openedAt: Date.now(),
    }
    const filtered = current.filter((item) => item.id !== lead.id)
    const next = [nextItem, ...filtered].slice(0, RECENT_LEADS_MAX)
    const serialized = JSON.stringify(next)
    cachedRecentLeadsRaw = serialized
    cachedRecentLeads = next
    window.localStorage.setItem(RECENT_LEADS_STORAGE_KEY, serialized)
    window.dispatchEvent(new CustomEvent('luxor:recent-leads-updated', { detail: next }))
  } catch {
    // Ignore localStorage errors
  }
}

export function clearRecentLeads(): void {
  if (typeof window === 'undefined') return
  try {
    cachedRecentLeadsRaw = null
    cachedRecentLeads = EMPTY_RECENT_LEADS
    window.localStorage.removeItem(RECENT_LEADS_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('luxor:recent-leads-updated', { detail: [] }))
  } catch {
    // Ignore localStorage errors
  }
}
