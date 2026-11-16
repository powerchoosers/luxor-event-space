'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from '@/lib/icons/phosphor-compat'
import { PortalTaskCrossOff } from '@/components/portal/PortalTaskCrossOff'

type LeadActivityDisclosureProps = {
  icon: ReactNode
  leadingControl?: ReactNode
  label: string
  title: string
  crossOff?: boolean
  description?: string
  preview?: string
  timestamp: string
  badge?: ReactNode
  children: ReactNode
  onExpand?: () => void
  defaultOpen?: boolean
}

export function LeadActivityDisclosure({
  icon,
  leadingControl,
  label,
  title,
  crossOff = false,
  description,
  preview,
  timestamp,
  badge,
  children,
  onExpand,
  defaultOpen = false,
}: LeadActivityDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [hasOpened, setHasOpened] = useState(defaultOpen)
  const contentId = useId()
  const contentRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const onExpandRef = useRef(onExpand)

  useEffect(() => { onExpandRef.current = onExpand }, [onExpand])
  useEffect(() => {
    if (open) onExpandRef.current?.()
    else contentRef.current?.querySelectorAll('audio').forEach((audio) => audio.pause())
  }, [open])
  useEffect(() => {
    const inner = innerRef.current
    if (!hasOpened || !inner) return
    const measure = () => setContentHeight(inner.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [hasOpened])

  const toggle = () => {
    if (!open) setHasOpened(true)
    setOpen((current) => !current)
  }

  return (
    <article className="min-w-0 w-full max-w-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xs transition-colors hover:border-[#caa24c]/35">
      <div className="flex min-h-14 w-full items-start gap-3.5 p-4 transition-colors hover:bg-[color:var(--portal-soft)]/45 sm:px-5 sm:py-4">
        {leadingControl ? (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
            {leadingControl}
          </div>
        ) : null}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={toggle}
          className="flex min-w-0 flex-1 items-start gap-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 rounded-lg cursor-pointer"
        >
          {!leadingControl ? (
            <span aria-hidden="true" className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--portal-soft)] text-[#a8792f] dark:text-[#dfbd68]">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[color:var(--portal-muted)]">{label}</span>
                {badge ? <span className="inline-flex items-center">{badge}</span> : null}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-[color:var(--portal-muted)]">{timestamp}</span>
            </span>
            <span className="mt-1 block">
              <span className="relative inline-block max-w-full">
                <span className={`block break-words text-sm leading-5 transition-colors duration-200 ${crossOff ? 'font-medium text-[color:var(--portal-muted)] opacity-55' : 'font-semibold text-[color:var(--portal-text)]'}`}>
                  {title}
                </span>
                <PortalTaskCrossOff isDone={crossOff} />
              </span>
            </span>
            {description ? <span className="mt-0.5 block truncate text-xs leading-5 text-[color:var(--portal-muted)]">{description}</span> : null}
            {preview ? <span className="mt-0.5 block truncate text-xs leading-5 text-[color:var(--portal-muted)]/85">{preview}</span> : null}
          </span>
          <ChevronDown size={16} aria-hidden="true" className={`mt-1 shrink-0 text-[color:var(--portal-muted)] transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div ref={contentRef} id={contentId} aria-hidden={!open} inert={!open} style={{ height: open ? (contentHeight ?? (defaultOpen ? 'auto' : 0)) : 0 }} className={`overflow-hidden transition-[height,opacity] duration-300 ease-in-out motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0'}`}>
        <div ref={innerRef}>
          {hasOpened ? <div className="border-t border-[color:var(--portal-border)]/70 px-4 py-4 sm:px-5">{children}</div> : null}
        </div>
      </div>
    </article>
  )
}
