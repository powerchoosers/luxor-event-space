'use client'

import { useEffect, useState } from 'react'

export function PortalMagicLinkActivation() {
  const [message, setMessage] = useState('Signing you in…')

  useEffect(() => {
    let cancelled = false

    async function consumeLink() {
      const token = new URLSearchParams(window.location.search).get('token')
      if (!token) throw new Error('This sign-in link is invalid.')

      const response = await fetch('/api/auth/portal-magic-link/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Unable to sign in.')
      }
      window.location.assign('/portal')
    }

    void consumeLink().catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to sign in.')
    })

    return () => { cancelled = true }
  }, [])

  return <main className="grid min-h-screen place-items-center bg-[#050505] p-6 text-center text-[#f7efe3]"><p className="max-w-sm text-sm leading-6">{message}</p></main>
}
