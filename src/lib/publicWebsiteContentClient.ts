'use client'

import { defaultWebsiteContent, parseWebsiteContent, type WebsiteContent } from '@/lib/publicWebsiteContent'

let pending: Promise<WebsiteContent> | undefined

export function loadPublicWebsiteContent(): Promise<WebsiteContent> {
  if (!pending) {
    pending = fetch('/api/public/content?page=public_actions', { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      .then((response) => {
        if (!response.ok) throw new Error('Website content unavailable')
        return response.json()
      })
      .then(parseWebsiteContent)
      .catch(() => defaultWebsiteContent)
      .finally(() => { pending = undefined })
  }
  return pending
}

