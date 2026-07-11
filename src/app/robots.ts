import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/portal/', '/api/', '/secure-portal/'],
    },
    sitemap: 'https://luxoratlaspalmas.com/sitemap.xml',
  }
}
