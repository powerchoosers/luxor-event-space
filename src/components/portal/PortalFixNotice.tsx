'use client'

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check } from '@/lib/icons/phosphor-compat'
import { BorderBeam } from '@/components/ui/border-beam'
import { PortalButton, PortalCloseButton } from '@/components/portal/PortalUI'
import {
  dismissPortalFixNotice,
  isPortalFixNoticeDismissed,
  type PortalFixNotice as PortalFixNoticeData,
} from '@/lib/luxorPortalFixNotice'

const FIX_NOTICE_DISMISS_EVENT = 'luxor-portal-fix-notice-dismiss'

function subscribeToPortalFixNoticeDismiss(onStore: () => void) {
  const onChange = () => onStore()
  window.addEventListener(FIX_NOTICE_DISMISS_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(FIX_NOTICE_DISMISS_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function PortalFixNotice({ notice }: { notice: PortalFixNoticeData | null }) {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const dismissed = useSyncExternalStore(
    subscribeToPortalFixNoticeDismiss,
    () => (notice ? isPortalFixNoticeDismissed(notice.id) : false),
    () => false,
  )
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const bannerRef = useRef<HTMLButtonElement>(null)
  const focusBeforeOpenRef = useRef<HTMLElement | null>(null)
  const dismissedPersistRef = useRef(false)

  const closeModal = useCallback(() => {
    setOpen(false)
  }, [])

  const restoreFocusAfterModal = useCallback(() => {
    const restore = focusBeforeOpenRef.current
    requestAnimationFrame(() => {
      if (restore?.isConnected) {
        restore.focus()
        return
      }
      const main = document.querySelector('main')
      if (main instanceof HTMLElement) {
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1')
        main.focus({ preventScroll: true })
      }
    })
  }, [])

  const handleDismissNotice = useCallback(() => {
    if (!notice) return
    dismissedPersistRef.current = true
    dismissPortalFixNotice(notice.id)
    window.dispatchEvent(new Event(FIX_NOTICE_DISMISS_EVENT))
    setOpen(false)
    restoreFocusAfterModal()
  }, [notice, restoreFocusAfterModal])

  useEffect(() => {
    if (!open) return
    focusBeforeOpenRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : bannerRef.current
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (dismissedPersistRef.current) {
        dismissedPersistRef.current = false
        return
      }
      restoreFocusAfterModal()
    }
  }, [open, closeModal, restoreFocusAfterModal])

  if (!notice || dismissed) return null

  return (
    <>
      <motion.button
        ref={bannerRef}
        type="button"
        onClick={() => setOpen(true)}
        initial={reduceMotion ? false : { opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
        className="relative mb-4 flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
      >
        {!reduceMotion ? <BorderBeam size={70} duration={8} colorFrom="#f1d27a" colorTo="#caa24c" /> : null}
        <span className="luxor-gold-raised flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
          <Check size={15} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-[color:var(--portal-text)] sm:text-sm">{notice.bannerLabel}</span>
          <span className="mt-0.5 block truncate text-sm font-bold text-[color:var(--portal-text)]">{notice.title}</span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-[color:var(--portal-text)] sm:inline-flex">
          Read note
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </motion.button>

      {mounted ? createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              className="fixed inset-0 z-[200] flex h-[100dvh] w-screen items-stretch justify-center bg-black/55 p-2 sm:items-center sm:p-6 md:p-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              onClick={closeModal}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
                initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
                className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-[22px] border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] text-[color:var(--portal-text)] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.55)] sm:h-auto sm:max-h-[min(860px,100%)]"
              >
                <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3">
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold text-[color:var(--portal-text)]">{notice.bannerLabel}</p>
                  <PortalCloseButton ref={closeRef} onClick={closeModal} />
                </div>

                <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
                  <h2 id={titleId} className="font-sans text-2xl font-bold tracking-tight text-[color:var(--portal-text)]">{notice.title}</h2>
                  <div className="mt-3 max-w-xl space-y-3 text-[15px] leading-6 text-[color:var(--portal-text)]">
                    {notice.summary.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3">
                      <p className="text-sm leading-5 text-[color:var(--portal-text)]">{notice.fixedText}</p>
                    </section>
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3">
                      <p className="text-sm leading-5 text-[color:var(--portal-text)]">{notice.unchangedText}</p>
                    </section>
                  </div>

                  <ol className="mt-8 space-y-2">
                    {notice.steps.map((step, index) => (
                      <li key={`${step.title}-${index}`} className="flex gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3">
                        <span className="luxor-gold-raised flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums leading-none">
                          {index + 1}
                        </span>
                        <span>
                          <span className="block text-sm font-bold text-[color:var(--portal-text)]">{step.title}</span>
                          <span className="mt-0.5 block text-sm leading-5 text-[color:var(--portal-muted)]">{step.text}</span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  <section className="mt-6 rounded-2xl bg-[color:var(--portal-soft)] px-4 py-3">
                    <p className="text-sm leading-5 text-[color:var(--portal-muted)]">{notice.ifStuck}</p>
                  </section>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 sm:px-6">
                  <PortalButton type="button" variant="secondary" size="md" onClick={handleDismissNotice}>
                    Dismiss
                  </PortalButton>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </>
  )
}
