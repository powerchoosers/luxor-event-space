'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

type WaveBandConfig = {
  baseYRatio: number
  strandCount: number
  strandSpacing: number
  amp1: number
  freq1: number
  speed1: number
  amp2: number
  freq2: number
  speed2: number
  phaseSpread: number
  twistSpeed: number
  maxAlpha: number
  ribbonFillAlpha: number
}

const WAVE_BANDS: WaveBandConfig[] = [
  // Upper sweeping silk ribbon
  {
    baseYRatio: 0.24,
    strandCount: 14,
    strandSpacing: 5.2,
    amp1: 58,
    freq1: 0.0018,
    speed1: 0.34,
    amp2: 28,
    freq2: 0.0039,
    speed2: -0.22,
    phaseSpread: 0.13,
    twistSpeed: 0.28,
    maxAlpha: 0.28,
    ribbonFillAlpha: 0.055,
  },
  // Center hero crest (sweeps gracefully behind the login card)
  {
    baseYRatio: 0.52,
    strandCount: 18,
    strandSpacing: 6.4,
    amp1: 82,
    freq1: 0.00145,
    speed1: 0.26,
    amp2: 38,
    freq2: 0.0031,
    speed2: -0.19,
    phaseSpread: 0.115,
    twistSpeed: 0.22,
    maxAlpha: 0.38,
    ribbonFillAlpha: 0.075,
  },
  // Lower foreground tide
  {
    baseYRatio: 0.81,
    strandCount: 15,
    strandSpacing: 5.8,
    amp1: 66,
    freq1: 0.00165,
    speed1: -0.29,
    amp2: 32,
    freq2: 0.0035,
    speed2: 0.24,
    phaseSpread: 0.125,
    twistSpeed: -0.25,
    maxAlpha: 0.32,
    ribbonFillAlpha: 0.06,
  },
]

function computeWaveY(
  x: number,
  width: number,
  baseY: number,
  strandIdx: number,
  strandCenter: number,
  band: WaveBandConfig,
  t: number,
) {
  const normalizedStrand = strandIdx - strandCenter
  const phase = strandIdx * band.phaseSpread

  // Primary and secondary harmonic traveling waves
  const primary = Math.sin(x * band.freq1 + t * band.speed1 + phase) * band.amp1
  const secondary = Math.cos(x * band.freq2 + t * band.speed2 - phase * 0.7) * band.amp2

  // 3D silk ribbon twist: strands pinch and fan out organically across X and time
  const twistEnvelope = Math.sin(x * 0.0021 - t * band.twistSpeed + band.baseYRatio * 4)
  const pinchFactor = 0.28 + 0.72 * (0.5 + 0.5 * twistEnvelope)
  const strandOffset = normalizedStrand * band.strandSpacing * pinchFactor

  // Subtle diagonal tilt so waves feel architectural rather than flatly horizontal
  const tilt = ((x / Math.max(width, 1)) - 0.5) * -36

  return baseY + tilt + primary + secondary + strandOffset
}

export function PortalLoginWaveBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId = 0
    let width = 0
    let height = 0
    let dpr = 1

    const updateSize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    updateSize()
    window.addEventListener('resize', updateSize)

    const isDarkTheme = () => document.body.dataset.portalTheme === 'dark'

    const startTime = performance.now()

    const renderFrame = (now: number) => {
      const elapsedSeconds = reduceMotion ? 4.2 : (now - startTime) * 0.001
      const dark = isDarkTheme()

      ctx.clearRect(0, 0, width, height)

      // 1. Soft atmospheric gold aura behind the center axis
      const centerGlow = ctx.createRadialGradient(
        width * 0.5,
        height * 0.46,
        10,
        width * 0.5,
        height * 0.46,
        Math.max(width, height) * 0.56,
      )
      if (dark) {
        centerGlow.addColorStop(0, 'rgba(202, 162, 76, 0.11)')
        centerGlow.addColorStop(0.5, 'rgba(184, 135, 55, 0.04)')
        centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      } else {
        centerGlow.addColorStop(0, 'rgba(202, 162, 76, 0.14)')
        centerGlow.addColorStop(0.52, 'rgba(184, 135, 55, 0.05)')
        centerGlow.addColorStop(1, 'rgba(251, 250, 246, 0)')
      }
      ctx.fillStyle = centerGlow
      ctx.fillRect(0, 0, width, height)

      const stepX = width < 640 ? 12 : 16

      // 2. Render each 3D silk wave band
      for (let b = 0; b < WAVE_BANDS.length; b++) {
        const band = WAVE_BANDS[b]
        const baseY = height * band.baseYRatio
        const strandCenter = (band.strandCount - 1) / 2

        // Soft volumetric silk wash between top and bottom strand of the band
        ctx.beginPath()
        for (let x = 0; x <= width + stepX; x += stepX) {
          const clampedX = Math.min(x, width)
          const yTop = computeWaveY(clampedX, width, baseY, 0, strandCenter, band, elapsedSeconds)
          if (x === 0) ctx.moveTo(clampedX, yTop)
          else ctx.lineTo(clampedX, yTop)
        }
        for (let x = width; x >= -stepX; x -= stepX) {
          const clampedX = Math.max(x, 0)
          const yBottom = computeWaveY(
            clampedX,
            width,
            baseY,
            band.strandCount - 1,
            strandCenter,
            band,
            elapsedSeconds,
          )
          ctx.lineTo(clampedX, yBottom)
        }
        ctx.closePath()

        const washGrad = ctx.createLinearGradient(0, baseY - 90, width, baseY + 90)
        const fillPeak = dark ? band.ribbonFillAlpha * 0.9 : band.ribbonFillAlpha
        washGrad.addColorStop(0, 'rgba(202, 162, 76, 0)')
        washGrad.addColorStop(0.22, `rgba(202, 162, 76, ${(fillPeak * 0.65).toFixed(4)})`)
        washGrad.addColorStop(0.5, `rgba(218, 178, 88, ${fillPeak.toFixed(4)})`)
        washGrad.addColorStop(0.78, `rgba(184, 135, 55, ${(fillPeak * 0.65).toFixed(4)})`)
        washGrad.addColorStop(1, 'rgba(184, 135, 55, 0)')
        ctx.fillStyle = washGrad
        ctx.fill()

        // Individual harmonic gold filaments
        for (let s = 0; s < band.strandCount; s++) {
          const distFromCenter = Math.abs(s - strandCenter) / Math.max(strandCenter, 1)
          const bellWeight = Math.cos(distFromCenter * Math.PI * 0.48)
          const isKeyStrand = s === Math.round(strandCenter) || s === 0 || s === band.strandCount - 1

          const alpha = band.maxAlpha * (0.26 + 0.74 * bellWeight) * (dark ? 0.95 : 1)
          const strokeGrad = ctx.createLinearGradient(0, 0, width, 0)

          if (dark) {
            strokeGrad.addColorStop(0, `rgba(214, 182, 102, ${(alpha * 0.08).toFixed(4)})`)
            strokeGrad.addColorStop(0.18, `rgba(214, 182, 102, ${(alpha * 0.72).toFixed(4)})`)
            strokeGrad.addColorStop(0.5, `rgba(241, 210, 122, ${Math.min(alpha * 1.15, 0.65).toFixed(4)})`)
            strokeGrad.addColorStop(0.82, `rgba(202, 162, 76, ${(alpha * 0.72).toFixed(4)})`)
            strokeGrad.addColorStop(1, `rgba(202, 162, 76, ${(alpha * 0.08).toFixed(4)})`)
          } else {
            strokeGrad.addColorStop(0, `rgba(168, 121, 47, ${(alpha * 0.08).toFixed(4)})`)
            strokeGrad.addColorStop(0.18, `rgba(168, 121, 47, ${(alpha * 0.76).toFixed(4)})`)
            strokeGrad.addColorStop(0.5, `rgba(202, 162, 76, ${Math.min(alpha * 1.18, 0.68).toFixed(4)})`)
            strokeGrad.addColorStop(0.82, `rgba(155, 111, 36, ${(alpha * 0.76).toFixed(4)})`)
            strokeGrad.addColorStop(1, `rgba(155, 111, 36, ${(alpha * 0.08).toFixed(4)})`)
          }

          ctx.beginPath()
          for (let x = 0; x <= width + stepX; x += stepX) {
            const clampedX = Math.min(x, width)
            const y = computeWaveY(clampedX, width, baseY, s, strandCenter, band, elapsedSeconds)
            if (x === 0) ctx.moveTo(clampedX, y)
            else ctx.lineTo(clampedX, y)
          }

          ctx.strokeStyle = strokeGrad
          ctx.lineWidth = isKeyStrand ? 1.25 : 0.75 + bellWeight * 0.35
          ctx.stroke()
        }

        // Traveling champagne-gold specular shimmer along the center crest of each ribbon
        if (!reduceMotion) {
          const shimmerProgress = ((elapsedSeconds * (0.075 + b * 0.018) + b * 0.37) % 1.4) - 0.2
          const shimmerCenterX = shimmerProgress * width
          const shimmerSpan = Math.max(width * 0.22, 220)
          const startX = Math.max(0, shimmerCenterX - shimmerSpan * 0.5)
          const endX = Math.min(width, shimmerCenterX + shimmerSpan * 0.5)

          if (endX > startX + 16) {
            ctx.beginPath()
            for (let x = startX; x <= endX; x += 10) {
              const y = computeWaveY(
                x,
                width,
                baseY,
                Math.round(strandCenter),
                strandCenter,
                band,
                elapsedSeconds,
              )
              if (x === startX) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }

            const shimmerGrad = ctx.createLinearGradient(startX, 0, endX, 0)
            shimmerGrad.addColorStop(0, 'rgba(241, 210, 122, 0)')
            shimmerGrad.addColorStop(
              0.5,
              dark ? 'rgba(255, 236, 179, 0.55)' : 'rgba(184, 135, 55, 0.52)',
            )
            shimmerGrad.addColorStop(1, 'rgba(241, 210, 122, 0)')

            ctx.strokeStyle = shimmerGrad
            ctx.lineWidth = 1.85
            ctx.stroke()
          }
        }
      }

      if (!reduceMotion) {
        animationFrameId = window.requestAnimationFrame(renderFrame)
      }
    }

    animationFrameId = window.requestAnimationFrame(renderFrame)

    return () => {
      window.removeEventListener('resize', updateSize)
      if (animationFrameId) window.cancelAnimationFrame(animationFrameId)
    }
  }, [reduceMotion])

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
