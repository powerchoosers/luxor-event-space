import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://luxoratlaspalmas.com'
  const routes = [
    '',
    '/events',
    '/events/weddings',
    '/events/quinceaneras',
    '/events/baby-showers',
    '/events/corporate-events',
    '/gallery',
    '/visit',
    '/contact',
    '/privacy',
    '/terms',
    '/es',
    '/es/visit',
    '/es/contact',
  ]

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : route === '/visit' ? 0.9 : 0.7,
  }))
}
