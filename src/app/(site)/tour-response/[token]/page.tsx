'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function TourResponsePage() {
  const params = useParams<{ token: string }>()
  const [action, setAction] = useState<'confirm' | 'reschedule'>('confirm')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Recording your response...')

  useEffect(() => {
    let active = true
    const requestedAction = new URLSearchParams(window.location.search).get('action') === 'reschedule' ? 'reschedule' : 'confirm'
    setAction(requestedAction)

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

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-20 text-[#f6efe8]">
      <section className="mx-auto max-w-xl rounded-2xl border border-[#caa24c]/25 bg-[#120d0c]/80 p-8 text-center shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#caa24c]">Luxor Event Space</p>
        <h1 className="mt-4 font-serif text-4xl font-semibold">
          {status === 'loading' ? 'One moment' : status === 'success' ? 'Response received' : 'Link issue'}
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300">{message}</p>
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
