"use client"

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
import { useInView, useMotionValue, useSpring, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
  prefix?: string
  suffix?: string
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  prefix = "",
  suffix = "",
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const prefersReducedMotion = useReducedMotion()
  const motionValue = useMotionValue(direction === "down" ? value : startValue)
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  })
  const isInView = useInView(ref, { once: true, margin: "0px" })

  const formatNumber = (num: number) => {
    const formatted = Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(Number(num.toFixed(decimalPlaces)))
    return `${prefix}${formatted}${suffix}`
  }

  useEffect(() => {
    if (prefersReducedMotion) {
      if (ref.current) {
        ref.current.textContent = formatNumber(value)
      }
      return
    }

    let timer: ReturnType<typeof setTimeout> | null = null

    if (isInView) {
      timer = setTimeout(() => {
        motionValue.set(direction === "down" ? startValue : value)
      }, delay * 1000)
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [motionValue, isInView, delay, value, direction, startValue, prefersReducedMotion, decimalPlaces, prefix, suffix])

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current && !prefersReducedMotion) {
          ref.current.textContent = formatNumber(latest)
        }
      }),
    [springValue, decimalPlaces, prefix, suffix, prefersReducedMotion]
  )

  return (
    <span
      ref={ref}
      className={cn(
        "inline-block tracking-tight tabular-nums",
        className
      )}
      {...props}
    >
      {formatNumber(prefersReducedMotion || value === 0 ? value : startValue)}
    </span>
  )
}
