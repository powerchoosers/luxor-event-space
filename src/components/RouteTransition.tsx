'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { usePathname } from 'next/navigation'
import React from 'react'

export function RouteTransition({
  children,
  surface = 'site',
}: {
  children: React.ReactNode
  surface?: 'site' | 'portal'
}) {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <>{children}</>
  }

  const isPortal = surface === 'portal'

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        className={isPortal ? 'h-full min-h-0' : 'min-h-screen'}
        initial={{ opacity: 0, y: isPortal ? 10 : 16, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: isPortal ? -6 : -10, filter: 'blur(4px)' }}
        transition={{ duration: isPortal ? 0.22 : 0.32, ease: [0.23, 1, 0.32, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
