'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import React, { useContext, useState } from 'react'
import { LayoutRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'

// Freezes the Next.js App Router context to preserve the current page elements during exit transitions
function FrozenRoute({ children }: { children: React.ReactNode }) {
  const context = useContext(LayoutRouterContext)
  const [frozen] = useState(context)

  if (!context) {
    return <>{children}</>
  }

  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  )
}

export function RouteTransition({
  children,
  surface = 'site',
  fillAvailableHeight = false,
}: {
  children: React.ReactNode
  surface?: 'site' | 'portal'
  fillAvailableHeight?: boolean
}) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  const isPortal = surface === 'portal'
  const portalClass = 'flex-1 min-h-full w-full flex flex-col transform-gpu'

  if (reduceMotion) {
    return isPortal ? <div className={portalClass}>{children}</div> : <>{children}</>
  }

  const initialState = isPortal
    ? { opacity: 0, y: 8 }
    : { opacity: 0, y: 16, filter: 'blur(6px)' }
  const animateState = isPortal
    ? { opacity: 1, y: 0 }
    : { opacity: 1, y: 0, filter: 'blur(0px)' }
  const exitState = isPortal
    ? { opacity: 0, y: -4 }
    : { opacity: 0, y: -10, filter: 'blur(4px)' }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        id={`route-transition-${pathname.replace(/[^a-zA-Z0-9-]/g, '_')}`}
        key={pathname}
        className={isPortal ? portalClass : 'min-h-screen'}
        initial={initialState}
        animate={animateState}
        exit={exitState}
        transition={{ duration: isPortal ? 0.16 : 0.32, ease: [0.23, 1, 0.32, 1] }}
        onAnimationComplete={() => {
          const safeId = `route-transition-${pathname.replace(/[^a-zA-Z0-9-]/g, '_')}`
          const el = document.getElementById(safeId)
          if (el) {
            el.style.filter = ''
            el.style.transform = ''
          }
        }}
      >
        <FrozenRoute>{children}</FrozenRoute>
      </motion.div>
    </AnimatePresence>
  )
}
