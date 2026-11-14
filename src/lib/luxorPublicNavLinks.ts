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
] as const

function resolveHref(path: string, spanish: boolean, localeNeutral?: boolean): string {
  if (localeNeutral) return path
  return publicSitePath(path, spanish)
}

/** Packages, Gallery (English path on Spanish routes), Visit, and Contact. */
export function getPublicNavLinks(spanish: boolean): ResolvedPublicNavLink[] {
  return PUBLIC_NAV_SECONDARY.map((item) => ({
    key: item.key,
    label: spanish ? item.labelEs : item.label,
    href: resolveHref(item.path, spanish, 'localeNeutral' in item ? item.localeNeutral : false),
  }))
}

export function getPublicNavEventsLink(spanish: boolean): ResolvedPublicNavLink {
  return {
    key: 'Events',
    label: spanish ? 'Eventos' : 'Events',
    href: publicSitePath('/events', spanish),
  }
}

/** Footer order: Events, then Packages, Gallery, Visit, Contact. */
export function getPublicFooterNavLinks(spanish: boolean): ResolvedPublicNavLink[] {
  return [getPublicNavEventsLink(spanish), ...getPublicNavLinks(spanish)]
}