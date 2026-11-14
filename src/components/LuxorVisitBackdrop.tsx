'use client'

import { motion, useReducedMotion } from 'framer-motion'

export function LuxorVisitBackdrop() {
  const reduceMotion = useReducedMotion()
  return (
        <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden" aria-hidden>
          <motion.div
            animate={reduceMotion ? undefined : { scale: [1, 1.07, 1], opacity: [0.22, 0.34, 0.22] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            className="h-[34rem] w-[34rem] rounded-full blur-3xl sm:h-[44rem] sm:w-[44rem]"
            style={{ background: 'radial-gradient(circle, rgba(202, 162, 76, 0.36) 0%, rgba(185, 138, 61, 0.12) 48%, transparent 72%)' }}
          />
          <motion.svg
            viewBox="0 0 640 640"
            className="absolute h-[36rem] w-[36rem] text-[#caa24c]/30 sm:h-[48rem] sm:w-[48rem]"
            animate={reduceMotion ? undefined : { rotate: 360 }}
            transition={{ duration: 64, repeat: Infinity, ease: 'linear' }}
          >
            <circle cx="320" cy="320" r="290" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 9" />
            <circle cx="320" cy="320" r="245" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.7" />
            <circle cx="320" cy="320" r="195" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="12 18" opacity="0.65" />
            <g stroke="currentColor" strokeWidth="0.9" opacity="0.55">
              {Array.from({ length: 24 }, (_, index) => {
                const angle = (index * 15 * Math.PI) / 180
                const x1 = (320 + Math.cos(angle) * 145).toFixed(4)
                const y1 = (320 + Math.sin(angle) * 145).toFixed(4)
                const x2 = (320 + Math.cos(angle) * 290).toFixed(4)
                const y2 = (320 + Math.sin(angle) * 290).toFixed(4)
                return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />
              })}
            </g>
            <rect x="175" y="175" width="290" height="290" fill="none" stroke="currentColor" strokeWidth="0.85" opacity="0.4" transform="rotate(45 320 320)" />
            <rect x="175" y="175" width="290" height="290" fill="none" stroke="currentColor" strokeWidth="0.85" opacity="0.3" />
          </motion.svg>
          <motion.svg
            viewBox="0 0 420 420"
            className="absolute h-[23rem] w-[23rem] text-[#9b6f24]/28 sm:h-[30rem] sm:w-[30rem]"
            animate={reduceMotion ? undefined : { rotate: -360 }}
            transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
          >
            <circle cx="210" cy="210" r="180" fill="none" stroke="currentColor" strokeWidth="1.1" strokeDasharray="6 14" />
            <polygon points="210,18 228,192 402,210 228,228 210,402 192,228 18,210 192,192" fill="none" stroke="currentColor" strokeWidth="0.95" opacity="0.6" />
          </motion.svg>
        </div>
  )
}
