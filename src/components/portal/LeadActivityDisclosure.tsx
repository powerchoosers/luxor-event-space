'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

type LeadActivityDisclosureProps = {
  icon: ReactNode
  label: string
  title: string
  description?: string
  preview?: string
  timestamp: string
  badge?: ReactNode
  children: ReactNode
  onExpand?: () => void
  defaultOpen?: boolean
}

export function LeadActivityDisclosure({ icon, label, title, description, preview, timestamp, badge, children, onExpand, defaultOpen = false }: LeadActivityDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [hasOpened, setHasOpened] = useState(defaultOpen)
  const contentId = useId()
  const contentRef = useRef<HTMLDivElement>(null)
  const onExpandRef = useRef(onExpand)
  const reduceMotion = useReducedMotion()

  useEffect(() => { onExpandRef.current = onExpand }, [onExpand])
  useEffect(() => {
    if (open) onExpandRef.current?.()
    else contentRef.current?.querySelectorAll('audio').forEach((audio) => audio.pause())
  }, [open])

  const toggle = () => {
    if (!open) setHasOpened(true)
    setOpen((current) => !current)
  }

  return <article className="min-w-0 w-full max-w-full overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
    <button type="button" aria-expanded={open} aria-controls={contentId} onClick={toggle} className="flex min-h-14 w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[color:var(--portal-soft)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 sm:p-5">
      <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[color:var(--portal-muted)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[color:var(--portal-muted)]"><span className="font-semibold">{label}</span><span className="shrink-0 tabular-nums">{timestamp}</span></span>
        <span className="mt-1.5 block break-words text-sm font-semibold leading-5 text-[color:var(--portal-text)]">{title}</span>
        {description ? <span className="mt-1 block truncate text-xs leading-5 text-[color:var(--portal-muted)]">{description}</span> : null}
        {preview ? <span className="mt-1 block truncate text-xs leading-5 text-[color:var(--portal-muted)]">{preview}</span> : null}
        {badge ? <span className="mt-2 inline-flex max-w-full items-center text-xs text-[color:var(--portal-muted)]">{badge}</span> : null}
      </span>
      <ChevronDown size={16} aria-hidden="true" className={`mt-0.5 shrink-0 text-[color:var(--portal-muted)] transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
    </button>
    <motion.div ref={contentRef} id={contentId} aria-hidden={!open} inert={!open} initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
      {hasOpened ? <div className="border-t border-[color:var(--portal-border)] px-4 py-4 sm:px-5">{children}</div> : null}
    </motion.div>
  </article>
}
