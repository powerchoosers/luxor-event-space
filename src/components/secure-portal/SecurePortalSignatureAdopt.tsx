'use client'

import { useRef } from 'react'
import { RotateCcw } from '@/lib/icons/phosphor-compat'

export function createTypedSignature(name: string) {
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
  const signatureFont = getComputedStyle(document.documentElement).getPropertyValue('--font-signature').trim() || '"Brush Script MT", "Segoe Script", cursive'
  context.font = `${size}px ${signatureFont}`
  while (context.measureText(name).width > 900 && size > 42) {
    size -= 2
    context.font = `${size}px ${signatureFont}`
  }
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 5)
  return canvas.toDataURL('image/png')
}

export function DrawSignature({
  value,
  onChange,
  compact = false,
  placeholder = 'Sign here',
}: {
  value: string | null
  onChange: (value: string | null) => void
  compact?: boolean
  placeholder?: string
}) {
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
          className={`block w-full touch-none cursor-crosshair ${compact ? 'h-20' : 'h-36'}`}
          onPointerDown={start}
          onPointerMove={draw}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
        {!value && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#a39a8d]">
            {placeholder}
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