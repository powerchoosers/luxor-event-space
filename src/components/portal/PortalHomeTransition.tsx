'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

const ReadyContext = createContext<(() => void) | null>(null)
const ease = [0.22, 1, 0.36, 1] as const

export function PortalHomeReady({ children }: { children: React.ReactNode }) {
  const onReady = useContext(ReadyContext)
  useEffect(() => { onReady?.() }, [onReady])
  return <>{children}</>
}

export function PortalHomeTransition({ skeleton, children }: { skeleton: React.ReactNode; children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [skeletonGone, setSkeletonGone] = useState(false)
  const reducedMotion = useReducedMotion()
  const setReadyTrue = useCallback(() => setReady(true), [])
  return (
    <ReadyContext.Provider value={setReadyTrue}>
      <div className="grid min-w-0 w-full" aria-busy={!ready}>
        {!ready && <span className="sr-only" role="status">Loading portal overview</span>}
        {!skeletonGone && (
          <motion.div
            className={`pointer-events-none z-10 col-start-1 row-start-1 min-w-0 [&_.luxor-skeleton]:transition-[filter] [&_.luxor-skeleton]:duration-300 ${ready ? 'invisible [&_.luxor-skeleton]:visible' : ''} ${ready && !reducedMotion ? '[&_.luxor-skeleton]:blur-md' : ''}`}
            initial={false}
            animate={{ opacity: ready ? 0 : 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.32, ease }}
            onAnimationComplete={() => { if (ready) setSkeletonGone(true) }}
            aria-hidden="true"
          >
            {skeleton}
          </motion.div>
        )}
        <motion.div
          className="col-start-1 row-start-1 min-w-0"
          initial={false}
          animate={{ opacity: ready ? 1 : 0 }}
          transition={{ duration: 0 }}
          style={{ pointerEvents: ready ? 'auto' : 'none' }}
          aria-hidden={!ready}
          inert={!ready}
        >
          {children}
        </motion.div>
      </div>
    </ReadyContext.Provider>
  )
}
