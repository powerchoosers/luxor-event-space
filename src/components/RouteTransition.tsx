'use client'

import React, { useRef, useState, useSyncExternalStore } from 'react'
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { PortalLoadingCard } from '@/components/LuxorLoading'

const LUXOR_EASE = [0.22, 1, 0.36, 1] as const
const subscribeToHydration = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

type LuxorLoadingType = {
  isLuxorLoading?: boolean
  name?: string
}

function isNodeLoading(node: React.ReactNode): boolean {
  if (!node) return false
  if (Array.isArray(node)) {
    return node.some(isNodeLoading)
  }
  if (!React.isValidElement(node)) return false
  const props = node.props as Record<string, unknown> | null | undefined
  if (props?.['data-luxor-loading']) return true
  const type = node.type
  if (typeof type === 'function') {
    const fn = type as unknown as LuxorLoadingType
    if (
      fn.isLuxorLoading ||
      fn.name === 'Loading' ||
      fn.name === 'PortalLoading' ||
      fn.name === 'PortalLoadingCard' ||
      fn.name === 'SiteLoading'
    ) {
      return true
    }
  }
  if (typeof type === 'object' && type !== null) {
    const obj = type as unknown as LuxorLoadingType
    if (obj.isLuxorLoading || obj.name === 'Loading') {
      return true
    }
  }
  if (props && 'children' in props) {
    const children = props.children
    if (Array.isArray(children)) {
      return children.some(isNodeLoading)
    }
    if (React.isValidElement(children)) {
      return isNodeLoading(children)
    }
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
  // Keep the first client tree identical to the server, then honor the device preference.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot)
  const isPortal = surface === 'portal'
  const ref = useRef<HTMLDivElement>(null)

  const portalClass = fillAvailableHeight
    ? 'flex-1 min-h-0 min-w-0 h-full w-full flex flex-col overflow-hidden'
    : 'flex-1 min-h-full min-w-0 w-full flex flex-col'

  const isLoading = isNodeLoading(children)
  const [contentCache, setContentCache] = useState<{ content: React.ReactNode }>({
    content: isLoading ? null : children,
  })

  if (!isLoading && children && children !== contentCache.content) {
    setContentCache({ content: children })
  }

  if (reduceMotion && hydrated && !isPortal) {
    return <div className="min-h-screen">{children}</div>
  }

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
      transitionEnd: {
        filter: 'none',
        transform: 'none',
      },
    },
    reduced: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'none',
      transition: { duration: 0 },
      transitionEnd: { transform: 'none' },
    },
  }

  // Next's router child updates even inside an exiting presence wrapper.
  // Replace the portal stage atomically so the destination's first frame is
  // already blurred, instead of showing it in the outgoing page first.
  if (isPortal) {
    const contentToDisplay = isLoading ? contentCache.content : children

    return (
      <div className={`relative ${portalClass}`}>
        <motion.div
          key={pathname}
          id={`route-transition-${pathname.replace(/[^a-zA-Z0-9-]/g, '_')}`}
          className={`luxor-route-stage surface-portal ${portalClass}`}
          initial="initial"
          animate={reduceMotion && hydrated ? 'reduced' : 'animate'}
          variants={portalVariants}
        >
          {contentToDisplay}
        </motion.div>

        <AnimatePresence>
          {isLoading && (
            <motion.div
              key="portal-loading-overlay"
              id="portal-loading-overlay"
              aria-live="polite"
              aria-busy="true"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0.85, filter: 'blur(8px)', scale: 0.99 }
              }
              animate={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 1, filter: 'blur(0px)', scale: 1 }
              }
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      filter: 'blur(16px)',
                      scale: 0.985,
                      transition: { duration: 0.35, ease: LUXOR_EASE },
                    }
              }
              transition={{ duration: 0.25, ease: LUXOR_EASE }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 portal-loading-backdrop transform-gpu"
            >
              <PortalLoadingCard />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
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

  const transitionKey = `${pathname}-${isLoading ? 'loading' : 'content'}`

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        ref={ref}
        key={transitionKey}
        id={`route-transition-${transitionKey.replace(/[^a-zA-Z0-9-]/g, '_')}`}
        className="luxor-route-stage surface-site min-h-screen transform-gpu"
        initial="initial"
        animate="animate"
        exit="exit"
        variants={siteVariants}
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
