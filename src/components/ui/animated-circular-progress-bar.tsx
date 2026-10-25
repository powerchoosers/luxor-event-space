"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface AnimatedCircularProgressBarProps {
  max?: number
  min?: number
  value: number
  gaugePrimaryColor: string
  gaugeSecondaryColor: string
  className?: string
  label?: string
}

export function AnimatedCircularProgressBar({
  max = 100,
  min = 0,
  value = 0,
  gaugePrimaryColor,
  gaugeSecondaryColor,
  className,
  label,
}: AnimatedCircularProgressBarProps) {
  const circumference = 2 * Math.PI * 42
  const percentPx = circumference / 100
  const clamped = Math.max(min, Math.min(max, value))
  const currentPercent = Math.round(((clamped - min) / Math.max(1, max - min)) * 100)

  return (
    <div
      className={cn("relative size-16 text-xs font-extrabold tabular-nums select-none", className)}
      style={
        {
          "--circle-size": "100px",
          "--circumference": circumference,
          "--percent-to-px": `${percentPx}px`,
          "--gap-percent": "5",
          "--offset-factor": "0",
          "--transition-length": "900ms",
          "--transition-step": "200ms",
          "--delay": "0s",
          "--percent-to-deg": "3.6deg",
          transform: "translateZ(0)",
        } as React.CSSProperties
      }
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
          strokeWidth="10"
          strokeDashoffset="0"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            stroke: gaugeSecondaryColor,
          }}
        />
        <circle
          cx="50"
          cy="50"
          r="42"
          strokeWidth="10"
          strokeDashoffset="0"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-100"
          style={
            {
              stroke: gaugePrimaryColor,
              "--stroke-percent": currentPercent,
              strokeDasharray:
                "calc(var(--stroke-percent) * var(--percent-to-px)) var(--circumference)",
              transition:
                "stroke-dasharray var(--transition-length) cubic-bezier(0.22, 1, 0.36, 1) var(--delay)",
              transform: "rotate(-90deg)",
              transformOrigin: "50px 50px",
            } as React.CSSProperties
          }
        />
      </svg>
      <span
        data-current-value={currentPercent}
        className="absolute inset-0 m-auto flex flex-col items-center justify-center size-fit text-[color:var(--portal-text)]"
      >
        <span>{label ?? `${currentPercent}%`}</span>
      </span>
    </div>
  )
}
