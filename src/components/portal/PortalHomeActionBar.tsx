'use client'

import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import {
  ChevronDown,
  Plus,
  Calendar,
  FileText,
  DollarSign,
  UserPlus,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

const ACTION_BAR_SPRING = { stiffness: 460, damping: 43, mass: 1 }

export const PORTAL_HOME_QUICK_ACTIONS = [
  { label: 'New Inquiry', href: '/portal/leads', icon: Plus },
  { label: 'Schedule Tour', href: '/portal/calendar', icon: Calendar },
  { label: 'Create Proposal', href: '/portal/leads', icon: FileText },
  { label: 'Create Invoice', href: '/portal/invoices', icon: DollarSign },
  { label: 'Add Event', href: '/portal/calendar', icon: Calendar },
  { label: 'Block Date', href: '/portal/calendar', icon: Calendar },
  { label: 'Add Vendor', href: '/portal/leads', icon: UserPlus, spanFull: true },
]

export function PortalHomeActionBar() {
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()
  const [expanded, setExpanded] = useState(true)

  // One spring keeps the tray, handle, label, and chevron in sync, identical to LeadMobileActionBar
  const progress = useSpring(expanded ? 1 : 0, ACTION_BAR_SPRING)
  const trayY = useTransform(progress, [0, 0.65, 1], [16, 8, 0])
  const trayOpacity = useTransform(progress, [0, 0.65, 1], [0, 0, 1])

  const handleWidth = useTransform(progress, (value) => {
    const phase = Math.max(0, Math.min(1, value / 0.65))
    return 112 - 68 * phase * phase * (3 - 2 * phase)
  })
  const handleY = useTransform(progress, [0, 1], [0, -4])
  const handleBorderOpacity = useTransform(handleWidth, [44, 64], [0, 1])
  const labelOpacity = useTransform(handleWidth, [88, 104], [0, 1])
  const labelX = useTransform(handleWidth, [88, 112], [-4, 0])
  const chevronRotation = useTransform(progress, [0, 1], [180, 0])

  useEffect(() => {
    if (reduceMotion) progress.jump(expanded ? 1 : 0)
    else progress.set(expanded ? 1 : 0)
  }, [expanded, reduceMotion, progress])

  const setVisibility = (visible: boolean) => setExpanded(visible)

  const actionButton =
    'group inline-flex h-11 min-w-0 items-center justify-center rounded-lg text-sm font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50'
  const actionSurface =
    'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 transition-colors group-hover:border-[#caa24c]/40 group-active:bg-[#caa24c]/10'

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[var(--portal-mobile-nav-height)] z-50 h-[52px] overflow-hidden sm:hidden"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !expanded) return
        event.preventDefault()
        setVisibility(false)
        toggleRef.current?.focus()
      }}
    >
      <motion.button
        ref={toggleRef}
        type="button"
        style={{ width: handleWidth, y: handleY }}
        onClick={() => setVisibility(!expanded)}
        aria-label={expanded ? 'Hide quick actions' : 'Show quick actions'}
        aria-expanded={expanded}
        aria-controls={panelId}
        title={expanded ? 'Hide quick actions' : 'Show quick actions'}
        className="pointer-events-auto absolute bottom-0 right-1 z-10 h-11 overflow-hidden rounded-t-lg bg-[color:var(--portal-frame)] text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/50"
      >
        <motion.span
          aria-hidden="true"
          style={{ opacity: handleBorderOpacity }}
          className="pointer-events-none absolute inset-0 rounded-t-lg border border-b-0 border-[color:var(--portal-border)]"
        />
        <motion.span
          aria-hidden="true"
          style={{ opacity: labelOpacity, x: labelX }}
          className="absolute left-3 top-0 flex h-11 w-12 items-center whitespace-nowrap text-[13px] font-semibold"
        >
          Actions
        </motion.span>
        <motion.span
          aria-hidden="true"
          style={{ rotate: chevronRotation }}
          className="absolute right-3.5 top-3.5 flex h-4 w-4"
        >
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>

      <motion.div
        id={panelId}
        role="group"
        aria-label="Quick actions"
        aria-hidden={!expanded}
        inert={!expanded}
        style={{ y: trayY, opacity: trayOpacity }}
        className={`${expanded ? 'pointer-events-auto' : ''} h-[52px] bg-[color:var(--portal-frame)]`}
      >
        <div className="grid h-[52px] grid-cols-3 gap-2 border-t border-[color:var(--portal-border)] py-[3px] pl-2 pr-14">
          <Link
            href="/portal/leads"
            onClick={() => setExpanded(false)}
            className={actionButton}
          >
            <span className={actionSurface}>
              <Plus size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Inquiry
            </span>
          </Link>
          <Link
            href="/portal/calendar"
            onClick={() => setExpanded(false)}
            className={actionButton}
          >
            <span className={actionSurface}>
              <Calendar size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Tour
            </span>
          </Link>
          <Link
            href="/portal/invoices"
            onClick={() => setExpanded(false)}
            className={actionButton}
          >
            <span className={actionSurface}>
              <DollarSign size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Invoice
            </span>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
