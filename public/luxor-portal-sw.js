/* Luxor Portal Web Push service worker. Authenticated portal pages are never cached here. */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim().slice(0, 120)
    : 'Luxor Portal'
  const targetUrl = typeof payload.url === 'string' && payload.url.startsWith('/portal')
    ? payload.url
    : '/portal'

  event.waitUntil(self.registration.showNotification(title, {
    body: typeof payload.body === 'string' ? payload.body.slice(0, 240) : 'New activity is ready to review.',
    icon: '/apple-icon.png',
    badge: '/apple-icon.png',
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 64) : 'luxor-portal',
    renotify: true,
    data: { url: targetUrl },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath = event.notification.data && typeof event.notification.data.url === 'string'
    ? event.notification.data.url
    : '/portal'
  const targetUrl = new URL(targetPath.startsWith('/portal') ? targetPath : '/portal', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(targetUrl)
        return client.focus()
      }
    }
    return self.clients.openWindow(targetUrl)
  })())
})
