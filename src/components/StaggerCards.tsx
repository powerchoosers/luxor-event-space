'use client'

import React, { useRef } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

const LUXOR_EASE = [0.22, 1, 0.36, 1] as const

export const defaultCardBlurVariants: Variants = {
  hidden: {
    opacity: 0.45,
    y: 14,
    filter: 'blur(10px)',
    scale: 0.99,
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    scale: 1,
    transition: {
      duration: 0.52,
      ease: LUXOR_EASE,
    },
  },
}

export function StaggerCards({
  children,
  className = '',
  stagger = 0.08,
  delay = 0.04,
  once = true,
  amount = 0.12,
}: {
  children: React.ReactNode
  className?: string
  stagger?: number
  delay?: number
  once?: boolean
  amount?: 'some' | 'all' | number
}) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={containerVariants}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerCard({
  children,
  className = '',
  variants = defaultCardBlurVariants,
}: {
  children: React.ReactNode
  className?: string
  variants?: Variants
}) {
  const shouldReduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      ref={ref}
      variants={variants}
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
