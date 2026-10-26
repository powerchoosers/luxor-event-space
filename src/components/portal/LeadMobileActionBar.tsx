'use client'

import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { ChevronDown, Mail, MessageSquare, Phone } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

const VISIBILITY_KEY = 'luxor-lead-actions-visibility'
const ACTION_BAR_SPRING = { stiffness: 460, damping: 43, mass: 1 }

export function LeadMobileActionBar({
  onCall,
  onText,
  onEmail,
  phoneAvailable,
  emailAvailable,
}: {
  onCall: () => void
  onText: () => void
  onEmail: () => void
  phoneAvailable: boolean
  emailAvailable: boolean
}) {
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()
  // This component is mounted in the lead page's client-only portal.
  const [expanded, setExpanded] = useState(() => {
    try {
      return window.localStorage.getItem(VISIBILITY_KEY) !== 'collapsed'
    } catch {
      return true
    }
  })

  // One spring keeps the tray, handle, label, and chevron in sync, including
  // when the user reverses direction before the previous transition settles.
  const progress = useSpring(expanded ? 1 : 0, ACTION_BAR_SPRING)
  const trayY = useTransform(progress, [0, 0.65, 1], [16, 8, 0])
  const trayOpacity = useTransform(progress, [0, 0.65, 1], [0, 0, 1])
  // Clear the handle from the buttons before revealing them. Smoothstep
  // settles its width gently, without scaling or squeezing the label.
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

  const setVisibility = (visible: boolean) => {
    setExpanded(visible)
    try {
      window.localStorage.setItem(VISIBILITY_KEY, visible ? 'expanded' : 'collapsed')
    } catch {
      // The controls still work when browser storage is unavailable.
    }
  }

  const secondaryButton = 'group inline-flex h-11 min-w-0 items-center justify-center rounded-lg text-sm font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 disabled:pointer-events-none disabled:opacity-40'
  const secondarySurface = 'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 transition-colors group-hover:border-[#caa24c]/40 group-active:bg-[#caa24c]/10'

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
        aria-label={expanded ? 'Hide lead actions' : 'Show lead actions'}
        aria-expanded={expanded}
        aria-controls={panelId}
        title={expanded ? 'Hide lead actions' : 'Show lead actions'}
        className="pointer-events-auto absolute bottom-0 right-1 z-10 h-11 overflow-hidden rounded-t-lg bg-[color:var(--portal-frame)] text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/50"
      >
        <motion.span aria-hidden="true" style={{ opacity: handleBorderOpacity }} className="pointer-events-none absolute inset-0 rounded-t-lg border border-b-0 border-[color:var(--portal-border)]" />
        <motion.span aria-hidden="true" style={{ opacity: labelOpacity, x: labelX }} className="absolute left-3 top-0 flex h-11 w-12 items-center whitespace-nowrap text-[13px] font-semibold">Actions</motion.span>
        <motion.span aria-hidden="true" style={{ rotate: chevronRotation }} className="absolute right-3.5 top-3.5 flex h-4 w-4">
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>

      <motion.div
        id={panelId}
        role="group"
        aria-label="Lead actions"
        aria-hidden={!expanded}
        inert={!expanded}
        style={{ y: trayY, opacity: trayOpacity }}
        className={`${expanded ? 'pointer-events-auto' : ''} h-[52px] bg-[color:var(--portal-frame)]`}
      >
        <div className="grid h-[52px] grid-cols-3 gap-2 border-t border-[color:var(--portal-border)] py-[3px] pl-2 pr-14">
          <button type="button" onClick={onCall} disabled={!phoneAvailable} className={secondaryButton}>
            <span className={secondarySurface}><Phone size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Call</span>
          </button>
          <button type="button" onClick={onText} disabled={!phoneAvailable} className={secondaryButton}>
            <span className={secondarySurface}><MessageSquare size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Text</span>
          </button>
          <button type="button" onClick={onEmail} disabled={!emailAvailable} className={secondaryButton}>
            <span className={secondarySurface}><Mail size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Email</span>
          </button>
        </div>
      </motion.div>
    </div>
  )
}
