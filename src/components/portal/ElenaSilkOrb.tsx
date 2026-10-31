'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

/** Silk's light ribbons respond to the measured level of the live conversation. */
export function ElenaSilkOrb({ level, size = 96 }: { level: number; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const levelRef = useRef(level)
  const reduceMotion = useReducedMotion()

  useEffect(() => { levelRef.current = level }, [level])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    let frame = 0
    let previous = 0
    let intensity = 0

    const draw = (ms: number) => {
      const elapsed = previous ? Math.min(0.1, (ms - previous) / 1000) : 1 / 60
      previous = ms
      // The voice client reports RMS multiplied by 4.5; use the sandbox's
      // sensitivity curve and its quick attack / softer release.
      const rms = Math.max(0, Math.min(1, levelRef.current)) / 4.5
      const target = reduceMotion ? 0 : Math.min(1, Math.pow(Math.max(0, rms - 0.006) * 11, 0.65))
      intensity += (target - intensity) * (1 - Math.exp(-elapsed / (target > intensity ? 0.055 : 0.23)))
      const t = reduceMotion ? 0 : ms / 1000
      const radius = 83 + intensity * 7

      ctx.setTransform(2, 0, 0, 2, 0, 0)
      ctx.clearRect(0, 0, 280, 280)

      const glow = (x: number, y: number, r: number, color: string) => {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)
        gradient.addColorStop(0, color)
        gradient.addColorStop(1, 'rgba(213,172,89,0)')
        ctx.fillStyle = gradient
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
      const circle = () => {
        ctx.beginPath()
        ctx.arc(140, 140, radius, 0, Math.PI * 2)
        ctx.closePath()
      }

      glow(140, 140, 119 + intensity * 8, 'rgba(196,148,62,.2)')
      circle()
      const surface = ctx.createRadialGradient(134 - radius * 1.2 * 0.23, 132 - radius * 1.2 * 0.3, radius * 1.2 * 0.06, 134, 132, radius * 1.2)
      surface.addColorStop(0, '#fff7e0')
      surface.addColorStop(0.42, '#e9cc8c')
      surface.addColorStop(0.78, '#b98a43')
      surface.addColorStop(1, '#765526')
      ctx.fillStyle = surface
      ctx.fill()

      ctx.save()
      circle()
      ctx.clip()
      ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < 30; i++) {
        ctx.beginPath()
        for (let x = 44; x <= 236; x += 3) {
          const y = 95 + i * 3.2 + Math.sin(x * 0.031 + t * 0.47 + i * 0.17) * (15 + intensity * 28) + Math.sin(x * 0.014 - t * 0.3 + i * 0.4) * 9
          if (x === 44) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(255,244,209,${0.025 + (i % 5) * 0.014})`
        ctx.lineWidth = 1.5 + (i % 3)
        ctx.stroke()
      }
      glow(109, 106, 57 + intensity * 5, 'rgba(255,255,255,.5)')
      ctx.restore()
      circle()
      ctx.strokeStyle = 'rgba(157,108,37,.34)'
      ctx.lineWidth = 1
      ctx.stroke()

      if (!reduceMotion) frame = requestAnimationFrame(draw)
    }

    draw(performance.now())
    return () => cancelAnimationFrame(frame)
  }, [reduceMotion])

  return <canvas ref={canvasRef} width={560} height={560} aria-hidden="true" className="shrink-0" style={{ width: size, height: size }} />
}
