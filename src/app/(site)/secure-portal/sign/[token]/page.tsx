'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { LuxorSignatureRequest } from '@/lib/luxorInquiryTypes'

export default function SignaturePage() {
  const params = useParams<{ token: string }>()
  const [signature, setSignature] = useState<LuxorSignatureRequest | null>(null)
  const [signedName, setSignedName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    let active = true

    async function loadSignature() {
      try {
        const response = await fetch(`/api/public/signatures?token=${encodeURIComponent(params.token)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load contract.')
        if (!active) return
        setSignature(data)
        setSignedName(data.client_name || '')
        setComplete(data.status === 'signed')
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load contract.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSignature()
    return () => {
      active = false
    }
  }, [params.token])

  const submitSignature = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const response = await fetch('/api/public/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, signedName, accepted }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to submit signature.')
      setSignature(data)
      setComplete(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit signature.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-8 text-[#f6efe8] sm:px-6">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-[#caa24c]/25 bg-[#120d0c]/82 shadow-2xl">
        <div className="border-b border-[#caa24c]/15 px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#caa24c]">Luxor Event Space</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">{signature?.contract_title || 'Event Space Agreement'}</h1>
          <p className="mt-2 text-sm text-zinc-500">Read the agreement, confirm your details, then sign once. Your signature applies everywhere required.</p>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-zinc-400">Loading contract...</p>
          ) : error ? (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>
          ) : signature ? (
            <div className="space-y-6">
              <div className="grid gap-3 rounded-xl border border-zinc-800 bg-black/35 p-5 sm:grid-cols-2">
                <div>
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Client</p>
                <p className="mt-1 text-lg font-semibold text-white">{signature.client_name}</p>
                <p className="text-sm text-zinc-400">{signature.client_email}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Luxor signer</p>
                  <p className="mt-1 text-lg font-semibold text-white">{signature.owner_name || 'Arianna'}</p>
                  <p className="text-sm text-zinc-400">Countersigns automatically after you sign</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#caa24c]/14 bg-black/35">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Agreement PDF</p>
                  <a download href={`/api/public/signatures/download?token=${encodeURIComponent(params.token)}&kind=${complete ? 'executed' : 'contract'}`} className="rounded-lg border border-[#caa24c]/25 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] hover:bg-[#caa24c]/10">
                    Download {complete ? 'executed copy' : 'for reading'}
                  </a>
                </div>
                <iframe title="Luxor Event Space Agreement" src={`/api/public/signatures/download?token=${encodeURIComponent(params.token)}&kind=${complete ? 'executed' : 'contract'}#toolbar=0`} className="h-[62vh] min-h-[480px] w-full bg-white" />
              </div>

              {complete ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                  <h2 className="font-semibold text-emerald-200">Contract signed</h2>
                  <p className="mt-2 text-sm text-emerald-100/80">
                    Signed by {signature.signed_name || signature.client_name} and countersigned by {signature.owner_name || 'Arianna'}
                    {signature.signed_at ? ` on ${new Date(signature.signed_at).toLocaleString()}` : ''}.
                  </p>
                </div>
              ) : (
                <form onSubmit={submitSignature} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Electronic signature — full legal name</label>
                    <input
                      value={signedName}
                      onChange={(event) => setSignedName(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#caa24c]"
                      placeholder="Full legal name"
                    />
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-black/35 p-4 text-sm leading-6 text-zinc-300">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(event) => setAccepted(event.target.checked)}
                      className="mt-1"
                    />
                    <span>I have read the agreement and Guest Guide. I consent to electronic records and agree that the name above is my electronic signature throughout this agreement.</span>
                  </label>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-[#caa24c] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-black disabled:opacity-50"
                  >
                    {submitting ? 'Creating executed copies...' : 'Sign & complete agreement'}
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
