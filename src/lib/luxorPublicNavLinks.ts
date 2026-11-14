export type PublicNavLinkDefinition = {
  label: string
  labelEs: string
  href: string
  hrefEs?: string
}

export const PUBLIC_NAV_LINK_DEFINITIONS: PublicNavLinkDefinition[] = [
  { label: 'Events', labelEs: 'Eventos', href: '/events' },
  { label: 'Packages', labelEs: 'Paquetes', href: '/packages', hrefEs: '/es/packages' },
  { label: 'Gallery', labelEs: 'Galería', href: '/gallery' },
  { label: 'Visit', labelEs: 'Visita', href: '/visit', hrefEs: '/es/visit' },
  { label: 'Contact', labelEs: 'Contacto', href: '/contact', hrefEs: '/es/contact' },
]

export type ResolvedPublicNavLink = {
  key: string
  label: string
  href: string
}

export function getPublicNavLinks(isSpanish: boolean): ResolvedPublicNavLink[] {
  return PUBLIC_NAV_LINK_DEFINITIONS.map((item) => ({
    key: item.label,
    label: isSpanish ? item.labelEs : item.label,
    href: isSpanish && item.hrefEs ? item.hrefEs : item.href,
  }))
}