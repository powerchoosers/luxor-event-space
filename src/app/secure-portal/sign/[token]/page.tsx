'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import {
  CheckCircle2,
  Download,
  Eye,
  FileSignature,
  FileText,
  Lock,
  PenTool,
  ShieldCheck,
  Sparkles,
  Type,
  AlertCircle
} from 'lucide-react'
import type { LuxorSignatureRequest } from '@/lib/luxorInquiryTypes'

// ─── Interactive Signature Pad Canvas Component ────────────────────────────────

function SignaturePad({
  signatureDataUrl,
  setSignatureDataUrl,
}: {
  signatureDataUrl: string | null
  setSignatureDataUrl: (url: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.strokeStyle = '#caa24c'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png')
      setSignatureDataUrl(dataUrl)
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    setSignatureDataUrl(null)
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border border-zinc-800 bg-[#080605] overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="w-full h-36 touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!signatureDataUrl && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-zinc-600 uppercase tracking-widest font-mono">
            Draw your signature here
          </div>
        )}
        <div className="absolute bottom-3 left-6 right-6 border-b border-dashed border-zinc-800 pointer-events-none" />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-zinc-500 font-mono">Use mouse or touch screen to draw</span>
        <button
          type="button"
          onClick={clearCanvas}
          className="text-[10px] font-black uppercase tracking-wider text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
        >
          Clear Pad
        </button>
      </div>
    </div>
  )
}

// ─── Main Signature Room Page ──────────────────────────────────────────────────

export default function SignaturePage() {
  const params = useParams<{ token: string }>()
  const [signature, setSignature] = useState<LuxorSignatureRequest | null>(null)
  const [signedName, setSignedName] = useState('')
  const [signatureMode, setSignatureMode] = useState<'type' | 'draw'>('type')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const [viewMode, setViewMode] = useState<'document' | 'pdf'>('document')

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
        body: JSON.stringify({
          token: params.token,
          signedName,
          accepted,
          signatureDataUrl: signatureMode === 'draw' ? signatureDataUrl : null,
        }),
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

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-[#0d0908] p-12 text-center shadow-2xl">
        <div className="h-10 w-10 mx-auto rounded-full border-2 border-[#caa24c] border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c]">Authenticating Token</p>
        <p className="mt-2 text-xs text-zinc-500">Retrieving digital agreement records for your event...</p>
      </div>
    )
  }

  if (error || !signature) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-rose-500/25 bg-rose-500/5 p-8 text-center shadow-2xl space-y-4">
        <AlertCircle size={32} className="mx-auto text-rose-400" />
        <h2 className="text-lg font-bold text-rose-200">Signature Link Expired or Invalid</h2>
        <p className="text-xs text-rose-300/80 leading-relaxed">
          {error || 'This contract signing link is no longer valid or has been replaced. Please request a fresh agreement link from Luxor Event Space.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Clean Room Document Header Banner */}
      <div className="rounded-2xl border border-[#caa24c]/25 bg-gradient-to-r from-[#120d0c] via-[#1a1310] to-[#120d0c] p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em] text-[#caa24c]">
            <ShieldCheck size={14} className="text-[#caa24c]" />
            Official Luxor Event Agreement
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-white tracking-wide">
            {signature.contract_title || 'Event Space Agreement'}
          </h1>
          <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
            Review your reservation details, venue policies, and payment terms. Confirm your electronic signature below to execute this contract.
          </p>
        </div>

        {/* Action Header Pill */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-black/50 p-1">
            <button
              type="button"
              onClick={() => setViewMode('document')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'document'
                  ? 'bg-[#caa24c] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FileText size={12} />
              React Document View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                viewMode === 'pdf'
                  ? 'bg-[#caa24c] text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Eye size={12} />
              PDF Mode
            </button>
          </div>
          <a
            download
            href={`/api/public/signatures/download?token=${encodeURIComponent(params.token)}&kind=${complete ? 'executed' : 'contract'}`}
            className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] hover:text-white transition-colors cursor-pointer"
          >
            <Download size={12} />
            Download PDF ({complete ? 'Executed Copy' : 'Original Draft'})
          </a>
        </div>
      </div>

      {/* Main View Container: Formatted React Document or PDF Mode */}
      {viewMode === 'pdf' ? (
        <div className="overflow-hidden rounded-2xl border border-[#caa24c]/20 bg-black/50 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 py-3.5">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#caa24c]">
              PDF Viewer Window
            </span>
            <span className="font-mono text-[10px] text-zinc-500">600px print specification</span>
          </div>
          <iframe
            title="Luxor Event Space Agreement PDF"
            src={`/api/public/signatures/download?token=${encodeURIComponent(params.token)}&kind=${complete ? 'executed' : 'contract'}#toolbar=0`}
            className="h-[65vh] min-h-[500px] w-full bg-white"
          />
        </div>
      ) : (
        /* Formatted React Document View (Clean Room Luxury Styling) */
        <div className="rounded-2xl border border-[#caa24c]/25 bg-[#0a0807] p-6 sm:p-10 shadow-2xl space-y-8 relative overflow-hidden">
          {/* Top Decorative Crest Watermark */}
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <Image src="/luxor-portal-mark-gold-tight.png" alt="" width={240} height={240} />
          </div>

          {/* Official Document Header */}
          <div className="border-b border-[#caa24c]/20 pb-6 flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full border border-[#caa24c] bg-[#050505] p-1 flex items-center justify-center shrink-0">
                <Image src="/luxor-portal-mark-gold-tight.png" alt="Luxor Crest" width={44} height={44} className="object-contain" />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-semibold tracking-widest text-[#caa24c] uppercase">Luxor</h2>
                <p className="font-serif text-[8px] tracking-[0.35em] uppercase text-zinc-500">At Las Palmas Events</p>
                <p className="text-[9px] font-mono text-zinc-600 mt-1">803 Castroville Rd #402, San Antonio, TX 78237</p>
              </div>
            </div>

            <div className="text-left sm:text-right font-mono text-[10px] text-zinc-400 space-y-1">
              <p><span className="text-zinc-600 uppercase tracking-widest">Document Token:</span> {params.token.slice(0, 12).toUpperCase()}</p>
              <p><span className="text-zinc-600 uppercase tracking-widest">Execution Date:</span> {signature.signed_at ? new Date(signature.signed_at).toLocaleDateString() : 'Pending Signature'}</p>
              <p className="text-[#caa24c] font-bold uppercase tracking-wider">{complete ? 'Status: EXECUTED & SEALED' : 'Status: AWAITING SIGNATURE'}</p>
            </div>
          </div>

          {/* Parties Involved Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-[#120e0c] p-4 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Client / Host</p>
              <p className="text-sm font-bold text-white">{signature.client_name}</p>
              <p className="text-xs text-zinc-400 font-mono">{signature.client_email}</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-[#120e0c] p-4 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#caa24c]">Luxor Representative</p>
              <p className="text-sm font-bold text-white">{signature.owner_name || 'Arianna Patterson'}</p>
              <p className="text-xs text-zinc-400 font-mono">booking@luxoratlaspalmas.com</p>
            </div>
          </div>

          {/* Rendered Agreement Content Body */}
          <div className="space-y-6 text-xs text-zinc-300 leading-relaxed font-sans border-y border-zinc-800/80 py-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] border-b border-[#caa24c]/15 pb-2">
              Agreement Terms & Specifications
            </h3>

            <div className="space-y-4 whitespace-pre-line text-zinc-300 leading-relaxed">
              {signature.contract_body}
            </div>

            <div className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/5 p-4 space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-[#caa24c]">Venue Policies & Guest Guide</h4>
              <p className="text-[11px] text-zinc-400 leading-normal">
                By completing this electronic signature, the client acknowledges receipt of the Luxor Guest Guide, event setup guidelines, noise ordinances, and deposit settlement schedule.
              </p>
            </div>
          </div>

          {/* Real-time Interactive Signature Stamp Section */}
          <div className="rounded-xl border border-dashed border-[#caa24c]/30 bg-[#120d0c]/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#caa24c]">
                Live Signature Verification Block
              </span>
              <span className="text-[9px] font-mono text-zinc-500">Section 12.A — Binding Consent</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              {/* Client Signature Box */}
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Client Signature</p>
                <div className="h-24 rounded-xl border border-zinc-800 bg-[#050505] p-3 flex flex-col justify-between relative overflow-hidden">
                  {signatureMode === 'draw' && signatureDataUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={signatureDataUrl} alt="Client Signature" className="h-12 object-contain my-auto" />
                  ) : (
                    <div className="my-auto font-serif italic text-2xl text-[#f1d27a] tracking-wide border-b border-dashed border-[#caa24c]/40 pb-1">
                      {signedName || signature.signed_name || signature.client_name}
                    </div>
                  )}
                  <div className="flex justify-between items-center text-[8px] font-mono text-zinc-500 pt-1 border-t border-zinc-850">
                    <span>{complete ? 'EXECUTED' : 'LIVE PREVIEW'}</span>
                    <span>{signature.signed_at ? new Date(signature.signed_at).toLocaleString() : 'Pending Submission'}</span>
                  </div>
                </div>
                <p className="text-[9.5px] font-bold text-white">{signedName || signature.signed_name || signature.client_name}</p>
              </div>

              {/* Owner Countersignature Box */}
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Venue Authorized Signer</p>
                <div className="h-24 rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/5 p-3 flex flex-col justify-between relative overflow-hidden">
                  <div className="my-auto font-serif italic text-2xl text-[#caa24c] tracking-wide border-b border-dashed border-[#caa24c]/40 pb-1">
                    {signature.owner_name || 'Arianna Patterson'}
                  </div>
                  <div className="flex justify-between items-center text-[8px] font-mono text-[#caa24c]/70 pt-1 border-t border-[#caa24c]/15">
                    <span>COUNTERSIGNED</span>
                    <span>Luxor Venue Owner</span>
                  </div>
                </div>
                <p className="text-[9.5px] font-bold text-white">{signature.owner_name || 'Arianna Patterson'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature Interaction Form Section */}
      <div className="rounded-2xl border border-[#caa24c]/25 bg-[#0d0908] p-6 sm:p-8 shadow-2xl">
        {complete ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 space-y-4 text-center">
            <div className="h-12 w-12 rounded-full border border-emerald-400 bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-emerald-200 uppercase tracking-wider">Agreement Fully Executed</h2>
              <p className="mt-1 text-xs text-emerald-100/80 max-w-md mx-auto leading-relaxed">
                Signed by <span className="font-bold text-white">{signature.signed_name || signature.client_name}</span> and countersigned by <span className="font-bold text-white">{signature.owner_name || 'Arianna Patterson'}</span>. Copies have been recorded in the Luxor venue portal.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <a
                download
                href={`/api/public/signatures/download?token=${encodeURIComponent(params.token)}&kind=executed`}
                className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] hover:bg-[#dfbd68] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg cursor-pointer transition-all active:scale-95"
              >
                <Download size={14} /> Download Executed Agreement
              </a>
              <a
                download
                href={`/api/public/signatures/download?token=${encodeURIComponent(params.token)}&kind=guide`}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-black/60 hover:bg-zinc-900 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-200 cursor-pointer transition-all active:scale-95"
              >
                <FileText size={14} /> Download Guest Guide PDF
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={submitSignature} className="space-y-6">
            <div className="border-b border-zinc-800 pb-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#caa24c] flex items-center gap-2">
                  <FileSignature size={15} />
                  Execute Digital Signature
                </h3>

                {/* Signature input mode toggle */}
                <div className="flex items-center gap-1 bg-black p-1 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setSignatureMode('type')}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      signatureMode === 'type' ? 'bg-[#caa24c] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Type size={11} /> Type Name
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureMode('draw')}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      signatureMode === 'draw' ? 'bg-[#caa24c] text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <PenTool size={11} /> Draw Signature
                  </button>
                </div>
              </div>
            </div>

            {signatureMode === 'type' ? (
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                  Electronic Signature — Type Your Full Legal Name
                </label>
                <input
                  required
                  value={signedName}
                  onChange={(e) => setSignedName(e.target.value)}
                  placeholder="Type full legal name..."
                  className="w-full rounded-xl border border-zinc-800 bg-[#050505] px-4 py-3.5 text-sm text-white font-medium outline-none focus:border-[#caa24c] focus:ring-1 focus:ring-[#caa24c]/30 transition-colors"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                  Electronic Signature — Draw Below
                </label>
                <SignaturePad
                  signatureDataUrl={signatureDataUrl}
                  setSignatureDataUrl={setSignatureDataUrl}
                />
              </div>
            )}

            <label className="flex items-start gap-3 rounded-xl border border-zinc-800/80 bg-black/40 p-4 text-xs leading-relaxed text-zinc-300 cursor-pointer transition-colors hover:border-[#caa24c]/30">
              <input
                type="checkbox"
                required
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 shrink-0 accent-[#caa24c]"
              />
              <span>
                I have read and agree to the Luxor Event Space Agreement terms and Guest Guide policies. I consent to electronic records and intend for my electronic signature above to legally execute this contract.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting || !accepted || (signatureMode === 'type' && !signedName.trim())}
              className="w-full rounded-xl bg-[#caa24c] hover:bg-[#dfbd68] py-3.5 text-xs font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-[#caa24c]/15 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Generating Executed Contracts...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Sign & Complete Agreement
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
