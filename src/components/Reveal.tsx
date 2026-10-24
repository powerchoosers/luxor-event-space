'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { useRef, type ReactNode } from 'react'

const LUXOR_EASE = [0.22, 1, 0.36, 1] as const

type RevealProps = {
  children: ReactNode
  className?: string
  delay?: number
  /**
   * The animation direction/style.
   * 'up' (default): slides up from below
   * 'down': slides down from above
   * 'left': slides from left
   * 'right': slides from right
   * 'scale': zooms in
   * 'blur': soft blur in
   */
  variant?: 'up' | 'down' | 'left' | 'right' | 'scale' | 'blur'
  /** Whether to include a subtle blur-in during entrance. Default true. */
  blur?: boolean
  /** If true, the trigger won't repeat when scrolling back up. */
  once?: boolean
  /** Scale factor for the 'scale' variant or movement amount for directions. */
  amount?: number
}

const variants: Variants = {
  hidden: (custom: { variant: string; amount: number; blur: boolean }) => {
    const filterStyle = custom.blur ? { filter: 'blur(10px)', opacity: 0.35 } : { opacity: 0 }
    switch (custom.variant) {
      case 'up': return { y: custom.amount, ...filterStyle }
      case 'down': return { y: -custom.amount, ...filterStyle }
      case 'left': return { x: -custom.amount, ...filterStyle }
      case 'right': return { x: custom.amount, ...filterStyle }
      case 'scale': return { scale: 0.97, ...filterStyle }
      case 'blur': return { opacity: 0.4, filter: 'blur(12px)', y: 8 }
      default: return { y: custom.amount, ...filterStyle }
    }
  },
  visible: (custom: { delay: number }) => ({
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.58,
      delay: custom.delay / 1000,
      ease: LUXOR_EASE,
    },
  }),
}

export function Reveal({
  children,
  className = '',
  delay = 0,
  variant = 'up',
  blur = true,
  once = true,
  amount = 24,
}: RevealProps) {
  const shouldReduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '-10% 0px' }}
      variants={variants}
      custom={{ variant, amount, delay, blur }}
      className={`transform-gpu ${className}`}
      onAnimationComplete={(definition) => {
        if (definition === 'visible' && ref.current) {
          ref.current.style.filter = 'none'
          ref.current.style.transform = 'none'
        }
      }}
    >
      {children}
    </motion.div>
  )
}
