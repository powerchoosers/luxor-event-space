'use client'

import React, { useState, useRef } from 'react'

export type SparklineDataPoint = {
  day: number
  dateStr: string
  profit: number
}

interface CashFlowSparklineProps {
  data: SparklineDataPoint[]
}

export function CashFlowSparkline({ data }: CashFlowSparklineProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  if (data.length === 0) {
    return (
      <div className="h-10 w-full flex items-center justify-center text-[10px] text-[color:var(--portal-muted)]">
        No data available
      </div>
    )
  }

  const minVal = Math.min(...data.map((d) => d.profit))
  const maxVal = Math.max(...data.map((d) => d.profit))
  const valRange = maxVal - minVal

  // Compute SVG coordinates (viewBox 0 0 100 30)
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100
    const y = valRange === 0 ? 15 : 30 - ((d.profit - minVal) / valRange) * 26 - 2
    return { x, y }
  })

  const sparklinePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const areaPath = `${sparklinePath} L 100 30 L 0 30 Z`

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const index = Math.min(Math.max(Math.round(percentage * (data.length - 1)), 0), data.length - 1)
    setActiveIndex(index)
  }

  const handleMouseLeave = () => {
    setActiveIndex(null)
  }

  const activePoint = activeIndex !== null ? points[activeIndex] : null
  const activeData = activeIndex !== null ? data[activeIndex] : null

  return (
    <div
      ref={containerRef}
      className="h-14 w-full relative cursor-crosshair select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <svg className="w-full h-full text-[#caa24c]" viewBox="0 0 100 30" fill="none" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#caa24c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#caa24c" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Gradient fill */}
        <path d={areaPath} fill="url(#sparklineGrad)" />

        {/* Sparkline stroke */}
        <path d={sparklinePath} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover vertical line and active dot inside SVG */}
        {activePoint && (
          <>
            <line
              x1={activePoint.x}
              y1={0}
              x2={activePoint.x}
              y2={30}
              stroke="rgba(202, 162, 76, 0.25)"
              strokeWidth="0.75"
              strokeDasharray="2,2"
            />
            <circle cx={activePoint.x} cy={activePoint.y} r="1.5" fill="#ffffff" stroke="#caa24c" strokeWidth="1" />
          </>
        )}
      </svg>

      {/* Tooltip Overlay */}
      {activePoint && activeData && (
        <div
          className="absolute z-30 pointer-events-none bg-[#0b0a08] border border-[#caa24c]/30 rounded px-2 py-1 text-[10px] shadow-xl text-white font-mono flex flex-col gap-0.5"
          style={{
            left: `${activePoint.x}%`,
            top: `${(activePoint.y / 30) * 100}%`,
            transform: 'translate(-50%, -125%)',
          }}
        >
          <span className="text-[8px] text-[color:var(--portal-muted)] uppercase tracking-wider font-sans font-bold">
            {activeData.dateStr}
          </span>
          <span className={`font-bold ${activeData.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {activeData.profit >= 0 ? '+' : '-'}
            {Math.abs(activeData.profit).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </span>
        </div>
      )}
    </div>
  )
}
