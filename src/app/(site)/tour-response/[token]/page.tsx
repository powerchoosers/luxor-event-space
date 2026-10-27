'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function TourResponsePage() {
  const params = useParams<{ token: string }>()
  const [action, setAction] = useState<'confirm' | 'reschedule' | 'cancel'>('confirm')
  const [status, setStatus] = useState<'loading' | 'ready' | 'success' | 'error'>('loading')
  const [expectedSequence, setExpectedSequence] = useState<number | null>(null)
  const [message, setMessage] = useState('Recording your response...')

  useEffect(() => {
    let active = true
    const requested = new URLSearchParams(window.location.search).get('action')
    const requestedAction = requested === 'cancel' ? 'cancel' : requested === 'reschedule' ? 'reschedule' : 'confirm'
    setAction(requestedAction)
    if (requestedAction === 'cancel') {
      setMessage('Loading your current tour...')
      void (async () => {
        try {
          const response = await fetch('/api/public/tour-response', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
            body: JSON.stringify({ token: params.token, action: 'cancel_preview' }),
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'Unable to load your tour.')
          if (data.alreadyCancelled === true) {
            if (!active) return
            setMessage('Your tour has been cancelled.')
            setStatus('success')
            return
          }
          if (!Number.isSafeInteger(data.sequence) || typeof data.dateTime !== 'string') throw new Error('Unable to load your tour.')
          if (!active) return
          setExpectedSequence(data.sequence)
          setMessage(`Cancel your tour on ${data.dateTime}?`)
          setStatus('ready')
        } catch (error) {
          if (!active) return
          setMessage(error instanceof Error ? error.message : 'Unable to load your tour.')
          setStatus('error')
        }
      })()
      return () => { active = false }
    }
    if (requestedAction === 'reschedule') {
      setStatus('ready')
      setMessage('Choose how you would like to change your tour.')
      return () => { active = false }
    }

    async function submitResponse() {
      try {
        const response = await fetch('/api/public/tour-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: params.token, action: requestedAction }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to record your response.')
        if (!active) return
        setStatus('success')
        setMessage(requestedAction === 'confirm'
          ? 'Your tour is confirmed. Luxor Event Space has your response.'
          : 'Your reschedule request was received. Luxor Event Space will follow up with new times.'
        )
      } catch (error) {
        if (!active) return
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Unable to record your response.')
      }
    }

    submitResponse()
    return () => {
      active = false
    }
  }, [params.token])

  async function submitChange(requestedAction: 'cancel' | 'reschedule') {
    setStatus('loading')
    setMessage(requestedAction === 'cancel' ? 'Cancelling your tour...' : 'Sending your request...')
    try {
      const response = await fetch('/api/public/tour-response', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, action: requestedAction, ...(requestedAction === 'cancel' ? { expectedSequence } : {}) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to cancel your tour.')
      setStatus('success')
      setMessage(requestedAction === 'cancel' ? 'Your tour has been cancelled.' : 'Your reschedule request was received. Luxor Event Space will follow up with new times.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to cancel your tour.')
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-20 text-[#f6efe8]">
      <section className="mx-auto max-w-xl rounded-2xl border border-[#caa24c]/25 bg-[#120d0c]/80 p-8 text-center shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#caa24c]">Luxor Event Space</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold">
          {status === 'loading' ? 'One moment' : status === 'ready' ? action === 'cancel' ? 'Cancel your tour?' : 'Manage your tour' : status === 'success' ? action === 'cancel' ? 'Tour cancelled' : 'Response received' : 'Link issue'}
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300">{message}</p>
        {status === 'ready' && action === 'cancel' && expectedSequence !== null ? (
          <button type="button" onClick={() => void submitChange('cancel')} className="mt-8 inline-flex rounded-lg bg-[#caa24c] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#050505] hover:bg-[#dfba65]">
            Confirm cancellation
          </button>
        ) : null}
        {status === 'ready' && action === 'reschedule' ? (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => void submitChange('reschedule')} className="rounded-lg bg-[#caa24c] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#050505] hover:bg-[#dfba65]">Request reschedule</button>
            <a href="?action=cancel" className="rounded-lg border border-[#caa24c]/30 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#f1d27a] hover:bg-[#caa24c]/10">Cancel tour</a>
          </div>
        ) : null}
        <Link
          href="/"
          className="mt-8 inline-flex rounded-lg border border-[#caa24c]/30 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-[#f1d27a] hover:bg-[#caa24c]/10"
        >
          Back to Luxor
        </Link>
      </section>
    </main>
  )
}
