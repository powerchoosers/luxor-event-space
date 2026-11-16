'use client'

import React from 'react'

interface PortalHarmonicDotMatrixProps {
  className?: string
  size?: number
  duration?: number
}

/**
 * Harmonic Dot Matrix:
 * Clean, crisp flat gold architectural dots with a subtle diagonal wave displacement.
 * Pixel-aligned without subpixel blur, using discrete geometric transform-origin.
 */
export function PortalHarmonicDotMatrix({
  className = '',
  size = 20,
  duration = 4.2,
}: PortalHarmonicDotMatrixProps) {
  const step = duration * 0.1

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center select-none translate-y-[4.5px] -mr-1 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        className="h-full w-full shape-rendering-crisp overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>
          {`
            @keyframes luxorHarmonicSlightWave {
              0%, 100% {
                transform: translateY(1.2px) scale(0.82);
                opacity: 0.38;
              }
              50% {
                transform: translateY(-1.2px) scale(1.12);
                opacity: 1;
              }
            }
            .luxor-h-dot {
              animation-name: luxorHarmonicSlightWave;
              animation-duration: ${duration}s;
              animation-iteration-count: infinite;
              animation-timing-function: cubic-bezier(0.4, 0, 0.4, 1);
              will-change: transform, opacity;
            }
            @media (prefers-reduced-motion: reduce) {
              .luxor-h-dot {
                animation: none !important;
                opacity: 0.85 !important;
                transform: none !important;
              }
            }
          `}
        </style>

        {/* Row 1 - center of each dot set to exact coordinates */}
        <circle cx="5" cy="5" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '5px 5px', animationDelay: '0s' }} />
        <circle cx="12" cy="5" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '12px 5px', animationDelay: `${(step * 1).toFixed(3)}s` }} />
        <circle cx="19" cy="5" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '19px 5px', animationDelay: `${(step * 2).toFixed(3)}s` }} />

        {/* Row 2 */}
        <circle cx="5" cy="12" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '5px 12px', animationDelay: `${(step * 1).toFixed(3)}s` }} />
        <circle cx="12" cy="12" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '12px 12px', animationDelay: `${(step * 2).toFixed(3)}s` }} />
        <circle cx="19" cy="12" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '19px 12px', animationDelay: `${(step * 3).toFixed(3)}s` }} />

        {/* Row 3 */}
        <circle cx="5" cy="19" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '5px 19px', animationDelay: `${(step * 2).toFixed(3)}s` }} />
        <circle cx="12" cy="19" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '12px 19px', animationDelay: `${(step * 3).toFixed(3)}s` }} />
        <circle cx="19" cy="19" r="2" fill="#caa24c" className="luxor-h-dot" style={{ transformOrigin: '19px 19px', animationDelay: `${(step * 4).toFixed(3)}s` }} />
      </svg>
    </span>
  )
}
