'use client'

import React, { useRef, useSyncExternalStore } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { usePathname } from 'next/navigation'

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
  if (props?.['data-luxor-loading'] === true || props?.['data-luxor-loading'] === 'true') return true
  const type = node.type
  if (typeof type === 'function') {
    const fn = type as unknown as LuxorLoadingType
    if (
      fn.isLuxorLoading ||
      fn.name === 'Loading' ||
      fn.name === 'PortalLoading' ||
      fn.name === 'PortalOverviewLoading' ||
      fn.name === 'PortalLoadingCard' ||
      fn.name === 'SiteLoading'
    ) {
      return true
    }
  }
  if (typeof type === 'object' && type !== null) {
    const obj = type as unknown as LuxorLoadingType
    if (
      obj.isLuxorLoading ||
      obj.name === 'Loading' ||
      obj.name === 'PortalOverviewLoading' ||
      ('displayName' in obj &&
        typeof (obj as { displayName?: string }).displayName === 'string' &&
        ((obj as { displayName: string }).displayName.includes('Loading') ||
          (obj as { displayName: string }).displayName.includes('PortalOverviewLoading')))
    ) {
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

  if (reduceMotion && hydrated && !isPortal) {
    return <div className="min-h-screen">{children}</div>
  }

  const portalVariants: Variants = {
    initial: {
      opacity: 0.65,
      filter: 'blur(12px)',
    },
    animate: {
      opacity: 1,
      filter: 'blur(0px)',
      transition: {
        duration: 0.32,
        ease: LUXOR_EASE,
      },
      transitionEnd: {
        filter: 'none',
      },
    },
    reduced: {
      opacity: 1,
      filter: 'none',
      transition: { duration: 0 },
    },
  }

  if (isPortal) {

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
          {children}
        </motion.div>
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
  }

  const isSuspenseLoading = isNodeLoading(children)
  const transitionKey = `${pathname}-${isSuspenseLoading ? 'loading' : 'content'}`

  return (
    <motion.div
      ref={ref}
      key={transitionKey}
      id={`route-transition-${transitionKey.replace(/[^a-zA-Z0-9-]/g, '_')}`}
      className="luxor-route-stage surface-site min-h-screen transform-gpu"
      initial="initial"
      animate="animate"
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
  )
}
