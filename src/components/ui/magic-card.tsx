"use client"

import React, { useCallback, useEffect, useRef } from "react"
import {
  motion,
  useMotionTemplate,
  useMotionValue,
} from "motion/react"

import { cn } from "@/lib/utils"

interface MagicCardProps {
  children?: React.ReactNode
  className?: string
  gradientSize?: number
  gradientColor?: string
  gradientOpacity?: number
  gradientFrom?: string
  gradientTo?: string
}

export function MagicCard({
  children,
  className,
  gradientSize = 220,
  gradientColor = "rgba(202, 162, 76, 0.10)",
  gradientOpacity = 1,
  gradientFrom = "rgba(241, 210, 122, 0.55)",
  gradientTo = "rgba(202, 162, 76, 0.15)",
}: MagicCardProps) {
  const mouseX = useMotionValue(-gradientSize)
  const mouseY = useMotionValue(-gradientSize)
  const gradientSizeRef = useRef(gradientSize)

  useEffect(() => {
    gradientSizeRef.current = gradientSize
  }, [gradientSize])

  const reset = useCallback(() => {
    const off = -gradientSizeRef.current
    mouseX.set(off)
    mouseY.set(off)
  }, [mouseX, mouseY])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      mouseX.set(e.clientX - rect.left)
      mouseY.set(e.clientY - rect.top)
    },
    [mouseX, mouseY]
  )

  useEffect(() => {
    reset()
  }, [reset])

  useEffect(() => {
    const handleGlobalPointerOut = (e: PointerEvent) => {
      if (!e.relatedTarget) reset()
    }
    const handleBlur = () => reset()
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") reset()
    }

    window.addEventListener("pointerout", handleGlobalPointerOut)
    window.addEventListener("blur", handleBlur)
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      window.removeEventListener("pointerout", handleGlobalPointerOut)
      window.removeEventListener("blur", handleBlur)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [reset])

  return (
    <motion.div
      className={cn(
        "group relative isolate overflow-hidden rounded-[inherit] border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] transition-colors duration-200 hover:border-[#caa24c]/40",
        className
      )}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      onPointerEnter={reset}
      style={{
        background: useMotionTemplate`
          linear-gradient(var(--portal-card) 0 0) padding-box,
          radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
            ${gradientFrom},
            ${gradientTo},
            var(--portal-border) 100%
          ) border-box
        `,
      }}
    >
      <div className="bg-[color:var(--portal-card)] absolute inset-px z-10 rounded-[inherit]" />
      <motion.div
        suppressHydrationWarning
        className="pointer-events-none absolute inset-px z-20 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
              ${gradientColor},
              transparent 100%
            )
          `,
          opacity: gradientOpacity,
        }}
      />
      <div className={cn("relative z-30 h-full w-full", className?.includes("flex-row") ? "flex flex-row items-center justify-between w-full" : "")}>{children}</div>
    </motion.div>
  )
}
