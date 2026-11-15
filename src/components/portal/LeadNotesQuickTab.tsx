'use client'

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  NotebookPen,
  GripVertical,
} from '@/lib/icons/phosphor-compat'
import {
  PORTAL_MODAL_EASE,
  PORTAL_MODAL_EXIT_EASE,
  PortalButton,
  PortalCloseButton,
  PortalConstellationLoader,
} from '@/components/portal/PortalUI'
import type {
  LeadNoteContextPayload,
  LeadNoteType,
  NoteSlashCommandKey,
} from '@/lib/luxorNoteAiTypes'

export type { LeadNoteType, LeadNoteContextPayload, NoteSlashCommandKey }

export type QuickNoteTemplate = {
  label: string
  value: string
  type: LeadNoteType
}

type NoteSlashCommand = {
  key: NoteSlashCommandKey
  trigger: NoteSlashCommandKey
  label: string
  hint: string
  noteType: LeadNoteType
}

const NOTE_SLASH_COMMANDS: NoteSlashCommand[] = [
  {
    key: 'call',
    trigger: 'call',
    label: 'Call recap',
    hint: 'Summarize call transcripts, takeaways & next steps',
    noteType: 'call_log',
  },
  {
    key: 'followup',
    trigger: 'followup',
    label: 'Follow-up log',
    hint: 'Summarize recent emails, texts & follow-up status',
    noteType: 'email_log',
  },
  {
    key: 'tour',
    trigger: 'tour',
    label: 'Tour & event brief',
    hint: 'Synthesize tour schedule, guest count & event details',
    noteType: 'note',
  },
  {
    key: 'summary',
    trigger: 'summary',
    label: 'Account summary',
    hint: 'Full recap of stage, recent activity & notes',
    noteType: 'note',
  },
  {
    key: 'next-steps',
    trigger: 'next-steps',
    label: 'Next steps',
    hint: 'Open tasks, pending questions & next move',
    noteType: 'note',
  },
]

const AI_LOADING_STEPS = [
  'Reading call transcripts & activity…',
  'Reviewing emails, texts & previous notes…',
  'Drafting concise account note…',
] as const

type LeadNotesQuickTabProps = {
  leadName: string
  noteContent: string
  onNoteContentChange: (content: string) => void
  noteType: LeadNoteType
  onNoteTypeChange: (type: LeadNoteType) => void
  quickTemplates?: QuickNoteTemplate[]
  submitting: boolean
  onSubmit: (e: React.FormEvent) => Promise<boolean | void> | void
  notesCount?: number
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  leadContext?: LeadNoteContextPayload
}

const subscribeToHydration = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

function getNoteSlashQuery(input: string): string | null {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('/')) return null
  const withoutSlash = trimmed.slice(1)
  if (/[\s\n]/.test(withoutSlash)) return null
  return withoutSlash.toLowerCase()
}

function filterNoteSlashCommands(query: string | null): NoteSlashCommand[] {
  if (query === null) return []
  if (!query) return NOTE_SLASH_COMMANDS
  return NOTE_SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.trigger.startsWith(query) ||
      cmd.label.toLowerCase().includes(query) ||
      cmd.hint.toLowerCase().includes(query)
  )
}

type SlashMenuCoords = { left: number; width: number; bottom: number; maxListHeight: number }

function useNoteSlashMenuCoords(anchorRef: React.RefObject<HTMLElement | null>, open: boolean) {
  const [coords, setCoords] = useState<SlashMenuCoords | null>(null)
  const [frozenCoords, setFrozenCoords] = useState<SlashMenuCoords | null>(null)

  const update = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const width = rect.width
    const maxLeft = Math.max(12, window.innerWidth - width - 12)
    const availableAbove = Math.max(140, rect.top - 20)
    const next: SlashMenuCoords = {
      left: Math.min(Math.max(12, rect.left), maxLeft),
      width,
      bottom: Math.max(12, window.innerHeight - rect.top + 8),
      maxListHeight: Math.min(220, availableAbove),
    }
    setCoords(next)
    setFrozenCoords(next)
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) return
    const frameId = window.requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, update])

  return open ? coords : frozenCoords
}

function NoteSlashTriggerBadge({ trigger }: { trigger: string }) {
  return (
    <span className="inline-flex max-w-full shrink-0 items-center rounded-lg bg-[#caa24c]/14 px-2 py-0.5 font-mono text-[10px] font-bold leading-5 text-[#8a6422] dark:text-[#f1d27a]">
      <span className="truncate">/{trigger}</span>
    </span>
  )
}

export function LeadNotesQuickTab({
  leadName,
  noteContent,
  onNoteContentChange,
  onNoteTypeChange,
  submitting,
  onSubmit,
  notesCount = 0,
  isOpen,
  onOpenChange,
  leadContext,
}: LeadNotesQuickTabProps) {
  const mounted = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot)

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = typeof isOpen === 'boolean'
  const open = isControlled ? isOpen : internalOpen
  const setOpen = (next: boolean) => {
    if (isControlled) {
      onOpenChange?.(next)
    } else {
      setInternalOpen(next)
    }
  }

  const [tabHidden, setTabHidden] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('luxor-lead-notes-position') || 'null')
      return stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? { x: stored.x, y: stored.y } : null
    } catch {
      return null
    }
  })
  const [grabbed, setGrabbed] = useState(false)
  const [trackpadGrab, setTrackpadGrab] = useState(false)
  const grabTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragging = useRef(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const drawerClose = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputAnchorRef = useRef<HTMLDivElement>(null)
  const popoverContainerRef = useRef<HTMLDivElement>(null)
  const popoverScrollRef = useRef<HTMLDivElement>(null)
  const keyboardInteraction = useRef(false)
  const panelId = useId()
  const reduceMotion = useReducedMotion()

  // Slash command + AI generation state
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0)
  const [dismissedAtText, setDismissedAtText] = useState<string | null>(null)
  const [generatingCommand, setGeneratingCommand] = useState<NoteSlashCommand | null>(null)
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [aiRevealKey, setAiRevealKey] = useState(0)
  const generationAbortRef = useRef<AbortController | null>(null)

  const cancelGeneration = useCallback(() => {
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    setGeneratingCommand(null)
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [])

  const close = () => {
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    setGeneratingCommand(null)
    setGenerationError(null)
    setOpen(false)
  }

  useEffect(() => {
    return () => {
      if (grabTimer.current) clearTimeout(grabTimer.current)
      generationAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!generatingCommand) return
    const interval = window.setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % AI_LOADING_STEPS.length)
    }, 1150)
    return () => window.clearInterval(interval)
  }, [generatingCommand])

  const move = (_x: number, y: number) => {
    const next = { x: 0, y: Math.max(56, Math.min(window.innerHeight - 64, y - 24)) }
    setPosition(next)
    try {
      localStorage.setItem('luxor-lead-notes-position', JSON.stringify(next))
    } catch {
      /* Position still works for this session. */
    }
  }

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [open])

  useEffect(() => {
    if (!trackpadGrab) return
    const onMove = (event: PointerEvent) => move(event.clientX, event.clientY)
    const onDrop = () => {
      setTrackpadGrab(false)
      setGrabbed(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDrop, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDrop)
    }
  }, [trackpadGrab])

  // Support custom event to open notes tab from anywhere
  useEffect(() => {
    const handleOpenRequest = () => {
      setTabHidden(true)
      setOpen(true)
    }
    window.addEventListener('luxor-open-lead-notes', handleOpenRequest)
    return () => window.removeEventListener('luxor-open-lead-notes', handleOpenRequest)
  })

  const slashQuery = getNoteSlashQuery(noteContent)
  const filteredCommands = filterNoteSlashCommands(slashQuery)
  const slashMenuVisible = Boolean(
    open &&
      !generatingCommand &&
      slashQuery !== null &&
      noteContent !== dismissedAtText
  )
  const safeHighlightIndex =
    filteredCommands.length > 0 ? Math.min(slashHighlightIndex, filteredCommands.length - 1) : 0
  const menuCoords = useNoteSlashMenuCoords(inputAnchorRef, slashMenuVisible)
  const popoverActive = Boolean(slashMenuVisible && menuCoords)

  useEffect(() => {
    const container = popoverContainerRef.current
    if (!container || !popoverActive) return

    const handleWheel = (event: WheelEvent) => {
      event.stopPropagation()
      const scroller = popoverScrollRef.current
      if (!scroller) {
        event.preventDefault()
        return
      }
      const maxScroll = scroller.scrollHeight - scroller.clientHeight
      if (maxScroll <= 0) {
        event.preventDefault()
        return
      }
      const { deltaY } = event
      if (deltaY < 0) {
        if (scroller.scrollTop <= 0) {
          event.preventDefault()
        } else if (-deltaY > scroller.scrollTop) {
          scroller.scrollTop = 0
          event.preventDefault()
        }
      } else if (deltaY > 0) {
        const remaining = maxScroll - scroller.scrollTop
        if (remaining <= 1) {
          scroller.scrollTop = maxScroll
          event.preventDefault()
        } else if (deltaY > remaining) {
          scroller.scrollTop = maxScroll
          event.preventDefault()
        }
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [popoverActive])

  const pickSlashCommand = useCallback(
    async (cmd: NoteSlashCommand) => {
      generationAbortRef.current?.abort()
      const controller = new AbortController()
      generationAbortRef.current = controller

      setDismissedAtText(null)
      setGenerationError(null)
      setLoadingStepIndex(0)
      setGeneratingCommand(cmd)
      onNoteTypeChange(cmd.noteType)
      onNoteContentChange('')

      const payloadContext: LeadNoteContextPayload = leadContext ?? {
        lead: {
          id: '',
          fullName: leadName,
        },
      }

      try {
        const res = await fetch('/api/portal/generate-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            command: cmd.key,
            context: payloadContext,
          }),
        })

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(errData.error || 'Could not generate note.')
        }

        const data = (await res.json()) as { note?: string; noteType?: LeadNoteType }
        if (controller.signal.aborted) return

        if (data.noteType) onNoteTypeChange(data.noteType)
        onNoteContentChange(data.note || '')
        setAiRevealKey((k) => k + 1)
        setGeneratingCommand(null)
        window.requestAnimationFrame(() => {
          const el = textareaRef.current
          if (el) {
            el.focus()
            const len = el.value.length
            el.setSelectionRange(len, len)
          }
        })
      } catch (err) {
        if (controller.signal.aborted) return
        setGeneratingCommand(null)
        setGenerationError(err instanceof Error ? err.message : 'Unable to generate AI note.')
        window.requestAnimationFrame(() => {
          textareaRef.current?.focus()
        })
      } finally {
        if (generationAbortRef.current === controller) {
          generationAbortRef.current = null
        }
      }
    },
    [leadContext, leadName, onNoteContentChange, onNoteTypeChange]
  )

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuVisible && filteredCommands.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashHighlightIndex((i) => (i + 1) % filteredCommands.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashHighlightIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        void pickSlashCommand(filteredCommands[safeHighlightIndex])
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        void pickSlashCommand(filteredCommands[safeHighlightIndex])
        return
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void handleSubmit(event)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteContent.trim() || submitting || generatingCommand) return
    const result = await onSubmit(e)
    if (result !== false) {
      close()
    }
  }

  if (!mounted || typeof document === 'undefined') {
    return null
  }

  const shellSpring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.82 }
  const contentSpring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 480, damping: 36, mass: 0.78 }
  const menuEnterTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: PORTAL_MODAL_EASE }
  const menuExitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: PORTAL_MODAL_EXIT_EASE }

  return createPortal(
    <div
      className="fixed right-0 z-50 hidden sm:block"
      style={{ top: position ? `max(56px, min(${position.y}px, calc(100dvh - 64px)))` : '60dvh' }}
      onPointerDown={() => {
        keyboardInteraction.current = false
      }}
      onKeyDown={(event) => {
        keyboardInteraction.current = true
        if (event.key === 'Escape') {
          if (slashMenuVisible) {
            event.preventDefault()
            event.stopPropagation()
            setDismissedAtText(noteContent)
            return
          }
          if (open) {
            event.preventDefault()
            close()
          }
        }
      }}
    >
      {/* Floating edge tab */}
      <motion.div
        animate={{ scale: grabbed && !reduceMotion ? 1.06 : 1, opacity: tabHidden ? 0 : 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.15 }}
        inert={tabHidden}
        aria-hidden={tabHidden}
        className="group flex h-11 items-center rounded-l-xl border border-r-0 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-md"
      >
        <button
          ref={toggle}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setTabHidden(true)
            setOpen(true)
          }}
          className="flex h-11 w-9 items-center justify-center text-[#a8792f] transition-colors hover:text-[#724f1c] focus-visible:outline-2 focus-visible:outline-[#caa24c] dark:text-[#caa24c] dark:hover:text-[#f1d27a] cursor-pointer"
          aria-label="Add account note"
          title="Add note to account"
        >
          <NotebookPen size={16} />
        </button>
        <button
          type="button"
          aria-label="Move notes tab"
          title="Hold and drag to move"
          className={`group/handle flex h-11 w-0 !min-w-0 touch-none items-center justify-center overflow-hidden text-[color:var(--portal-muted)] transition-[width,opacity] duration-200 group-hover:w-7 focus-visible:w-7 ${
            grabbed ? 'w-7 cursor-grabbing opacity-100' : 'cursor-grab opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
          onDoubleClick={() => {
            setTrackpadGrab(true)
            setGrabbed(true)
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            const x = event.clientX,
              y = event.clientY
            grabTimer.current = setTimeout(() => {
              dragging.current = true
              setGrabbed(true)
              move(x, y)
            }, 300)
          }}
          onPointerMove={(event) => {
            if (dragging.current) move(event.clientX, event.clientY)
          }}
          onPointerUp={() => {
            if (grabTimer.current) clearTimeout(grabTimer.current)
            dragging.current = false
            if (!trackpadGrab) setGrabbed(false)
          }}
          onPointerCancel={() => {
            if (grabTimer.current) clearTimeout(grabTimer.current)
            dragging.current = false
            setGrabbed(false)
          }}
        >
          <GripVertical size={14} className="shrink-0 transition-transform duration-200 group-hover/handle:scale-110" />
        </button>
      </motion.div>

      {/* Clean Note Panel */}
      <AnimatePresence
        onExitComplete={() => {
          setTabHidden(false)
          if (keyboardInteraction.current) requestAnimationFrame(() => toggle.current?.focus())
        }}
      >
        {open ? (
          <motion.div
            id={panelId}
            data-portal-floating-panel="true"
            role="region"
            aria-label="Account note composer"
            initial={reduceMotion ? { opacity: 0 } : { x: 30, opacity: 0, scale: 0.98 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { x: 30, opacity: 0, scale: 0.98 }}
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : { type: 'spring', damping: 26, stiffness: 300, mass: 0.8 }
            }
            style={{
              top: `clamp(12px, calc(${position ? `${position.y}px` : '60dvh'} - 140px), calc(100dvh - 380px))`,
              transformOrigin: 'right center',
            }}
            className="fixed right-0 z-50 w-[380px] max-w-[calc(100vw-1.5rem)] rounded-l-2xl border border-r-0 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5 shadow-2xl backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[color:var(--portal-text)]">
                    Account Note
                  </h3>
                  {notesCount > 0 ? (
                    <span className="rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--portal-muted)]">
                      {notesCount}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-[color:var(--portal-muted)]">
                  {leadName} · Records to Activity
                </p>
              </div>
              <PortalCloseButton
                ref={drawerClose}
                onClick={close}
                aria-label="Close note panel"
              />
            </div>

            {/* Note Form */}
            <form onSubmit={handleSubmit} className="mt-3.5 space-y-3">
              {/* Unified Input Anchor (renders either AI Loading Surface or Textarea inside one container) */}
              <div ref={inputAnchorRef} className="relative">
                <AnimatePresence mode="wait" initial={false}>
                  {generatingCommand ? (
                    <motion.div
                      key="ai-note-loading"
                      role="status"
                      aria-live="polite"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }}
                      transition={reduceMotion ? { duration: 0.1 } : { duration: 0.2, ease: PORTAL_MODAL_EASE }}
                      className="flex min-h-34 flex-col justify-between rounded-xl border border-[#caa24c]/55 bg-[color:var(--portal-soft)] p-3.5 ring-2 ring-[#caa24c]/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <NoteSlashTriggerBadge trigger={generatingCommand.trigger} />
                          <PortalConstellationLoader size={14} tone="gold" label="Generating note" />
                        </div>
                        <button
                          type="button"
                          onClick={cancelGeneration}
                          className="rounded-lg px-2 py-0.5 text-[11px] font-semibold text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-border)]/40 hover:text-[color:var(--portal-text)] cursor-pointer"
                        >
                          Stop
                        </button>
                      </div>

                      <div className="my-3 space-y-2.5">
                        <div className="h-2.5 w-[92%] rounded-full luxor-skeleton" />
                        <div className="h-2.5 w-[78%] rounded-full luxor-skeleton" />
                        <div className="h-2.5 w-[61%] rounded-full luxor-skeleton" />
                      </div>

                      <div className="h-4 overflow-hidden">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.p
                            key={loadingStepIndex}
                            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                            transition={{ duration: reduceMotion ? 0 : 0.18 }}
                            className="truncate text-[11px] font-medium text-[color:var(--portal-muted)]"
                          >
                            {AI_LOADING_STEPS[loadingStepIndex]}
                          </motion.p>
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`note-input-${aiRevealKey}`}
                      initial={aiRevealKey > 0 && !reduceMotion ? { opacity: 0, filter: 'blur(4px)' } : false}
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      transition={reduceMotion ? { duration: 0.1 } : { duration: 0.24, ease: PORTAL_MODAL_EASE }}
                    >
                      <textarea
                        ref={textareaRef}
                        id="lead-account-note-quick-textarea"
                        aria-label="Private note"
                        rows={5}
                        value={noteContent}
                        onChange={(event) => {
                          const nextVal = event.target.value
                          onNoteContentChange(nextVal)
                          setSlashHighlightIndex(0)
                          if (dismissedAtText !== null && nextVal !== dismissedAtText) {
                            setDismissedAtText(null)
                          }
                          if (generationError) setGenerationError(null)
                        }}
                        onKeyDown={handleTextareaKeyDown}
                        placeholder="Write a note… type / for AI shortcuts"
                        className="min-h-34 w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3.5 text-sm leading-relaxed text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] focus:border-[#caa24c]/45 focus:outline-none focus:ring-2 focus:ring-[#caa24c]/40"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {generationError ? (
                  <p className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                    {generationError}
                  </p>
                ) : null}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between border-t border-[color:var(--portal-border)] pt-3">
                <span className="text-[11px] text-[color:var(--portal-muted)]">
                  Type / for AI · ⌘↵ to save
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="min-h-8.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <PortalButton
                    variant="primary"
                    size="sm"
                    type="submit"
                    disabled={submitting || Boolean(generatingCommand) || !noteContent.trim()}
                    className="px-4 text-xs font-bold !text-white"
                  >
                    {submitting ? 'Saving...' : 'Save Note'}
                  </PortalButton>
                </div>
              </div>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Elena-Style Animated Slash Command Menu */}
      {createPortal(
        <AnimatePresence>
          {slashMenuVisible && menuCoords ? (
            <motion.div
              style={{
                position: 'fixed',
                left: menuCoords.left,
                width: menuCoords.width,
                bottom: menuCoords.bottom,
                zIndex: 130,
              }}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: menuEnterTransition }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, transition: menuExitTransition }}
              className="pointer-events-auto origin-bottom"
            >
              <motion.div
                ref={popoverContainerRef}
                data-portal-popover="true"
                role={filteredCommands.length ? 'listbox' : 'status'}
                aria-label="Note AI slash commands"
                className="elena-slash-command-popover portal-popover-surface overflow-hidden rounded-2xl border border-[color:var(--portal-border)] py-1.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)] ring-1 ring-black/5"
                initial={false}
                animate={{ maxHeight: filteredCommands.length ? menuCoords.maxListHeight : 120 }}
                transition={shellSpring}
                style={{ maxHeight: filteredCommands.length ? menuCoords.maxListHeight : 120 }}
              >
                <div
                  ref={popoverScrollRef}
                  className="portal-scrollbar overflow-y-auto overscroll-contain"
                  style={{ maxHeight: (filteredCommands.length ? menuCoords.maxListHeight : 120) - 12 }}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {!filteredCommands.length ? (
                      <motion.div
                        key="slash-empty"
                        className="p-3 text-xs"
                        initial={reduceMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }}
                        transition={contentSpring}
                      >
                        <p className="text-[color:var(--portal-muted)]">No matching note commands.</p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="slash-list"
                        initial={reduceMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }}
                        transition={contentSpring}
                      >
                        <p className="px-3 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">
                          AI Note Commands
                        </p>
                        <div className="pb-0.5">
                          {filteredCommands.map((cmd, index) => (
                            <button
                              key={cmd.key}
                              type="button"
                              role="option"
                              aria-selected={index === safeHighlightIndex}
                              onMouseEnter={() => setSlashHighlightIndex(index)}
                              onMouseDown={(event) => {
                                event.preventDefault()
                                void pickSlashCommand(cmd)
                              }}
                              className={`mx-1.5 flex w-[calc(100%-0.75rem)] cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                                index === safeHighlightIndex
                                  ? 'bg-[#caa24c]/12'
                                  : 'hover:bg-[color:var(--portal-soft)]'
                              } ${index === filteredCommands.length - 1 ? 'mb-0.5' : ''}`}
                            >
                              <NoteSlashTriggerBadge trigger={cmd.trigger} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold text-[color:var(--portal-text)]">
                                  {cmd.label}
                                </span>
                                <span className="mt-0.5 block truncate text-[10px] leading-snug text-[color:var(--portal-muted)]">
                                  {cmd.hint}
                                </span>
                              </span>
                              <span className="shrink-0 rounded-md bg-[#caa24c]/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#9a7028] dark:text-[#f1d27a]">
                                AI
                              </span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </div>,
    document.body
  )
}
