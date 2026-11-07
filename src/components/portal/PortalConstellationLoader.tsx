'use client'

import React from 'react'

export type LuxorLoaderTone = 'gold' | 'white' | 'current'

/**
 * Luxor Portal 3-Dot Kepler 3D Orbit Loader
 *
 * Replaces generic turning wheel spinners (Loader2) and sparkle animations
 * with Luxor's signature 3-dot gold wave that orbits in a smooth 3D Kepler plane.
 *
 * Uses CSS keyframe animations for zero JS runtime overhead and optimal performance.
 */
export function PortalConstellationLoader({
  size = 18,
  tone = 'gold',
  className = '',
  label = 'Loading',
}: {
  size?: number
  tone?: LuxorLoaderTone
  className?: string
  label?: string
}) {
  const isWhite = tone === 'white'
  const isCurrent = tone === 'current'

  // Dot dimensions relative to total size
  // ViewBox: -24 -24 48 48
  return (
    <span
      role="status"
      aria-label={label}
      className={`luxor-kepler-loader inline-flex shrink-0 items-center justify-center select-none ${className}`}
      style={{
        width: size,
        height: size,
      }}
    >
      <svg
        viewBox="-24 -24 48 48"
        width={size}
        height={size}
        className="overflow-visible block"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`luxor-dot-grad-${tone}`} cx="32%" cy="28%" r="70%">
            <stop offset="0%" stopColor={isWhite ? '#ffffff' : isCurrent ? 'currentColor' : '#fff7db'} />
            <stop offset="42%" stopColor={isWhite ? '#f8f4ec' : isCurrent ? 'currentColor' : '#dfbd68'} />
            <stop offset="100%" stopColor={isWhite ? '#dfd4be' : isCurrent ? 'currentColor' : '#a87928'} />
          </radialGradient>
        </defs>

        {/* Dot 1 */}
        <g className="luxor-kepler-dot luxor-kepler-dot-1">
          <circle
            r={size <= 16 ? 4.4 : 3.9}
            fill={isCurrent ? 'currentColor' : `url(#luxor-dot-grad-${tone})`}
          />
        </g>

        {/* Dot 2 */}
        <g className="luxor-kepler-dot luxor-kepler-dot-2">
          <circle
            r={size <= 16 ? 4.4 : 3.9}
            fill={isCurrent ? 'currentColor' : `url(#luxor-dot-grad-${tone})`}
          />
        </g>

        {/* Dot 3 */}
        <g className="luxor-kepler-dot luxor-kepler-dot-3">
          <circle
            r={size <= 16 ? 4.4 : 3.9}
            fill={isCurrent ? 'currentColor' : `url(#luxor-dot-grad-${tone})`}
          />
        </g>
      </svg>
    </span>
  )
}
