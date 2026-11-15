'use client'

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, MousePointerClick, Wrench } from '@/lib/icons/phosphor-compat'
import {
  clearDeveloperTicketDraft,
  DEVELOPER_TICKET_DRAFT_EMPTY,
  readDeveloperTicketDraft,
  subscribeDeveloperTicketDraft,
  writeDeveloperTicketDraft,
  type DeveloperTicketDraft,
  type DeveloperTicketDraftPhase,
} from '@/lib/luxorDeveloperTicketDraft'
import {
  buildDeveloperTicketAnnotationCommit,
  resolveDeveloperTicketAnnotationElement,
  shouldSaveDeveloperTicketNote,
} from '@/lib/luxorDeveloperTicketNoteSave'
import type { DeveloperSupportCardPayload } from '@/components/portal/ElenaCRMContainers'
import {
  developerTicketAnnotationDisplayLine,
  type DeveloperTicketAnnotation,
  LUXOR_DEVELOPER_TICKET_ANNOTATIONS_MAX,
  LUXOR_DEVELOPER_TICKET_ANNOTATION_NOTE_MAX,
} from '@/lib/luxorDeveloperTicketAnnotations'
import {
  buildDeveloperTicketElementDescriptor,
  pickDeveloperTicketElementAtPoint,
  readDeveloperTicketViewport,
} from '@/lib/luxorDeveloperTicketElementPicker'
import { normalizeDeveloperSupportPagePath } from '@/lib/luxorDeveloperSupportPagePaths'

type DeveloperModeContextValue = {
  developerModeActive: boolean
  elementSelectMode: boolean
  draft: DeveloperTicketDraft
  setTitle: (value: string) => void
  setDescription: (value: string) => void
  setPriority: (value: DeveloperTicketDraft['priority']) => void
  setPagePath: (value: string) => void
  setPhase: (phase: DeveloperTicketDraftPhase) => void
  setSavedAttachments: (value: DeveloperTicketDraft['savedAttachments']) => void
  setSelectedAttachmentKeys: (value: string[]) => void
  setChatId: (chatId: string | null) => void
  upsertAnnotation: (annotation: DeveloperTicketAnnotation) => void
  removeAnnotation: (id: string) => void
  startDeveloperTicket: (payload: DeveloperSupportCardPayload, chatId?: string | null) => void
  exitDeveloperMode: () => void
  finishDeveloperTicketSent: () => void
  setElementSelectMode: (value: boolean) => void
  panelExpanded: boolean
  setPanelExpanded: (value: boolean) => void
  elenaChatOpen: boolean
  setElenaChatOpen: (open: boolean) => void
  beginEditAnnotation: (id: string, returnFocus: HTMLElement | null) => void
}

const DeveloperModeContext = createContext<DeveloperModeContextValue | null>(null)

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function usePortalDeveloperMode() {
  return useContext(DeveloperModeContext)
}

export function PortalDeveloperModeElenaSync({ elenaOpen }: { elenaOpen: boolean }) {
  const developerMode = usePortalDeveloperMode()
  useEffect(() => {
    developerMode?.setElenaChatOpen(elenaOpen)
  }, [developerMode, elenaOpen])
  return null
}

export function PortalDeveloperModeProvider({
  userEmail,
  portalRole,
  activePath,
  children,
}: {
  userEmail: string
  portalRole: string
  activePath: string
  children: React.ReactNode
}) {
  const owner = portalRole === 'owner'
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false)
  const [draft, setDraft] = useState<DeveloperTicketDraft>(DEVELOPER_TICKET_DRAFT_EMPTY)
  const [elementSelectMode, setElementSelectMode] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [elenaChatOpen, setElenaChatOpen] = useState(false)
  const editAnnotationRequestRef = useRef<{ id: string; returnFocus: HTMLElement | null } | null>(null)
  const [editAnnotationSignal, setEditAnnotationSignal] = useState(0)

  const persistDraft = useMemo(
    () => debounce((email: string, value: DeveloperTicketDraft) => writeDeveloperTicketDraft(email, value), 280),
    [],
  )

  const patchDraft = useCallback((patch: Partial<DeveloperTicketDraft>) => {
    if (!owner) return
    setDraft((prev) => {
      const next = { ...prev, ...patch }
      persistDraft(userEmail, next)
      return next
    })
  }, [owner, persistDraft, userEmail])

  useEffect(() => {
    if (!owner || !isClient) return
    const sync = () => setDraft(readDeveloperTicketDraft(userEmail))
    sync()
    return subscribeDeveloperTicketDraft(sync)
  }, [isClient, owner, userEmail])

  const startDeveloperTicket = useCallback((payload: DeveloperSupportCardPayload, chatId?: string | null) => {
    if (!owner) return
    const stored = readDeveloperTicketDraft(userEmail)
    const reuse = stored.active && stored.phase !== 'sent' && stored.title.trim()
    setDraft(() => {
      const next: DeveloperTicketDraft = {
        version: 1,
        active: true,
        phase: 'compose',
        title: reuse ? stored.title : payload.title || '',
        description: reuse ? stored.description : payload.description || '',
        priority: reuse ? stored.priority : payload.priority || 'medium',
        pagePath: normalizeDeveloperSupportPagePath(payload.pagePath || activePath),
        savedAttachments: reuse ? stored.savedAttachments : payload.savedAttachments || [],
        selectedAttachmentKeys: reuse ? stored.selectedAttachmentKeys : [],
        annotations: reuse ? stored.annotations : [],
        chatId: chatId || stored.chatId || null,
        updatedAt: Date.now(),
      }
      writeDeveloperTicketDraft(userEmail, next)
      return next
    })
    setPanelExpanded(false)
  }, [activePath, owner, userEmail])

  const exitDeveloperMode = useCallback(() => {
    if (!owner) return
    setElementSelectMode(false)
    patchDraft({ active: false })
  }, [owner, patchDraft])

  const finishDeveloperTicketSent = useCallback(() => {
    if (!owner) return
    setElementSelectMode(false)
    clearDeveloperTicketDraft(userEmail)
    setDraft(readDeveloperTicketDraft(userEmail))
  }, [owner, userEmail])

  const upsertAnnotation = useCallback((annotation: DeveloperTicketAnnotation) => {
    setDraft((prev) => {
      const next = {
        ...prev,
        annotations: [
          ...prev.annotations.filter((item) => item.id !== annotation.id),
          annotation,
        ].slice(0, LUXOR_DEVELOPER_TICKET_ANNOTATIONS_MAX),
      }
      persistDraft(userEmail, next)
      return next
    })
  }, [persistDraft, userEmail])

  const removeAnnotation = useCallback((id: string) => {
    setDraft((prev) => {
      const next = { ...prev, annotations: prev.annotations.filter((item) => item.id !== id) }
      persistDraft(userEmail, next)
      return next
    })
  }, [persistDraft, userEmail])

  const beginEditAnnotation = useCallback((id: string, returnFocus: HTMLElement | null) => {
    editAnnotationRequestRef.current = { id, returnFocus }
    setEditAnnotationSignal((value) => value + 1)
  }, [])

  const consumeEditAnnotationRequest = useCallback(() => {
    const next = editAnnotationRequestRef.current
    editAnnotationRequestRef.current = null
    return next
  }, [])

  const developerModeActive = isClient && owner && draft.active && draft.phase !== 'sent'

  const value = useMemo<DeveloperModeContextValue>(() => ({
    developerModeActive,
    elementSelectMode,
    draft,
    setTitle: (title) => patchDraft({ title }),
    setDescription: (description) => patchDraft({ description }),
    setPriority: (priority) => patchDraft({ priority }),
    setPagePath: (pagePath) => patchDraft({ pagePath: normalizeDeveloperSupportPagePath(pagePath) }),
    setPhase: (phase) => patchDraft({ phase }),
    setSavedAttachments: (savedAttachments) => patchDraft({ savedAttachments }),
    setSelectedAttachmentKeys: (selectedAttachmentKeys) => patchDraft({ selectedAttachmentKeys }),
    setChatId: (chatId) => patchDraft({ chatId }),
    upsertAnnotation,
    removeAnnotation,
    startDeveloperTicket,
    exitDeveloperMode,
    finishDeveloperTicketSent,
    setElementSelectMode,
    panelExpanded,
    setPanelExpanded,
    elenaChatOpen,
    setElenaChatOpen,
    beginEditAnnotation,
  }), [
    developerModeActive,
    draft,
    elementSelectMode,
    elenaChatOpen,
    exitDeveloperMode,
    finishDeveloperTicketSent,
    panelExpanded,
    patchDraft,
    removeAnnotation,
    startDeveloperTicket,
    upsertAnnotation,
    beginEditAnnotation,
    isClient,
  ])

  if (!owner) return <>{children}</>

  return (
    <DeveloperModeContext.Provider value={value}>
      {children}
      {developerModeActive ? (
        <PortalDeveloperModeChrome
          activePath={activePath}
          draft={draft}
          elementSelectMode={elementSelectMode}
          panelExpanded={panelExpanded}
          elenaChatOpen={elenaChatOpen}
          onExit={exitDeveloperMode}
          onTogglePanel={() => setPanelExpanded((value) => !value)}
          onToggleSelect={() => setElementSelectMode((value) => !value)}
          onSetSelectMode={setElementSelectMode}
          onUpsertAnnotation={upsertAnnotation}
          onRemoveAnnotation={removeAnnotation}
          onPatchDraft={patchDraft}
          editAnnotationSignal={editAnnotationSignal}
          consumeEditAnnotationRequest={consumeEditAnnotationRequest}
        />
      ) : null}
    </DeveloperModeContext.Provider>
  )
}

function PortalDeveloperModeChrome({
  activePath,
  draft,
  elementSelectMode,
  panelExpanded,
  elenaChatOpen,
  onExit,
  onTogglePanel,
  onToggleSelect,
  onSetSelectMode,
  onUpsertAnnotation,
  onRemoveAnnotation,
  onPatchDraft,
  editAnnotationSignal,
  consumeEditAnnotationRequest,
}: {
  activePath: string
  draft: DeveloperTicketDraft
  elementSelectMode: boolean
  panelExpanded: boolean
  elenaChatOpen: boolean
  onExit: () => void
  onTogglePanel: () => void
  onToggleSelect: () => void
  onSetSelectMode: (value: boolean) => void
  onUpsertAnnotation: (annotation: DeveloperTicketAnnotation) => void
  onRemoveAnnotation: (id: string) => void
  onPatchDraft: (patch: Partial<DeveloperTicketDraft>) => void
  editAnnotationSignal: number
  consumeEditAnnotationRequest: () => { id: string; returnFocus: HTMLElement | null } | null
}) {
  const reduceMotion = useReducedMotion()
  const hoverRef = useRef<HTMLElement | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const [pendingAnchor, setPendingAnchor] = useState<{ rect: DOMRect; element: HTMLElement } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editingAnnotationIdRef = useRef<string | null>(null)
  const noteAnchorBaselineRef = useRef('')
  const noteSaveCancelledRef = useRef(false)
  const noteSaveSuppressedRef = useRef(false)
  const useStoredElementRef = useRef(false)
  const noteDraftRef = useRef(noteDraft)
  const notePopoverReturnFocusRef = useRef<HTMLElement | null>(null)
  const selectElementTriggerRef = useRef<HTMLButtonElement>(null)
  const ticketPanelBodyRef = useRef<HTMLDivElement>(null)
  const pendingAnchorRef = useRef(pendingAnchor)
  const draftRef = useRef(draft)

  useEffect(() => {
    pendingAnchorRef.current = pendingAnchor
  }, [pendingAnchor])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    noteDraftRef.current = noteDraft
  }, [noteDraft])

  const clearNoteSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const cancelNotePopover = useCallback(() => {
    noteSaveSuppressedRef.current = true
    noteSaveCancelledRef.current = true
    clearNoteSaveTimer()
    setNoteDraft(noteAnchorBaselineRef.current)
    setPendingAnchor(null)
    useStoredElementRef.current = false
    editingAnnotationIdRef.current = null
    const returnTarget = notePopoverReturnFocusRef.current
    notePopoverReturnFocusRef.current = null
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        returnTarget?.focus()
      })
    }
  }, [clearNoteSaveTimer])

  const commitNotePopover = useCallback(() => {
    const trimmed = noteDraftRef.current.trim().slice(0, LUXOR_DEVELOPER_TICKET_ANNOTATION_NOTE_MAX)
    const anchor = pendingAnchorRef.current
    if (
      !shouldSaveDeveloperTicketNote({
        cancelled: noteSaveCancelledRef.current,
        suppressed: noteSaveSuppressedRef.current,
        hasAnchor: Boolean(anchor),
        trimmedNote: trimmed,
      })
    ) {
      return
    }
    const id = editingAnnotationIdRef.current
    if (!id) return
    const existing = draftRef.current.annotations.find((item) => item.id === id)
    let elementDescriptor = existing?.element
    if (!useStoredElementRef.current && anchor?.element) {
      elementDescriptor = buildDeveloperTicketElementDescriptor(anchor.element) || undefined
    }
    if (!elementDescriptor) return
    onUpsertAnnotation(
      buildDeveloperTicketAnnotationCommit({
        id,
        note: trimmed,
        pagePath: activePath,
        viewport: readDeveloperTicketViewport(),
        element: elementDescriptor,
        existing,
      }),
    )
    noteAnchorBaselineRef.current = trimmed
    noteSaveCancelledRef.current = false
    noteSaveSuppressedRef.current = false
    useStoredElementRef.current = false
    setPendingAnchor(null)
    editingAnnotationIdRef.current = null
  }, [activePath, onUpsertAnnotation])

  const openAnnotationEditor = useCallback((input: {
    id: string
    note: string
    storedElement: DeveloperTicketAnnotation['element']
    returnFocus: HTMLElement | null
  }) => {
    onSetSelectMode(false)
    editingAnnotationIdRef.current = input.id
    useStoredElementRef.current = true
    noteAnchorBaselineRef.current = input.note
    noteSaveCancelledRef.current = false
    noteSaveSuppressedRef.current = false
    notePopoverReturnFocusRef.current = input.returnFocus
    setNoteDraft(input.note)
    const matched = resolveDeveloperTicketAnnotationElement(input.storedElement.selector)
    const rect = matched
      ? matched.getBoundingClientRect()
      : new DOMRect(Math.max(16, window.innerWidth / 2 - 140), Math.max(80, window.innerHeight / 2 - 80), 1, 1)
    setPendingAnchor({ rect, element: matched || document.documentElement })
  }, [onSetSelectMode])

  const openNewAnnotationEditor = useCallback((anchor: { rect: DOMRect; element: HTMLElement }) => {
    const id = crypto.randomUUID()
    editingAnnotationIdRef.current = id
    useStoredElementRef.current = false
    noteAnchorBaselineRef.current = ''
    noteSaveCancelledRef.current = false
    noteSaveSuppressedRef.current = false
    notePopoverReturnFocusRef.current = selectElementTriggerRef.current
    setNoteDraft('')
    setPendingAnchor(anchor)
  }, [])

  useLayoutEffect(() => {
    const body = ticketPanelBodyRef.current
    if (!body) return
    if (!panelExpanded) {
      body.inert = true
      body.setAttribute('aria-hidden', 'true')
    } else {
      body.inert = false
      body.removeAttribute('aria-hidden')
    }
  }, [panelExpanded])

  useEffect(() => {
    document.body.setAttribute('data-portal-developer-mode', 'true')
    return () => {
      document.body.removeAttribute('data-portal-developer-mode')
    }
  }, [])

  useEffect(() => {
    if (!elementSelectMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (pendingAnchor) {
          cancelNotePopover()
          return
        }
        onSetSelectMode(false)
      }
    }
    const onMove = (event: PointerEvent) => {
      if (pendingAnchor) return
      const target = pickDeveloperTicketElementAtPoint(event.clientX, event.clientY)
      if (!target) {
        hoverRef.current = null
        setHoverRect(null)
        return
      }
      hoverRef.current = target
      setHoverRect(target.getBoundingClientRect())
    }
    const onClick = (event: MouseEvent) => {
      if (pendingAnchor) return
      const target = pickDeveloperTicketElementAtPoint(event.clientX, event.clientY)
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      const descriptor = buildDeveloperTicketElementDescriptor(target)
      if (!descriptor) return
      openNewAnnotationEditor({ rect: target.getBoundingClientRect(), element: target })
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('click', onClick, true)
    }
  }, [cancelNotePopover, elementSelectMode, onSetSelectMode, openNewAnnotationEditor, pendingAnchor])

  useEffect(() => {
    const request = consumeEditAnnotationRequest()
    if (!request) return
    const item = draft.annotations.find((annotation) => annotation.id === request.id)
    if (!item) return
    const frame = window.requestAnimationFrame(() => {
      openAnnotationEditor({
        id: item.id,
        note: item.note,
        storedElement: item.element,
        returnFocus: request.returnFocus,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [consumeEditAnnotationRequest, draft.annotations, editAnnotationSignal, openAnnotationEditor])

  const showFloatingPanel = !elenaChatOpen && draft.phase !== 'sent'

  return (
    <div className="portal-developer-mode-chrome" data-portal-dev-ignore>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[62] h-0.5 bg-gradient-to-r from-transparent via-[#caa24c]/80 to-transparent"
      />
      <div className="fixed left-3 top-[calc(var(--portal-header-height,3.5rem)+0.5rem)] z-[63] flex items-center gap-2 rounded-full border border-[#caa24c]/35 bg-[color:var(--portal-card)]/95 px-3 py-1.5 text-[11px] font-semibold text-[color:var(--portal-text)] shadow-sm backdrop-blur-md sm:left-4" data-portal-dev-ignore>
        <Wrench size={14} className="text-[#caa24c]" aria-hidden="true" />
        Developer mode
      </div>
      <button
        type="button"
        data-portal-dev-ignore
        onClick={onExit}
        className="fixed bottom-[calc(var(--portal-mobile-nav-height,0px)+1rem)] right-3 z-[63] inline-flex min-h-11 items-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-4 text-xs font-semibold text-[color:var(--portal-text)] shadow-md backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 sm:bottom-6 sm:right-6"
      >
        Exit developer mode
      </button>
      {elementSelectMode ? (
        <p className="fixed left-1/2 top-[calc(var(--portal-header-height,3.5rem)+0.5rem)] z-[63] -translate-x-1/2 rounded-full border border-[#caa24c]/40 bg-[color:var(--portal-card)]/95 px-3 py-1 text-[10px] font-semibold text-[color:var(--portal-text)] shadow-sm backdrop-blur-md" data-portal-dev-ignore>
          Tap an element to annotate. Esc cancels.
        </p>
      ) : null}
      {elementSelectMode && hoverRect && !pendingAnchor ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[61] rounded-md border-2 border-[#caa24c] bg-[#caa24c]/10"
          style={{ left: hoverRect.left, top: hoverRect.top, width: hoverRect.width, height: hoverRect.height }}
        />
      ) : null}
      <AnimatePresence>
        {pendingAnchor ? (
          <motion.div
            key="developer-ticket-note-popover"
            data-portal-dev-ignore
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0, scale: 1 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            className="portal-popover-surface fixed z-[64] w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-[color:var(--portal-border)] p-3 shadow-xl"
            style={{
              left: Math.min(pendingAnchor.rect.left, window.innerWidth - 300),
              top: Math.min(pendingAnchor.rect.bottom + 8, window.innerHeight - 160),
            }}
          >
            <label className="block text-[10px] font-semibold text-[color:var(--portal-muted)]">Note for this element</label>
            <textarea
              autoFocus
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  cancelNotePopover()
                }
              }}
              onBlur={() => {
                clearNoteSaveTimer()
                window.queueMicrotask(() => {
                  if (noteSaveCancelledRef.current || noteSaveSuppressedRef.current) return
                  commitNotePopover()
                })
              }}
              rows={3}
              maxLength={LUXOR_DEVELOPER_TICKET_ANNOTATION_NOTE_MAX}
              className="mt-1 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-2 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[color:var(--portal-border)] px-4 text-[11px] font-semibold text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
                onClick={() => cancelNotePopover()}
              >
                Close
              </button>
              <button
                type="button"
                className="luxor-gold-raised inline-flex min-h-11 items-center rounded-lg px-4 text-[11px] font-bold !text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  noteSaveSuppressedRef.current = false
                  noteSaveCancelledRef.current = false
                  commitNotePopover()
                }}
              >
                Save note
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {showFloatingPanel ? (
        <div className="fixed bottom-[calc(var(--portal-mobile-nav-height,0px)+1rem)] left-3 z-[63] sm:bottom-6 sm:left-6" data-portal-dev-ignore>
          <section className={`portal-popover-surface w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[color:var(--portal-border)] shadow-lg ${panelExpanded ? 'shadow-2xl' : ''}`}>
            <button
              type="button"
              id="portal-developer-ticket-panel-toggle"
              onClick={onTogglePanel}
              aria-expanded={panelExpanded}
              aria-controls="portal-developer-ticket-panel-body"
              className={`flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 text-left text-xs font-semibold text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--portal-card)] ${panelExpanded ? 'rounded-b-none border-b border-[color:var(--portal-border)]' : ''}`}
            >
              <Wrench size={14} className="shrink-0 text-[#caa24c]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-[color:var(--portal-text)]">Developer ticket</span>
                {panelExpanded ? (
                  <span className="block text-[10px] font-normal text-[color:var(--portal-muted)]">Stays in sync with Elena</span>
                ) : null}
              </span>
              <span className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={`transition-transform duration-300 motion-reduce:transition-none ${panelExpanded ? 'rotate-180' : ''}`}
                />
              </span>
            </button>
            <div
              id="portal-developer-ticket-panel-body"
              ref={ticketPanelBodyRef}
              aria-hidden={!panelExpanded}
              {...(!panelExpanded ? { inert: true } : {})}
              className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${panelExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="max-h-[min(60vh,28rem)] space-y-3 overflow-y-auto p-3">
                  <label className="block text-[11px] font-semibold text-[color:var(--portal-text)]">
                    Title
                    <input
                      value={draft.title}
                      onChange={(event) => onPatchDraft({ title: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-2.5 py-2 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold text-[color:var(--portal-text)]">
                    Details
                    <textarea
                      value={draft.description}
                      onChange={(event) => onPatchDraft({ description: event.target.value })}
                      rows={3}
                      className="mt-1 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-2 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
                    />
                  </label>
                  <p className="text-[10px] text-[color:var(--portal-muted)]">
                    Page: <span className="font-semibold text-[color:var(--portal-text)]">{draft.pagePath}</span>
                  </p>
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-[color:var(--portal-text)]">Page notes</p>
                    {draft.annotations.length === 0 ? (
                      <p className="text-[10px] text-[color:var(--portal-muted)]">No annotations yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {draft.annotations.map((item) => (
                          <li key={item.id} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-2 py-1.5 text-[10px] text-[color:var(--portal-text)]">
                            <p className="leading-snug">{developerTicketAnnotationDisplayLine(item)}</p>
                            <div className="mt-1 flex gap-2">
                              <button
                                type="button"
                                className="inline-flex min-h-11 items-center px-2 font-semibold text-[#a8792f] dark:text-[#f1d27a]"
                                onClick={(event) => {
                                  openAnnotationEditor({
                                    id: item.id,
                                    note: item.note,
                                    storedElement: item.element,
                                    returnFocus: event.currentTarget,
                                  })
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="inline-flex min-h-11 items-center px-2 font-semibold text-red-600 dark:text-red-400"
                                onClick={() => onRemoveAnnotation(item.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <footer className="flex flex-wrap gap-2 border-t border-[color:var(--portal-border)] p-3">
                  <button
                    ref={selectElementTriggerRef}
                    type="button"
                    onClick={onToggleSelect}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 ${elementSelectMode ? 'luxor-gold-raised !text-white' : 'border border-[color:var(--portal-border)] text-[color:var(--portal-text)]'}`}
                  >
                    <MousePointerClick size={13} aria-hidden="true" />
                    {elementSelectMode ? 'Selecting…' : 'Select element'}
                  </button>
                </footer>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export function DeveloperTicketAnnotationRows({
  annotations,
  onEdit,
  onRemove,
  disabled,
}: {
  annotations: DeveloperTicketAnnotation[]
  onEdit: (id: string, trigger: HTMLElement) => void
  onRemove: (id: string) => void
  disabled?: boolean
}) {
  if (!annotations.length) return null
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-[color:var(--portal-text)]">Page notes</span>
      <ul className="space-y-1.5">
        {annotations.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-2.5 py-2 text-xs">
            <span className="min-w-0 flex-1 leading-snug text-[color:var(--portal-text)]">{developerTicketAnnotationDisplayLine(item)}</span>
            {!disabled ? (
              <span className="flex shrink-0 gap-2 text-[10px] font-semibold">
                <button type="button" className="inline-flex min-h-11 items-center px-2 text-[#a8792f] dark:text-[#f1d27a]" onClick={(event) => onEdit(item.id, event.currentTarget)}>Edit</button>
                <button type="button" className="inline-flex min-h-11 items-center px-2 text-red-600 dark:text-red-400" onClick={() => onRemove(item.id)}>Remove</button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}