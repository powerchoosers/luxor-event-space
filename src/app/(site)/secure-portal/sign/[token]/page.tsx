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
    <main className="min-h-screen bg-[#050505] px-5 py-10 text-[#f6efe8]">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#caa24c]/25 bg-[#120d0c]/82 shadow-2xl">
        <div className="border-b border-[#caa24c]/15 px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#caa24c]">Luxor Event Space</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">{signature?.contract_title || 'Contract Signature'}</h1>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="text-sm text-zinc-400">Loading contract...</p>
          ) : error ? (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>
          ) : signature ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-zinc-800 bg-black/35 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Client</p>
                <p className="mt-1 text-lg font-semibold text-white">{signature.client_name}</p>
                <p className="text-sm text-zinc-400">{signature.client_email}</p>
              </div>

              <div className="whitespace-pre-wrap rounded-xl border border-[#caa24c]/14 bg-black/35 p-5 text-sm leading-7 text-zinc-200">
                {signature.contract_body}
              </div>

              {complete ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                  <h2 className="font-semibold text-emerald-200">Contract signed</h2>
                  <p className="mt-2 text-sm text-emerald-100/80">
                    Signed by {signature.signed_name || signature.client_name}
                    {signature.signed_at ? ` on ${new Date(signature.signed_at).toLocaleString()}` : ''}.
                  </p>
                </div>
              ) : (
                <form onSubmit={submitSignature} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Type your legal name</label>
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
                    <span>I agree that typing my name and submitting this form represents my electronic signature for this Luxor Event Space contract.</span>
                  </label>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-[#caa24c] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-black disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Sign Contract'}
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
