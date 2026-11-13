export type DeveloperSupportPageArea = 'portal' | 'public'

export type DeveloperSupportPageOption = {
  path: string
  label: string
  description?: string
}

export const PORTAL_DEVELOPER_SUPPORT_PAGES: DeveloperSupportPageOption[] = [
  { path: '/portal', label: 'Overview', description: 'Dashboard home' },
  { path: '/portal/leads', label: 'Leads & Clients', description: 'CRM pipeline and clients' },
  { path: '/portal/planner', label: 'Planner', description: 'Event planning workspace' },
  { path: '/portal/calls', label: 'Phone', description: 'Calls and softphone' },
  { path: '/portal/emails', label: 'Emails', description: 'Inbox and compose' },
  { path: '/portal/messages', label: 'Text', description: 'SMS threads' },
  { path: '/portal/calendar', label: 'Calendar', description: 'Tours and events calendar' },
  { path: '/portal/finances', label: 'Finances', description: 'Revenue and payments' },
  { path: '/portal/operations', label: 'Operations', description: 'Staff operations' },
  { path: '/portal/marketing', label: 'Marketing', description: 'Campaigns and site promos' },
  { path: '/portal/reports', label: 'Reports', description: 'Business reports' },
  { path: '/portal/settings', label: 'Settings', description: 'Portal configuration' },
]

export const PUBLIC_DEVELOPER_SUPPORT_PAGES: DeveloperSupportPageOption[] = [
  { path: '/', label: 'Home', description: 'Main marketing page' },
  { path: '/events', label: 'Events', description: 'Event types overview' },
  { path: '/packages', label: 'Packages', description: 'Event package cards and pricing' },
  { path: '/spaces', label: 'Spaces', description: 'Venue spaces' },
  { path: '/gallery', label: 'Gallery', description: 'Photo gallery' },
  { path: '/visit', label: 'Visit', description: 'Tour and visit page' },
  { path: '/tour', label: 'Tour', description: 'Tour booking flow' },
  { path: '/contact', label: 'Contact', description: 'Contact form' },
  { path: '/terms', label: 'Terms', description: 'Terms of service' },
  { path: '/privacy', label: 'Privacy', description: 'Privacy policy' },
  { path: '/sms-signup', label: 'SMS signup', description: 'Text opt-in page' },
  { path: '/grand-opening-rsvp', label: 'Grand opening RSVP', description: 'RSVP landing page' },
  { path: '/es', label: 'Home (Spanish)', description: 'Spanish home' },
  { path: '/es/events', label: 'Events (Spanish)', description: 'Spanish events' },
  { path: '/es/packages', label: 'Packages (Spanish)', description: 'Spanish packages' },
  { path: '/es/gallery', label: 'Gallery (Spanish)', description: 'Spanish gallery' },
  { path: '/es/visit', label: 'Visit (Spanish)', description: 'Spanish visit' },
  { path: '/es/contact', label: 'Contact (Spanish)', description: 'Spanish contact' },
]

const PUBLIC_EXACT = new Set(PUBLIC_DEVELOPER_SUPPORT_PAGES.map((page) => page.path))

/** Public marketing routes allowed when "Current page" is not in the static catalog. */
const PUBLIC_ROUTE_PATTERN = /^\/(?:es\/)?(?:events|packages|spaces|gallery|visit|tour|contact|terms|privacy|sms-signup|grand-opening-rsvp)$/

export function getDeveloperSupportPageArea(path: string | null | undefined): DeveloperSupportPageArea {
  if (!path) return 'portal'
  if (path.startsWith('/portal')) return 'portal'
  return 'public'
}

export function normalizeDeveloperSupportPagePath(path: string | null | undefined): string {
  const trimmed = typeof path === 'string' ? path.trim() : ''
  if (!trimmed) return '/portal'
  if (!trimmed.startsWith('/')) return '/portal'
  return trimmed.slice(0, 2048)
}

export function isValidDeveloperSupportPagePath(path: string): boolean {
  const normalized = normalizeDeveloperSupportPagePath(path)
  if (normalized.includes('..') || normalized.includes('\\')) return false
  if (normalized.startsWith('/portal')) return true
  if (PUBLIC_EXACT.has(normalized)) return true
  return PUBLIC_ROUTE_PATTERN.test(normalized)
}

/** Compact route chip for picker UI; home paths hide the slash route. */
export function developerSupportRouteChip(path: string): string | null {
  const normalized = normalizeDeveloperSupportPagePath(path)
  if (normalized === '/' || normalized === '/es') return null
  return normalized
}

export function labelDeveloperSupportPagePath(path: string): string {
  const normalized = normalizeDeveloperSupportPagePath(path)
  const catalog = [...PORTAL_DEVELOPER_SUPPORT_PAGES, ...PUBLIC_DEVELOPER_SUPPORT_PAGES]
  const match = catalog.find((page) => page.path === normalized)
  if (match) return match.label
  if (normalized.startsWith('/portal/leads/')) return 'Lead record'
  if (normalized.startsWith('/portal/')) return 'Portal page'
  return 'Public page'
}

export function developerSupportPagesForArea(
  area: DeveloperSupportPageArea,
  currentPath?: string | null,
): DeveloperSupportPageOption[] {
  const base = area === 'portal' ? PORTAL_DEVELOPER_SUPPORT_PAGES : PUBLIC_DEVELOPER_SUPPORT_PAGES
  const normalized = currentPath ? normalizeDeveloperSupportPagePath(currentPath) : null
  if (!normalized || getDeveloperSupportPageArea(normalized) !== area) return base
  if (base.some((page) => page.path === normalized)) return base
  return [
    { path: normalized, label: 'Current page', description: area === 'portal' ? 'Where you are in the portal now' : 'This public URL' },
    ...base,
  ]
}
