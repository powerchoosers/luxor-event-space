"use client"

import React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

interface AnimatedCircularProgressBarProps {
  max?: number
  min?: number
  value: number
  gaugePrimaryColor?: string
  gaugeSecondaryColor?: string
  className?: string
  label?: string
  subLabel?: string
  size?: number
  strokeWidth?: number
}

export function AnimatedCircularProgressBar({
  max = 100,
  min = 0,
  value = 0,
  gaugePrimaryColor = "#caa24c",
  gaugeSecondaryColor = "rgba(202, 162, 76, 0.16)",
  className,
  label,
  subLabel,
  size,
  strokeWidth,
}: AnimatedCircularProgressBarProps) {
  const prefersReducedMotion = useReducedMotion()
  const circumference = 2 * Math.PI * 42
  const clamped = Math.max(min, Math.min(max, value))
  const currentPercent = Math.round(((clamped - min) / Math.max(1, max - min)) * 100)
  const effectiveStrokeWidth = strokeWidth ? Math.max(6, Math.min(12, strokeWidth * 2)) : 10
  const targetOffset = circumference - (currentPercent / 100) * circumference

  return (
    <div
      className={cn("relative size-16 text-xs font-extrabold tabular-nums select-none", className)}
      style={{
        ...(size ? { width: `${size}px`, height: `${size}px` } : {}),
        transform: "translateZ(0)",
      }}
    >
      <svg
        fill="none"
        className="size-full"
        strokeWidth="2"
        viewBox="0 0 100 100"
      >
        <circle
          cx="50"
          cy="50"
          r="42"
          strokeWidth={effectiveStrokeWidth}
          strokeDashoffset="0"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            stroke: gaugeSecondaryColor,
          }}
        />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          strokeWidth={effectiveStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-100"
          style={{
            stroke: gaugePrimaryColor,
            transform: "rotate(-90deg)",
            transformOrigin: "50px 50px",
          }}
          strokeDasharray={circumference}
          initial={{
            strokeDashoffset: prefersReducedMotion ? targetOffset : circumference,
          }}
          whileInView={{
            strokeDashoffset: targetOffset,
          }}
          viewport={{ once: true, margin: "0px 0px -30px 0px" }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.95,
            ease: [0.22, 1, 0.36, 1],
            delay: prefersReducedMotion ? 0 : 0.1,
          }}
        />
      </svg>
      <span
        data-current-value={currentPercent}
        className="absolute inset-0 m-auto flex flex-col items-center justify-center size-fit leading-none text-[color:var(--portal-text)]"
      >
        <span>{label ?? `${currentPercent}%`}</span>
        {subLabel ? (
          <span className="mt-0.5 text-[7px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
            {subLabel}
          </span>
        ) : null}
      </span>
    </div>
  )
}
