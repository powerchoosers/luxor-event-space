/** Prefix public marketing paths with `/es` when the visitor is on a Spanish route. */
export function publicSitePath(path: string, spanish: boolean): string {
  if (!spanish) return path
  if (path.startsWith('/es') || path.startsWith('http')) return path
  if (path === '/') return '/es'
  return `/es${path}`
}

export function publicSiteEventsActive(pathname: string): boolean {
  return (
    pathname === '/events' ||
    pathname === '/es/events' ||
    pathname.startsWith('/events/') ||
    pathname.startsWith('/es/events/')
  )
}