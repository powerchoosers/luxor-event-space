'use client'

import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import {
  ChevronDown,
  Plus,
  Workflow,
  MessageCircleMore,
  Phone,
  Zap,
  X,
  GripVertical,
} from '@/lib/icons/phosphor-compat'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { NewLeadDrawer } from '@/components/portal/NewLeadDrawer'

const ACTION_BAR_SPRING = { stiffness: 460, damping: 43, mass: 1 }
const subscribeToHydration = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

export function PortalHomeActionBar() {
  const router = useRouter()
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()
  const [expanded, setExpanded] = useState(true)
  const [isInquiryDrawerOpen, setIsInquiryDrawerOpen] = useState(false)
  const mounted = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot)

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
    'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border-0 bg-[color:var(--portal-soft)] px-2 transition-colors group-hover:bg-[color:var(--portal-card)] group-active:bg-[#caa24c]/10'

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <><motion.div
      className="pointer-events-none fixed inset-x-0 bottom-[var(--portal-mobile-nav-height)] z-50 h-[52px] overflow-hidden sm:hidden"
      initial={reduceMotion ? false : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.36, ease: [0.22, 1, 0.36, 1] }}
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
          <button
            type="button"
            onClick={() => {
              setExpanded(false)
              setIsInquiryDrawerOpen(true)
            }}
            className={actionButton}
          >
            <span className={actionSurface}>
              <Plus size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Inquiry
            </span>
          </button>
          <Link
            href="/portal/marketing?tab=automations"
            onClick={() => setExpanded(false)}
            className={actionButton}
            title="Automations & workflows"
          >
            <span className={actionSurface}>
              <Workflow size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Flow
            </span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setExpanded(false)
              window.dispatchEvent(new CustomEvent('luxor-open-elena'))
            }}
            className={actionButton}
            aria-label="Open Elena AI Assistant"
            title="Elena AI Assistant"
          >
            <span className={actionSurface}>
              <MessageCircleMore size={16} className="shrink-0 text-[#a8792f] dark:text-[#dfbd68]" /> Elena
            </span>
          </button>
        </div>
      </motion.div>

      <NewLeadDrawer
        isOpen={isInquiryDrawerOpen}
        onClose={() => setIsInquiryDrawerOpen(false)}
        onCreated={() => router.push('/portal/leads')}
        pagePath="/portal"
      />
    </motion.div><DesktopQuickActions /></>,
    document.body
  )
}

function DesktopQuickActions() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('luxor-home-actions-position') || 'null')
      return stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? { x: stored.x, y: stored.y } : null
    } catch { return null }
  })
  const [grabbed, setGrabbed] = useState(false)
  const [trackpadGrab, setTrackpadGrab] = useState(false)
  const grabTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragging = useRef(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const drawerClose = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const reduceMotion = useReducedMotion()
  const close = () => { setOpen(false); requestAnimationFrame(() => toggle.current?.focus()) }
  const action = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-2 focus-visible:outline-[#caa24c]'

  useEffect(() => {
    return () => { if (grabTimer.current) clearTimeout(grabTimer.current) }
  }, [])
  const move = (_x: number, y: number) => {
    const next = { x: 0, y: Math.max(56, Math.min(window.innerHeight - 64, y - 24)) }
    setPosition(next)
    try { localStorage.setItem('luxor-home-actions-position', JSON.stringify(next)) } catch { /* Position still works for this session. */ }
  }
  useEffect(() => {
    if (open) drawerClose.current?.focus()
  }, [open])
  useEffect(() => {
    if (!trackpadGrab) return
    const onMove = (event: PointerEvent) => move(event.clientX, event.clientY)
    const onDrop = () => { setTrackpadGrab(false); setGrabbed(false) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDrop, { once: true })
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', onDrop) }
  }, [trackpadGrab])

  return <div className="fixed right-0 z-40 hidden sm:block" style={{ top: position ? `max(56px, min(${position.y}px, calc(100vh - 64px)))` : '75%' }} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); close() } }}>
    <motion.div animate={{ scale: grabbed && !reduceMotion ? 1.08 : 1, x: open && !reduceMotion ? 20 : 0, opacity: open ? 0 : 1 }} transition={{ duration: reduceMotion ? 0 : 0.24 }} inert={open} aria-hidden={open} className="flex h-12 items-center rounded-l-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-md">
      <button ref={toggle} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className="flex h-12 w-8 !min-w-0 items-center justify-center text-[#a8792f] focus-visible:outline-2 focus-visible:outline-[#caa24c]" aria-label={open ? 'Close quick actions' : 'Open quick actions'}><Zap size={17} /></button>
      <button type="button" aria-label="Move quick actions tab" title="Hold and drag, or double-click to move" className={`flex h-12 w-4 !min-w-0 touch-none items-center justify-center text-[color:var(--portal-muted)] ${grabbed ? 'cursor-grabbing' : 'cursor-grab'}`} onDoubleClick={() => { setTrackpadGrab(true); setGrabbed(true) }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const x = event.clientX, y = event.clientY; grabTimer.current = setTimeout(() => { dragging.current = true; setGrabbed(true); move(x, y) }, 300) }} onPointerMove={(event) => { if (dragging.current) move(event.clientX, event.clientY) }} onPointerUp={() => { if (grabTimer.current) clearTimeout(grabTimer.current); dragging.current = false; if (!trackpadGrab) setGrabbed(false) }} onPointerCancel={() => { if (grabTimer.current) clearTimeout(grabTimer.current); dragging.current = false; setGrabbed(false) }}><GripVertical size={15} /></button>
    </motion.div>
    <AnimatePresence>
      {open ? <motion.div id={panelId} role="region" aria-label="Quick actions" initial={reduceMotion ? { opacity: 0 } : { x: 40, opacity: 0, scale: 0.95 }} animate={{ x: 0, opacity: 1, scale: 1 }} exit={reduceMotion ? { opacity: 0 } : { x: 40, opacity: 0, scale: 0.95 }} transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.23, 1, 0.32, 1] }} style={{ top: `clamp(8px, calc(${position ? `${position.y}px` : '75vh'} - 110px), calc(100dvh - 270px))`, transformOrigin: 'right center' }} className="fixed right-0 w-60 rounded-l-2xl border border-r-0 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between px-3"><h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Quick actions</h2><button ref={drawerClose} type="button" onClick={close} aria-label="Close quick actions" className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]"><X size={16} /></button></div>
        <button type="button" className={action} onClick={() => { setOpen(false); setInquiryOpen(true) }}><Plus size={17} className="text-[#a8792f]" /> New inquiry</button>
        <Link className={action} href="/portal/leads?view=followups"><Phone size={17} className="text-[#a8792f]" /> Follow Ups</Link>
        <Link className={action} href="/portal/marketing?tab=automations"><Workflow size={17} className="text-[#a8792f]" /> Flow</Link>
        <button type="button" className={action} onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('luxor-open-elena')) }}><MessageCircleMore size={17} className="text-[#a8792f]" /> Elena</button>
      </motion.div> : null}
    </AnimatePresence>
    <NewLeadDrawer isOpen={inquiryOpen} onClose={() => setInquiryOpen(false)} onCreated={() => router.push('/portal/leads')} pagePath="/portal" />
  </div>
}
