'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { type ReactNode } from 'react'

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
   */
  variant?: 'up' | 'down' | 'left' | 'right' | 'scale'
  /** If true, the trigger won't repeat when scrolling back up. */
  once?: boolean
  /** Scale factor for the 'scale' variant or movement amount for directions. */
  amount?: number
}

const variants: Variants = {
  hidden: (custom: { variant: string; amount: number }) => {
    switch (custom.variant) {
      case 'up': return { opacity: 0, y: custom.amount }
      case 'down': return { opacity: 0, y: -custom.amount }
      case 'left': return { opacity: 0, x: -custom.amount }
      case 'right': return { opacity: 0, x: custom.amount }
      case 'scale': return { opacity: 0, scale: 0.96 }
      default: return { opacity: 0, y: custom.amount }
    }
  },
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: [0.23, 1, 0.32, 1],
    },
  },
}

export function Reveal({
  children,
  className = '',
  delay = 0,
  variant = 'up',
  once = true,
  amount = 30,
}: RevealProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '-12% 0px' }}
      variants={variants}
      custom={{ variant, amount }}
      transition={{ delay: delay / 1000 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

