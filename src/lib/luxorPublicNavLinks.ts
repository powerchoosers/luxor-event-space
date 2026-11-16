import { publicSitePath } from '@/lib/publicSitePaths'

export type ResolvedPublicNavLink = {
  key: string
  label: string
  href: string
}

const PUBLIC_NAV_SECONDARY = [
  { key: 'Packages', label: 'Packages', labelEs: 'Paquetes', path: '/packages' },
  { key: 'Gallery', label: 'Gallery', labelEs: 'Galería', path: '/gallery', localeNeutral: true },
  { key: 'Visit', label: 'Visit', labelEs: 'Visita', path: '/visit' },
  { key: 'Contact', label: 'Contact', labelEs: 'Contacto', path: '/contact' },
  { key: 'WorkWithUs', label: 'Work With Us', labelEs: 'Trabaja con nosotros', path: '/work-with-us' },
] as const

function resolveHref(path: string, spanish: boolean, localeNeutral?: boolean): string {
  if (localeNeutral) return path
  return publicSitePath(path, spanish)
}

function resolvePublicNavItem(item: (typeof PUBLIC_NAV_SECONDARY)[number], spanish: boolean): ResolvedPublicNavLink {
  return {
    key: item.key,
    label: spanish ? item.labelEs : item.label,
    href: resolveHref(item.path, spanish, 'localeNeutral' in item ? item.localeNeutral : false),
  }
}

/** Packages, Gallery (English path on Spanish routes), Visit, and Contact. */
export function getPublicNavLinks(spanish: boolean): ResolvedPublicNavLink[] {
  return PUBLIC_NAV_SECONDARY.filter((item) => item.key !== 'WorkWithUs').map((item) => resolvePublicNavItem(item, spanish))
}

export function getPublicFooterWorkWithUsLink(spanish: boolean): ResolvedPublicNavLink {
  const item = PUBLIC_NAV_SECONDARY.find((entry) => entry.key === 'WorkWithUs')
  if (!item) {
    return { key: 'WorkWithUs', label: spanish ? 'Trabaja con nosotros' : 'Work With Us', href: '/work-with-us' }
  }
  return resolvePublicNavItem(item, spanish)
}

export function getPublicNavEventsLink(spanish: boolean): ResolvedPublicNavLink {
  return {
    key: 'Events',
    label: spanish ? 'Eventos' : 'Events',
    href: publicSitePath('/events', spanish),
  }
}

/** Footer order: Events, then Packages, Gallery, Visit, Contact, Work With Us (footer only). */
export function getPublicFooterNavLinks(spanish: boolean): ResolvedPublicNavLink[] {
  return [getPublicNavEventsLink(spanish), ...getPublicNavLinks(spanish), getPublicFooterWorkWithUsLink(spanish)]
}