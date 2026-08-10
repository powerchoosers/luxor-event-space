'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'

export function AcceptEstimateButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')
  const [error, setError] = useState('')
  const accept = async () => {
    setState('working'); setError('')
    try {
      const response = await fetch(`/api/public/proposals/${encodeURIComponent(token)}/accept`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'We could not prepare your agreement.')
      if (data.signingUrl) window.location.assign(data.signingUrl)
      else window.location.reload()
    } catch (cause) {
      setState('error'); setError(cause instanceof Error ? cause.message : 'We could not prepare your agreement.')
    }
  }
  return <div className="space-y-2"><button type="button" onClick={accept} disabled={state === 'working'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-6 text-xs font-black uppercase tracking-wider text-[#130e08] transition hover:bg-[#dfbd68] disabled:cursor-wait disabled:opacity-60"><Check size={16} /> {state === 'working' ? 'Preparing agreement…' : 'Accept estimate & continue'}</button>{state === 'error' ? <p className="max-w-md text-xs leading-5 text-red-300">{error}</p> : null}</div>
}
