'use client'

import { useEffect, useRef } from 'react'
import { useMotionValue, useSpring, useReducedMotion } from 'framer-motion'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

interface AnimatedCurrencyTickerProps {
  value: number | null
  fallback?: string
  className?: string
}

export function AnimatedCurrencyTicker({
  value,
  fallback = '—',
  className = '',
}: AnimatedCurrencyTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduceMotion = useReducedMotion()
  const initial = value ?? 0
  const motionValue = useMotionValue(initial)
  const springValue = useSpring(motionValue, {
    damping: 28,
    stiffness: 220,
    mass: 0.8,
  })
  const prevValueRef = useRef<number | null>(value)

  useEffect(() => {
    if (value === null) {
      if (ref.current) ref.current.textContent = fallback
      prevValueRef.current = null
      return
    }

    if (reduceMotion) {
      if (ref.current) ref.current.textContent = currency.format(value)
      prevValueRef.current = value
      return
    }

    if (prevValueRef.current === null) {
      motionValue.jump(value)
      if (ref.current) ref.current.textContent = currency.format(value)
    } else {
      motionValue.set(value)
    }
    prevValueRef.current = value
  }, [value, motionValue, reduceMotion, fallback])

  useEffect(() => {
    if (reduceMotion) return
    return springValue.on('change', (latest) => {
      if (ref.current && value !== null) {
        ref.current.textContent = currency.format(Math.round(latest))
      }
    })
  }, [springValue, reduceMotion, value])

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {value !== null ? currency.format(value) : fallback}
    </span>
  )
}
