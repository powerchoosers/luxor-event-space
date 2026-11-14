'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

type OverlayState = {
  active: boolean
  locale: 'en' | 'es'
  originPath: string | null
}

let currentOverlayState: OverlayState = {
  active: false,
  locale: 'en',
  originPath: null,
}

const listeners = new Set<(state: OverlayState) => void>()

function emitOverlayState(next: OverlayState) {
  currentOverlayState = next
  listeners.forEach((listener) => listener(next))
}

export function startPackagesSubmissionOverlay(locale: 'en' | 'es' = 'en') {
  const originPath = typeof window !== 'undefined' ? window.location.pathname : null
  emitOverlayState({
    active: true,
    locale,
    originPath,
  })
}

export function stopPackagesSubmissionOverlay() {
  if (!currentOverlayState.active) return
  emitOverlayState({
    ...currentOverlayState,
    active: false,
  })
}

const copy = {
  en: {
    eyebrow: 'Building your Luxor experience',
    title: 'Preparing your custom event inquiry…',
    subtitle: 'Securing your package selection and real-time estimate',
  },
  es: {
    eyebrow: 'Creando tu experiencia Luxor',
    title: 'Preparando tu consulta personalizada…',
    subtitle: 'Guardando tu selección de paquete y estimado en tiempo real',
  },
} as const

const SUNBURST_ANGLES = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75]

export function PackagesSubmissionOverlay() {
  const [state, setState] = useState<OverlayState>(currentOverlayState)
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const handleUpdate = (next: OverlayState) => setState(next)
    listeners.add(handleUpdate)
    return () => {
      listeners.delete(handleUpdate)
    }
  }, [])

  // Immediately trigger the blur-out exit as soon as the destination route mounts (no artificial delay).
  useEffect(() => {
    if (!state.active) return
    if (state.originPath && pathname && pathname !== state.originPath) {
      stopPackagesSubmissionOverlay()
    }
  }, [pathname, state.active, state.originPath])

  const t = copy[state.locale]

  return (
    <AnimatePresence>
      {state.active ? (
        <motion.div
          key="luxor-packages-submission-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { duration: reduceMotion ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] },
          }}
          exit={{
            opacity: 0,
            pointerEvents: 'none',
            transition: { duration: reduceMotion ? 0.12 : 0.38, ease: [0.22, 1, 0.36, 1] },
          }}
          className="fixed inset-0 z-[10080] flex items-center justify-center bg-[#f7f3ec]/86 px-6 text-[#241d17] backdrop-blur-2xl"
          style={{ WebkitBackdropFilter: 'blur(28px) saturate(145%)' }}
        >
          {/* Subtle ambient radial gold warmth */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(202,162,76,0.18),transparent_32rem)]"
          />

          <motion.div
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.96, y: 10, filter: 'blur(16px)' }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : {
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    filter: 'blur(0px)',
                    transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
                  }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 1.02,
                    y: -6,
                    filter: 'blur(16px)',
                    transition: { duration: 0.34, ease: [0.25, 0.1, 0.25, 1] },
                  }
            }
            className="relative z-10 mx-auto flex max-w-md flex-col items-center text-center"
          >
            {/* Architectural Venue Building Graphic */}
            <div className="relative flex h-44 w-52 items-center justify-center">
              <svg
                viewBox="0 0 220 176"
                className="h-full w-full overflow-visible"
                fill="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="luxor-arch-gold" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#9b6f24" />
                    <stop offset="50%" stopColor="#caa24c" />
                    <stop offset="100%" stopColor="#e5c168" />
                  </linearGradient>
                  <radialGradient id="luxor-arch-glow" cx="50%" cy="54%" r="48%">
                    <stop offset="0%" stopColor="rgba(202, 162, 76, 0.24)" />
                    <stop offset="100%" stopColor="rgba(202, 162, 76, 0)" />
                  </radialGradient>
                </defs>

                {/* Soft architectural aura */}
                <motion.circle
                  cx="110"
                  cy="96"
                  r="68"
                  fill="url(#luxor-arch-glow)"
                  animate={
                    reduceMotion
                      ? { opacity: 0.7 }
                      : { opacity: [0.45, 0.9, 0.45], scale: [0.96, 1.04, 0.96] }
                  }
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                />

                {/* 1. Stepped Plinth / Foundation */}
                <motion.path
                  d="M 22 154 H 198 M 34 146 H 186"
                  stroke="url(#luxor-arch-gold)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.3 }}
                  animate={
                    reduceMotion
                      ? { pathLength: 1, opacity: 1 }
                      : { pathLength: [0, 1, 1], opacity: [0.4, 1, 0.85] }
                  }
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.35, 1] }}
                />

                {/* 2. Outer Venue Facade Columns & Stepped Roofline */}
                <motion.path
                  d="M 42 146 V 58 H 178 V 146 M 56 146 V 66 M 164 146 V 66 M 34 58 H 186 M 52 50 H 168 M 76 42 H 144"
                  stroke="url(#luxor-arch-gold)"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0.25 }}
                  animate={
                    reduceMotion
                      ? { pathLength: 1, opacity: 0.9 }
                      : { pathLength: [0, 1, 1], opacity: [0.3, 0.95, 0.75] }
                  }
                  transition={{
                    duration: 2.2,
                    delay: 0.15,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    times: [0, 0.55, 1],
                  }}
                />

                {/* 3. Side Wing Arched Windows */}
                <motion.path
                  d="M 63 132 V 96 A 7 7 0 0 1 77 96 V 132 M 143 132 V 96 A 7 7 0 0 1 157 96 V 132"
                  stroke="#caa24c"
                  strokeOpacity="0.65"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={reduceMotion ? { pathLength: 1 } : { pathLength: [0, 1, 1] }}
                  transition={{
                    duration: 2.2,
                    delay: 0.3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    times: [0, 0.65, 1],
                  }}
                />

                {/* 4. Central Grand Cathedral Archway & Double Portal Doors */}
                <motion.path
                  d="M 82 146 V 94 A 28 28 0 0 1 138 94 V 146 M 88 146 V 95 A 22 22 0 0 1 132 95 V 146 M 110 73 V 146"
                  stroke="url(#luxor-arch-gold)"
                  strokeWidth="1.65"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={reduceMotion ? { pathLength: 1 } : { pathLength: [0, 1, 1] }}
                  transition={{
                    duration: 2.2,
                    delay: 0.22,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    times: [0, 0.65, 1],
                  }}
                />

                {/* 5. Luxor Sunburst Crest inside the Tympanum / Arch Crown */}
                {SUNBURST_ANGLES.map((angle, idx) => {
                  const rad = ((angle - 90) * Math.PI) / 180
                  const x1 = 110 + Math.cos(rad) * 4
                  const y1 = 95 + Math.sin(rad) * 4
                  const len = idx % 2 === 0 ? 16 : 12
                  const x2 = 110 + Math.cos(rad) * len
                  const y2 = 95 + Math.sin(rad) * len
                  return (
                    <motion.line
                      key={angle}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#b98a3d"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      initial={{ opacity: 0.2, pathLength: 0 }}
                      animate={
                        reduceMotion
                          ? { opacity: 0.85, pathLength: 1 }
                          : { opacity: [0.2, 0.95, 0.35], pathLength: [0.2, 1, 0.8] }
                      }
                      transition={{
                        duration: 1.8,
                        delay: 0.35 + idx * 0.035,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )
                })}

                {/* Keystone Diamond Accent */}
                <motion.polygon
                  points="110,26 114,32 110,38 106,32"
                  fill="#caa24c"
                  animate={
                    reduceMotion
                      ? { opacity: 0.9 }
                      : { opacity: [0.35, 1, 0.35], scale: [0.92, 1.08, 0.92] }
                  }
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              </svg>
            </div>

            <p className="mt-2 font-sans text-[11px] font-bold uppercase tracking-[0.22em] text-[#8d672b]">
              {t.eyebrow}
            </p>
            <h2 className="mt-2.5 font-serif text-2xl leading-snug text-[#241d17] sm:text-3xl">
              {t.title}
            </h2>
            <p className="mt-2 text-xs leading-5 text-[#665a4e] sm:text-sm">
              {t.subtitle}
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
