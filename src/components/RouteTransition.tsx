'use client'

import React, { useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion'
import { usePathname } from 'next/navigation'

const LUXOR_EASE = [0.22, 1, 0.36, 1] as const

function isNodeLoading(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false
  const props = node.props as Record<string, unknown> | null | undefined
  if (props?.['data-luxor-loading']) return true
  const type = node.type
  if (typeof type === 'function' && (type.name === 'Loading' || type.name === 'PortalLoading' || type.name === 'SiteLoading')) {
    return true
  }
  if (typeof type === 'object' && type !== null && 'name' in type && (type as { name?: string }).name === 'Loading') {
    return true
  }
  if (props && 'children' in props && React.isValidElement(props.children)) {
    return isNodeLoading(props.children)
  }
  return false
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
  const ref = useRef<HTMLDivElement>(null)

  const portalClass = fillAvailableHeight
    ? 'flex-1 min-h-0 min-w-0 h-full w-full flex flex-col overflow-hidden'
    : 'flex-1 min-h-full min-w-0 w-full flex flex-col'

  if (reduceMotion) {
    return isPortal ? <div className={portalClass}>{children}</div> : <div className="min-h-screen">{children}</div>
  }

  const isLoading = isNodeLoading(children)
  const transitionKey = `${pathname}-${isLoading ? 'loading' : 'content'}`

  const portalVariants: Variants = {
    initial: {
      opacity: 0.65,
      y: 6,
      scale: 0.998,
      filter: 'blur(10px)',
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        duration: 0.28,
        ease: LUXOR_EASE,
      },
    },
    exit: {
      opacity: 0,
      y: -6,
      scale: 0.985,
      filter: 'blur(12px)',
      transition: {
        duration: 0.20,
        ease: LUXOR_EASE,
      },
    },
  }

  const siteVariants: Variants = {
    initial: {
      opacity: 0.6,
      y: 10,
      scale: 0.997,
      filter: 'blur(12px)',
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        duration: 0.38,
        ease: LUXOR_EASE,
      },
    },
    exit: {
      opacity: 0,
      y: -8,
      scale: 0.985,
      filter: 'blur(14px)',
      transition: {
        duration: 0.22,
        ease: LUXOR_EASE,
      },
    },
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        ref={ref}
        key={transitionKey}
        id={`route-transition-${transitionKey.replace(/[^a-zA-Z0-9-]/g, '_')}`}
        className={`luxor-route-stage ${isPortal ? `surface-portal ${portalClass}` : 'surface-site min-h-screen'} transform-gpu`}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={isPortal ? portalVariants : siteVariants}
        onAnimationComplete={(definition) => {
          if (definition === 'animate' && ref.current) {
            ref.current.style.filter = 'none'
            ref.current.style.transform = 'none'
          }
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
