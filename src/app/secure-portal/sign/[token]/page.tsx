'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  LoaderCircle,
  LockKeyhole,
  PenLine,
  RotateCcw,
  Type,
} from 'lucide-react'
import type { LuxorSignatureRequest } from '@/lib/luxorInquiryTypes'
import { LUXOR_LEGACY_CONTRACT_SIGNATURE_PLACEMENT, type LuxorContractSignaturePlacement } from '@/lib/luxorSignaturePlacement'

const ContractPdfViewer = dynamic(() => import('./ContractPdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[560px] items-center justify-center text-[#b9afa3]">
      <LoaderCircle className="mr-2 animate-spin" size={18} /> Preparing agreement…
    </div>
  ),
})

type SignatureMode = 'type' | 'draw'
type PublicLuxorSignatureRequest = LuxorSignatureRequest & {
  signature_placement?: LuxorContractSignaturePlacement
}

function createTypedSignature(name: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 220
  const context = canvas.getContext('2d')
  if (!context) return null

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#2d251e'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  let size = 104
  context.font = `italic ${size}px Georgia, serif`
  while (context.measureText(name).width > 900 && size > 42) {
    size -= 2
    context.font = `italic ${size}px Georgia, serif`
  }
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 5)
  return canvas.toDataURL('image/png')
}

function DrawSignature({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const next = point(event)
    if (!canvas || !next) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    const context = canvas.getContext('2d')
    if (!context) return
    context.beginPath()
    context.moveTo(next.x, next.y)
  }

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const next = point(event)
    if (!canvas || !next) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.lineTo(next.x, next.y)
    context.strokeStyle = '#2d251e'
    context.lineWidth = 5
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.stroke()
  }

  const finish = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    onChange(null)
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-[#d8d0c4] bg-[#fffdfa]">
        <canvas
          ref={canvasRef}
          width={900}
          height={240}
          className="block h-36 w-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={draw}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
        {!value && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#a39a8d]">
            Sign here
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-7 bottom-8 border-b border-[#d8d0c4]" />
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#7b7165] transition hover:text-[#2d251e]"
      >
        <RotateCcw size={13} /> Clear
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-6">
      <div className="text-center">
        <LoaderCircle className="mx-auto animate-spin text-[#c49a59]" size={30} />
        <p className="mt-4 text-sm text-[#b9afa3]">Opening your agreement…</p>
      </div>
    </div>
  )
}

export default function SignaturePage() {
  const params = useParams<{ token: string }>()
  const [signature, setSignature] = useState<PublicLuxorSignatureRequest | null>(null)
  const [signedName, setSignedName] = useState('')
  const [mode, setMode] = useState<SignatureMode>('type')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(0)
  const viewerRef = useRef<HTMLDivElement | null>(null)

  const pdfUrl = useMemo(() => {
    const kind = complete ? 'executed' : 'contract'
    return `/api/public/signatures/download?token=${encodeURIComponent(params.token)}&kind=${kind}`
  }, [complete, params.token])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = await fetch(`/api/public/signatures?token=${encodeURIComponent(params.token)}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to open this agreement.')
        if (!active) return
        setSignature(data)
        setSignedName(data.signed_name || data.client_name || '')
        setComplete(data.status === 'signed')
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to open this agreement.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [params.token])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const measure = () => setPageWidth(Math.max(280, Math.min(820, viewer.clientWidth - 32)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewer)
    return () => observer.disconnect()
  }, [loading, error])

  useEffect(() => {
    if (complete || mode !== 'type') return
    const name = signedName.trim()
    setSignatureDataUrl(name ? createTypedSignature(name) : null)
  }, [complete, mode, signedName])

  useEffect(() => {
    viewerRef.current?.scrollTo({ top: 0, left: 0 })
  }, [pageNumber, pdfUrl])

  const chooseMode = (nextMode: SignatureMode) => {
    setMode(nextMode)
    setSignatureDataUrl(nextMode === 'type' && signedName.trim() ? createTypedSignature(signedName.trim()) : null)
  }

  const signaturePlacement = signature?.signature_placement || LUXOR_LEGACY_CONTRACT_SIGNATURE_PLACEMENT

  const goToSignature = useCallback(() => {
    setPageNumber(signaturePlacement.pageIndex + 1)
    if (window.matchMedia('(max-width: 1023px)').matches) {
      viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      viewerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [signaturePlacement.pageIndex])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!signatureDataUrl) {
      setError('Please add your signature before completing the agreement.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch('/api/public/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, signedName, accepted, signatureDataUrl }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to complete the agreement.')
      setSignature(data)
      setComplete(true)
      setPageNumber(1)
      setNumPages(0)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to complete the agreement.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState />

  if (!signature) {
    return (
      <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-5">
        <div className="max-w-md rounded-2xl border border-white/10 bg-[#211d18] p-8 text-center shadow-2xl">
          <AlertCircle className="mx-auto text-[#d79b8d]" size={30} />
          <h1 className="mt-4 font-serif text-2xl text-[#f5ede3]">We couldn’t open this agreement</h1>
          <p className="mt-3 text-sm leading-6 text-[#b9afa3]">{error || 'The signing link is no longer available. Please contact Luxor Event Space for a new link.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col px-3 py-3 sm:px-5 lg:h-full lg:min-h-0 lg:overflow-hidden lg:py-3">
      <div className="mb-3 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#c9a76e]">
            <FileText size={13} /> {complete ? 'Completed agreement' : 'Ready for your review'}
          </div>
          <h1 className="truncate font-serif text-[22px] font-medium leading-none text-[#f7f1e8] sm:text-2xl">
            {signature.contract_title || 'Event Space Agreement'}
          </h1>
          <p className="mt-1 text-[11px] text-[#9f9589]">Prepared for {signature.client_name}</p>
        </div>
        <a
          href={pdfUrl}
          download
          className="inline-flex h-9 w-fit shrink-0 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.025] px-3 text-[11px] font-semibold text-[#d9cec0] transition hover:border-[#c49a59]/45 hover:bg-white/[0.05] hover:text-white"
        >
          <Download size={14} /> Download {complete ? 'executed copy' : 'PDF'}
        </a>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-white/10 bg-[#211d18] shadow-[0_24px_70px_rgba(0,0,0,0.34)] lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-w-0 flex-col border-b border-white/10 lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 bg-[#1b1814] px-3 sm:px-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9f9589]">
              <FileText size={13} className="text-[#c9a76e]" /> Agreement preview
            </div>
            {!complete && (
              <button type="button" onClick={goToSignature} className="text-[11px] font-semibold text-[#d5b477] transition hover:text-[#f0d5a4]">
                Go to signature
              </button>
            )}
          </div>

          <div ref={viewerRef} className="h-[68svh] min-h-[500px] overflow-auto bg-[#302b25] p-3 sm:p-5 lg:h-auto lg:min-h-0 lg:flex-1">
            <ContractPdfViewer
              pdfUrl={pdfUrl}
              pageNumber={pageNumber}
              pageWidth={pageWidth}
              signaturePlacement={signaturePlacement}
              signatureDataUrl={signatureDataUrl}
              complete={complete}
              onLoad={(count) => {
                setNumPages(count)
                setPageNumber((page) => Math.min(page, count))
              }}
              onError={() => setError('The PDF could not be displayed. You can still download it above.')}
            />
          </div>

          <div className="flex h-11 shrink-0 items-center justify-between border-t border-white/10 bg-[#1b1814] px-3 sm:px-4">
            <span className="hidden text-[9px] font-semibold uppercase tracking-[0.14em] text-[#766d64] sm:block">Use arrows to review</span>
            <div className="mx-auto flex items-center rounded-lg border border-white/10 bg-[#12100d] p-0.5 sm:mx-0">
              <button
                type="button"
                aria-label="Previous page"
                title="Previous page"
                onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
                disabled={pageNumber <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#d9cec0] transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="min-w-[66px] px-2 text-center text-[10px] font-bold tabular-nums text-[#c5baad]">
                {pageNumber} <span className="font-medium text-[#71685f]">of</span> {numPages || '—'}
              </span>
              <button
                type="button"
                aria-label="Next page"
                title="Next page"
                onClick={() => setPageNumber((page) => Math.min(numPages || page, page + 1))}
                disabled={!numPages || pageNumber >= numPages}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[#d9cec0] transition hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <span className="hidden text-[9px] font-semibold text-[#766d64] sm:block">{numPages || '—'} pages</span>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col bg-[#f4efe7] text-[#2d251e]">
          {complete ? (
            <div className="flex min-h-[520px] flex-1 flex-col lg:min-h-0">
              <div className="flex-1 overflow-y-auto p-6 sm:p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e4f1e7] text-[#2f7547]">
                  <CheckCircle2 size={25} />
                </div>
                <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b7740]">Agreement complete</p>
                <h2 className="mt-2 font-serif text-3xl font-medium leading-tight">You’re all set.</h2>
                <p className="mt-4 text-sm leading-6 text-[#6f665b]">
                  Your signature and Luxor’s countersignature are now part of the agreement. A copy has been sent to {signature.client_email}.
                </p>
                <div className="mt-7 rounded-xl border border-[#ded5c8] bg-[#faf7f2] p-4">
                  <div className="flex items-start gap-3">
                    <Check size={16} className="mt-0.5 text-[#2f7547]" />
                    <div>
                      <p className="text-sm font-semibold">Signed by {signature.signed_name || signature.client_name}</p>
                      <p className="mt-1 text-xs text-[#84796c]">{signature.signed_at ? new Date(signature.signed_at).toLocaleString('en-US') : 'Completed'}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 border-t border-[#ded5c8] bg-[#eee8df] p-4 sm:p-5">
                <a href={pdfUrl} download className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2d251e] px-4 text-sm font-semibold text-white transition hover:bg-[#45392f]">
                  <Download size={16} /> Download executed agreement
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="flex min-h-[650px] flex-1 flex-col lg:min-h-0">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 lg:min-h-0">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b7740]">
                  <LockKeyhole size={13} /> Signature · 1 of 1
                </div>
                <h2 className="mt-3 font-serif text-3xl font-medium leading-tight">Sign your agreement</h2>
                <p className="mt-3 text-sm leading-6 text-[#746a5e]">
                  Your event details are already filled in. Review the PDF, then sign once below. Your signature will be placed on the agreement automatically.
                </p>

                <label className="mt-6 block text-xs font-semibold text-[#554b41]" htmlFor="legal-name">Full legal name</label>
                <input
                  id="legal-name"
                  value={signedName}
                  onChange={(event) => setSignedName(event.target.value)}
                  autoComplete="name"
                  className="mt-2 h-11 w-full rounded-xl border border-[#d8d0c4] bg-[#fffdfa] px-3.5 text-sm text-[#2d251e] outline-none transition placeholder:text-[#aaa095] focus:border-[#b88a44] focus:ring-2 focus:ring-[#b88a44]/15"
                />

                <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-[#e8e1d7] p-1">
                  <button
                    type="button"
                    onClick={() => chooseMode('type')}
                    className={`flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${mode === 'type' ? 'bg-[#fffdfa] text-[#2d251e] shadow-sm' : 'text-[#776d61] hover:text-[#2d251e]'}`}
                  >
                    <Type size={14} /> Type
                  </button>
                  <button
                    type="button"
                    onClick={() => chooseMode('draw')}
                    className={`flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${mode === 'draw' ? 'bg-[#fffdfa] text-[#2d251e] shadow-sm' : 'text-[#776d61] hover:text-[#2d251e]'}`}
                  >
                    <PenLine size={14} /> Draw
                  </button>
                </div>

                <div className="mt-3">
                  {mode === 'type' ? (
                    <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-[#d8d0c4] bg-[#fffdfa] px-5">
                      {signedName.trim() ? (
                        <span className="max-w-full truncate font-serif text-4xl italic text-[#2d251e]">{signedName}</span>
                      ) : (
                        <span className="text-sm text-[#a39a8d]">Type your name above</span>
                      )}
                    </div>
                  ) : (
                    <DrawSignature value={signatureDataUrl} onChange={setSignatureDataUrl} />
                  )}
                </div>

                <button type="button" onClick={goToSignature} className="mt-3 text-xs font-semibold text-[#966f35] transition hover:text-[#5c421d]">
                  Preview signature on document
                </button>

                <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-[#ded5c8] bg-[#faf7f2] p-4">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(event) => setAccepted(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#9b7740]"
                  />
                  <span className="text-xs leading-5 text-[#675e53]">
                    I have reviewed this agreement and consent to use this electronic signature to sign it.
                  </span>
                </label>

                {error && (
                  <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-[#f7e7e2] p-3 text-xs leading-5 text-[#9a4937]">
                    <AlertCircle className="mt-0.5 shrink-0" size={14} /> {error}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 z-10 shrink-0 border-t border-[#ded5c8] bg-[#eee8df]/98 p-4 backdrop-blur sm:p-5 lg:static">
                <button
                  type="submit"
                  disabled={submitting || !accepted || !signedName.trim() || !signatureDataUrl}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2d251e] px-4 text-sm font-semibold text-white transition hover:bg-[#45392f] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? <><LoaderCircle className="animate-spin" size={16} /> Finalizing agreement…</> : <><PenLine size={16} /> Sign & complete agreement</>}
                </button>
                <p className="mt-2 text-center text-[10px] leading-4 text-[#8a8074]">A completed PDF will be emailed to you and Luxor Event Space.</p>
              </div>
            </form>
          )}
        </aside>
      </div>
    </div>
  )
}
