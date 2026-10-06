'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'

export function AcceptProposalButton({ token, continueToSigning = false, alreadyAccepted = false }: { token: string; continueToSigning?: boolean; alreadyAccepted?: boolean }) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')
  const [error, setError] = useState('')
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const accept = async (attempt = 0) => {
    if (attempt === 0 && busy.current) return
    busy.current = true
    setState('working'); setError('')
    try {
      const response = await fetch(`/api/public/proposals/${encodeURIComponent(token)}/accept`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'We could not prepare your agreement.')
      if (data.signingUrl) window.location.assign(data.signingUrl)
      else if (data.agreementPreparing && attempt < 12) {
        timer.current = setTimeout(() => { void accept(attempt + 1) }, 1_500)
      }
      else if (continueToSigning) throw new Error('Your proposal is accepted. The agreement is still being prepared. Please try Continue again in a moment.')
      else window.location.reload()
    } catch (cause) {
      busy.current = false
      setState('error'); setError(cause instanceof Error ? cause.message : 'We could not prepare your agreement.')
    }
  }
  return <div className="space-y-2"><button type="button" onClick={() => { void accept() }} disabled={state === 'working'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#caa24c] px-6 text-xs font-black uppercase tracking-wider text-[#130e08] transition hover:bg-[#dfbd68] disabled:cursor-wait disabled:opacity-60"><Check size={16} /> {state === 'working' ? 'Preparing agreement…' : alreadyAccepted ? 'Continue to agreement' : continueToSigning ? 'Accept & continue to agreement' : 'Accept final proposal'}</button>{state === 'error' ? <p role="alert" className="max-w-md text-xs leading-5 text-red-300">{error}</p> : null}</div>
}

/** @deprecated Use AcceptProposalButton. Kept only for older portal imports. */
export const AcceptEstimateButton = AcceptProposalButton
