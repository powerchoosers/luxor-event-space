'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function PortalTaskCrossOff({ isDone }: { isDone: boolean }) {
  return (
    <AnimatePresence>
      {isDone && (
        <svg
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-2.5 w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 100 10"
          aria-hidden="true"
        >
          <motion.path
            d="M 0 5.2 Q 25 3.2, 50 6.2 T 100 4.6"
            fill="none"
            stroke="#caa24c"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.95 }}
            exit={{ pathLength: 0, opacity: 0 }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      )}
    </AnimatePresence>
  )
}
