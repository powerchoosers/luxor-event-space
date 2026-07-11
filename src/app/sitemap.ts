import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://luxoratlaspalmas.com'
  const routes = ['', '/events', '/spaces', '/gallery', '/pricing', '/visit', '/grand-opening-rsvp', '/privacy', '/terms']

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : route === '/visit' ? 0.9 : 0.7,
  }))
}
