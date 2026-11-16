'use client'

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, GripVertical, MessageSquareText, MousePointerClick, Pencil, Trash2, Wrench, X } from '@/lib/icons/phosphor-compat'
import { PortalCloseButton } from '@/components/portal/PortalUI'
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
  isPointOverDeveloperIgnoredSurface,
  pickDeveloperTicketElementAtPoint,
  readDeveloperTicketViewport,
} from '@/lib/luxorDeveloperTicketElementPicker'
import { normalizeDeveloperSupportPagePath } from '@/lib/luxorDeveloperSupportPagePaths'
import {
  getPortalClientMountedServerSnapshot,
  getPortalClientMountedSnapshot,
  subscribePortalClientMounted,
} from '@/lib/luxorPortalClientMount'

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
  removeAllAnnotations: () => void
  startDeveloperTicket: (payload: DeveloperSupportCardPayload, chatId?: string | null) => void
  exitDeveloperMode: () => void
  finishDeveloperTicketSent: () => void
  setElementSelectMode: (value: boolean) => void
  panelExpanded: boolean
  setPanelExpanded: (value: boolean) => void
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

export function PortalDeveloperModeProvider({
  userEmail,
  portalRole,
  activePath,
  elenaOpen,
  children,
}: {
  userEmail: string
  portalRole: string
  activePath: string
  elenaOpen: boolean
  children: React.ReactNode
}) {
  const owner = portalRole === 'owner'
  const isClient = useSyncExternalStore(
    subscribePortalClientMounted,
    getPortalClientMountedSnapshot,
    getPortalClientMountedServerSnapshot,
  )
  const [draft, setDraft] = useState<DeveloperTicketDraft>(DEVELOPER_TICKET_DRAFT_EMPTY)
  const [elementSelectMode, setElementSelectMode] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
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

  const handleSetElementSelectMode = useCallback((value: boolean) => {
    if (value && owner) {
      setDraft((prev) => {
        if (prev.active && prev.phase !== 'sent') return prev
        const next: DeveloperTicketDraft = {
          ...prev,
          active: true,
          phase: prev.phase === 'sent' ? 'compose' : prev.phase,
        }
        persistDraft(userEmail, next)
        return next
      })
    }
    setElementSelectMode(value)
  }, [owner, persistDraft, userEmail])

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

  const removeAllAnnotations = useCallback(() => {
    setDraft((prev) => {
      const next = { ...prev, annotations: [] }
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
    removeAllAnnotations,
    startDeveloperTicket,
    exitDeveloperMode,
    finishDeveloperTicketSent,
    setElementSelectMode: handleSetElementSelectMode,
    panelExpanded,
    setPanelExpanded,
    beginEditAnnotation,
  }), [
    developerModeActive,
    draft,
    elementSelectMode,
    exitDeveloperMode,
    finishDeveloperTicketSent,
    handleSetElementSelectMode,
    panelExpanded,
    patchDraft,
    removeAllAnnotations,
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
      <AnimatePresence>
        {developerModeActive ? (
          <PortalDeveloperModeChrome
            key="portal-developer-mode-chrome"
            activePath={activePath}
            draft={draft}
            elementSelectMode={elementSelectMode}
            panelExpanded={panelExpanded}
            elenaOpen={elenaOpen}
            onExit={exitDeveloperMode}
            onTogglePanel={() => setPanelExpanded((value) => !value)}
            onToggleSelect={() => setElementSelectMode((value) => !value)}
            onSetSelectMode={setElementSelectMode}
            onUpsertAnnotation={upsertAnnotation}
            onRemoveAnnotation={removeAnnotation}
            onRemoveAllAnnotations={removeAllAnnotations}
            onPatchDraft={patchDraft}
            editAnnotationSignal={editAnnotationSignal}
            consumeEditAnnotationRequest={consumeEditAnnotationRequest}
          />
        ) : null}
      </AnimatePresence>
    </DeveloperModeContext.Provider>
  )
}

function PortalDeveloperModeChrome({
  activePath,
  draft,
  elementSelectMode,
  panelExpanded,
  elenaOpen,
  onExit,
  onTogglePanel,
  onToggleSelect,
  onSetSelectMode,
  onUpsertAnnotation,
  onRemoveAnnotation,
  onRemoveAllAnnotations,
  onPatchDraft,
  editAnnotationSignal,
  consumeEditAnnotationRequest,
}: {
  activePath: string
  draft: DeveloperTicketDraft
  elementSelectMode: boolean
  panelExpanded: boolean
  elenaOpen: boolean
  onExit: () => void
  onTogglePanel: () => void
  onToggleSelect: () => void
  onSetSelectMode: (value: boolean) => void
  onUpsertAnnotation: (annotation: DeveloperTicketAnnotation) => void
  onRemoveAnnotation: (id: string) => void
  onRemoveAllAnnotations: () => void
  onPatchDraft: (patch: Partial<DeveloperTicketDraft>) => void
  editAnnotationSignal: number
  consumeEditAnnotationRequest: () => { id: string; returnFocus: HTMLElement | null } | null
}) {
  const reduceMotion = useReducedMotion()
  const hoverRef = useRef<HTMLElement | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const cursorNodeRef = useRef<HTMLDivElement>(null)
  const [pendingAnchor, setPendingAnchor] = useState<{
    rect: DOMRect
    element: HTMLElement
    id?: string
    clickOffset?: { rx: number; ry: number }
  } | null>(null)
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
  const floatingPanelRef = useRef<HTMLDivElement>(null)
  const floatingPanelDragRef = useRef<{ id: number; clientX: number; clientY: number; initX: number; initY: number } | null>(null)
  const [floatingPosition, setFloatingPosition] = useState<{ x: number; y: number } | null>(null)
  const [annotationOffsets, setAnnotationOffsets] = useState<Record<string, { rx: number; ry: number }>>({})
  const [annotationMarkers, setAnnotationMarkers] = useState<Array<{
    id: string
    index: number
    note: string
    element: DeveloperTicketAnnotation['element'] | null
    x: number
    y: number
  }>>([])
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

  const openNewAnnotationEditor = useCallback((anchor: {
    rect: DOMRect
    element: HTMLElement
    clickOffset?: { rx: number; ry: number }
  }) => {
    const id = crypto.randomUUID()
    editingAnnotationIdRef.current = id
    useStoredElementRef.current = false
    noteAnchorBaselineRef.current = ''
    noteSaveCancelledRef.current = false
    noteSaveSuppressedRef.current = false
    notePopoverReturnFocusRef.current = selectElementTriggerRef.current
    if (anchor.clickOffset) {
      const offset = anchor.clickOffset
      setAnnotationOffsets((prev) => ({ ...prev, [id]: offset }))
    }
    setNoteDraft('')
    setPendingAnchor({
      rect: anchor.rect,
      element: anchor.element,
      id,
      clickOffset: anchor.clickOffset,
    })
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
    const hideCustomCursor = () => {
      if (cursorNodeRef.current) cursorNodeRef.current.style.opacity = '0'
      document.body.removeAttribute('data-portal-annotate-cursor')
    }
    if (!elementSelectMode || pendingAnchor) {
      hideCustomCursor()
      return
    }
    // Ensure all iframes in the portal do not swallow mouse events while picking an element to annotate
    document.body.setAttribute('data-portal-annotate-cursor', 'true')
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
      if (event.pointerType === 'touch' || isPointOverDeveloperIgnoredSurface(event.clientX, event.clientY)) {
        hideCustomCursor()
        if (hoverRef.current !== null) {
          hoverRef.current = null
          setHoverRect(null)
        }
        return
      }
      if (cursorNodeRef.current) {
        cursorNodeRef.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY - 28}px, 0)`
        if (cursorNodeRef.current.style.opacity !== '1') {
          cursorNodeRef.current.style.opacity = '1'
        }
      }
      if (!document.body.hasAttribute('data-portal-annotate-cursor')) {
        document.body.setAttribute('data-portal-annotate-cursor', 'true')
      }
      const target = pickDeveloperTicketElementAtPoint(event.clientX, event.clientY)
      if (!target) {
        if (hoverRef.current !== null) {
          hoverRef.current = null
          setHoverRect(null)
        }
        return
      }
      if (target !== hoverRef.current) {
        hoverRef.current = target
        setHoverRect(target.getBoundingClientRect())
      }
    }
    const onClick = (event: MouseEvent) => {
      if (isPointOverDeveloperIgnoredSurface(event.clientX, event.clientY)) {
        return
      }
      const target = pickDeveloperTicketElementAtPoint(event.clientX, event.clientY)
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      const descriptor = buildDeveloperTicketElementDescriptor(target)
      if (!descriptor) return
      const rect = target.getBoundingClientRect()
      const rx = rect.width > 0 ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0.5
      const ry = rect.height > 0 ? Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) : 0.5
      hideCustomCursor()
      openNewAnnotationEditor({ rect, element: target, clickOffset: { rx, ry } })
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', hideCustomCursor)
    window.addEventListener('blur', hideCustomCursor)
    window.addEventListener('click', onClick, true)
    return () => {
      hideCustomCursor()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', hideCustomCursor)
      window.removeEventListener('blur', hideCustomCursor)
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

  useEffect(() => {
    const normalizedCurrent = normalizeDeveloperSupportPagePath(activePath)
    const pageItems = draft.annotations.filter(
      (item) => normalizeDeveloperSupportPagePath(item.pagePath) === normalizedCurrent,
    )

    const updateMarkers = () => {
      const next: Array<{
        id: string
        index: number
        note: string
        element: DeveloperTicketAnnotation['element'] | null
        x: number
        y: number
      }> = []
      pageItems.forEach((item, idx) => {
        const matched = resolveDeveloperTicketAnnotationElement(item.element.selector)
        if (!matched) return
        const rect = matched.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return
        const offset = annotationOffsets[item.id] ?? { rx: 0.94, ry: 0.14 }
        next.push({
          id: item.id,
          index: idx + 1,
          note: item.note,
          element: item.element,
          x: rect.left + rect.width * offset.rx,
          y: rect.top + rect.height * offset.ry,
        })
      })
      if (pendingAnchor?.id && !pageItems.some((item) => item.id === pendingAnchor.id)) {
        const rect = pendingAnchor.element instanceof HTMLElement && pendingAnchor.element !== document.documentElement
          ? pendingAnchor.element.getBoundingClientRect()
          : pendingAnchor.rect
        const offset = pendingAnchor.clickOffset ?? annotationOffsets[pendingAnchor.id] ?? { rx: 0.5, ry: 0.5 }
        next.push({
          id: pendingAnchor.id,
          index: next.length + 1,
          note: 'Adding annotation…',
          element: null,
          x: rect.left + rect.width * offset.rx,
          y: rect.top + rect.height * offset.ry,
        })
      }
      setAnnotationMarkers(next)
    }

    const frame = window.requestAnimationFrame(updateMarkers)
    if (pageItems.length === 0 && !pendingAnchor?.id) {
      return () => window.cancelAnimationFrame(frame)
    }

    let rafId: number | null = null
    const scheduleUpdate = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        updateMarkers()
      })
    }

    window.addEventListener('scroll', scheduleUpdate, true)
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      window.cancelAnimationFrame(frame)
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', scheduleUpdate, true)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [activePath, annotationOffsets, draft.annotations, pendingAnchor])

  const showFloatingPanel = !elenaOpen && draft.phase !== 'sent'

  return (
    <motion.div
      className="portal-developer-mode-chrome"
      data-portal-dev-ignore
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.23, 1, 0.32, 1] }}
    >
      <motion.div
        aria-hidden="true"
        initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
        transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.23, 1, 0.32, 1] }}
        className="portal-dev-glow-frame pointer-events-none fixed inset-0 z-[62] origin-center will-change-transform"
      />
      <motion.div
        aria-hidden="true"
        initial={reduceMotion ? false : { opacity: 0, scaleX: 0.75 }}
        animate={{ opacity: 1, scaleX: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scaleX: 0.75 }}
        transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.23, 1, 0.32, 1] }}
        className="portal-dev-glow-topline pointer-events-none fixed inset-x-0 top-0 z-[62] h-[2.5px] origin-center"
      />
      <motion.button
        type="button"
        data-portal-dev-ignore
        onClick={onExit}
        initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.96 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          x: elenaOpen ? -440 : 0,
        }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.32, ease: [0.23, 1, 0.32, 1] }
        }
        className="fixed bottom-[calc(var(--portal-mobile-nav-height,0px)+3.85rem)] right-3 z-[63] inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--portal-text)] shadow-md backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 sm:bottom-6 sm:right-6 sm:min-h-11 sm:px-4 sm:py-2 sm:text-xs will-change-transform cursor-pointer"
        aria-label="Exit developer mode"
        title="Exit developer mode"
      >
        <span className="sm:hidden flex items-center gap-1">
          <X size={12} className="text-[#caa24c]" aria-hidden="true" />
          <span>Exit QA</span>
        </span>
        <span className="hidden sm:inline">Exit developer mode</span>
      </motion.button>
      <AnimatePresence>
        {elementSelectMode ? (
          <motion.p
            key="developer-annotate-hint"
            initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.23, 1, 0.32, 1] }}
            className="fixed left-1/2 top-[calc(var(--portal-header-height,3.5rem)+0.5rem)] z-[63] -translate-x-1/2 rounded-full border border-[#caa24c]/40 bg-[color:var(--portal-card)]/95 px-3 py-1 text-[10px] font-semibold text-[color:var(--portal-text)] shadow-sm backdrop-blur-md"
            data-portal-dev-ignore
          >
            Tap an element to annotate. Esc cancels.
          </motion.p>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {(pendingAnchor ? pendingAnchor.rect : elementSelectMode ? hoverRect : null) ? (
          <motion.div
            key="developer-hover-outline"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
            className="pointer-events-none fixed z-[61] rounded-md border-2 border-[#caa24c] bg-[#caa24c]/10"
            style={{
              left: (pendingAnchor ? pendingAnchor.rect : hoverRect)!.left,
              top: (pendingAnchor ? pendingAnchor.rect : hoverRect)!.top,
              width: (pendingAnchor ? pendingAnchor.rect : hoverRect)!.width,
              height: (pendingAnchor ? pendingAnchor.rect : hoverRect)!.height,
            }}
          />
        ) : null}
      </AnimatePresence>
      {elementSelectMode && !pendingAnchor ? (
        <div
          ref={cursorNodeRef}
          aria-hidden="true"
          style={{ opacity: 0 }}
          className="luxor-gold-raised pointer-events-none fixed left-0 top-0 z-[66] h-7 w-7 rounded-full rounded-bl-[4px] border-2 border-white shadow-lg will-change-transform"
        />
      ) : null}
      <AnimatePresence>
        {annotationMarkers.map((marker) => (
          <motion.button
            key={marker.id}
            type="button"
            data-portal-dev-ignore
            aria-label={`Edit annotation ${marker.index}: ${marker.note}`}
            title={marker.note}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.45 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.45 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
            onClick={(event) => {
              event.stopPropagation()
              if (!marker.element) return
              openAnnotationEditor({
                id: marker.id,
                note: marker.note,
                storedElement: marker.element,
                returnFocus: event.currentTarget,
              })
            }}
            style={{ left: marker.x, top: marker.y, transformOrigin: 'bottom left' }}
            className="luxor-gold-raised fixed z-[61] flex h-7 w-7 -translate-y-full items-center justify-center rounded-full rounded-bl-[4px] border-2 border-white text-[11px] font-bold tabular-nums !text-white shadow-lg cursor-pointer transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60"
          >
            {marker.index}
          </motion.button>
        ))}
      </AnimatePresence>
      <AnimatePresence>
        {pendingAnchor ? (
          <motion.div
            key="developer-ticket-note-popover"
            data-portal-dev-ignore
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
            className="fixed z-[64] w-[min(18rem,calc(100vw-2rem))]"
            style={{
              left: Math.max(16, Math.min(pendingAnchor.rect.left, window.innerWidth - 304)),
              top: Math.max(16, Math.min(pendingAnchor.rect.bottom + 8, window.innerHeight - 170)),
            }}
          >
            <div className="portal-dev-glass-surface rounded-2xl border border-[color:var(--portal-border)] p-3 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="developer-ticket-note-input"
                  className="block text-[11px] font-semibold text-[color:var(--portal-text)]"
                >
                  Note for this element
                </label>
                <PortalCloseButton
                  onClick={() => cancelNotePopover()}
                  aria-label="Close annotation note"
                  className="!h-7 !w-7 !min-h-0 !min-w-0 shrink-0 rounded-lg"
                />
              </div>
              <textarea
                id="developer-ticket-note-input"
                autoFocus
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    cancelNotePopover()
                    return
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.stopPropagation()
                    clearNoteSaveTimer()
                    noteSaveSuppressedRef.current = false
                    noteSaveCancelledRef.current = false
                    commitNotePopover()
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
                placeholder="Describe what needs fixing…"
                className="mt-2 w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)]/70 p-2.5 text-xs text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)]/70 outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
              />
              <p className="mt-1.5 text-[10px] text-[color:var(--portal-muted)]">
                Press Enter to save · Esc to cancel
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {showFloatingPanel ? (
          <motion.div
            ref={floatingPanelRef}
            key="portal-developer-ticket-floating-panel"
            data-portal-dev-ignore
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            style={{
              left: floatingPosition ? `${floatingPosition.x}px` : undefined,
              top: floatingPosition ? `${floatingPosition.y}px` : undefined,
              bottom: floatingPosition ? 'auto' : undefined,
            }}
            className={`fixed z-[63] touch-none ${
              floatingPosition
                ? ''
                : 'bottom-[calc(var(--portal-mobile-nav-height,0px)+1rem)] left-3 sm:bottom-6 sm:left-6'
            }`}
          >
            <section
              className={`portal-dev-glass-surface w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[color:var(--portal-border)] shadow-xl transition-shadow ${
                panelExpanded ? 'shadow-2xl' : ''
              }`}
            >
              <div className={`flex items-center border-b transition-colors duration-300 motion-reduce:transition-none ${panelExpanded ? 'border-[color:var(--portal-border)]' : 'border-transparent'}`}>
                <div
                  className="flex h-11 w-7 shrink-0 cursor-grab active:cursor-grabbing items-center justify-center text-[color:var(--portal-muted)] opacity-60 hover:opacity-100 transition-opacity select-none pl-1"
                  title="Drag ticket"
                  aria-label="Drag developer ticket"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    const node = floatingPanelRef.current
                    if (!node) return
                    const rect = node.getBoundingClientRect()
                    floatingPanelDragRef.current = {
                      id: e.pointerId,
                      clientX: e.clientX,
                      clientY: e.clientY,
                      initX: rect.left,
                      initY: rect.top,
                    }
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    const drag = floatingPanelDragRef.current
                    if (!drag || drag.id !== e.pointerId) return
                    const nextX = drag.initX + (e.clientX - drag.clientX)
                    const nextY = drag.initY + (e.clientY - drag.clientY)
                    const width = floatingPanelRef.current?.offsetWidth || 350
                    const height = floatingPanelRef.current?.offsetHeight || 44
                    const boundedX = Math.max(12, Math.min(nextX, window.innerWidth - width - 12))
                    const boundedY = Math.max(12, Math.min(nextY, window.innerHeight - height - 12))
                    setFloatingPosition({ x: boundedX, y: boundedY })
                  }}
                  onPointerUp={() => {
                    floatingPanelDragRef.current = null
                  }}
                  onPointerCancel={() => {
                    floatingPanelDragRef.current = null
                  }}
                >
                  <GripVertical size={14} aria-hidden="true" />
                </div>
                <button
                  type="button"
                  id="portal-developer-ticket-panel-toggle"
                  onClick={onTogglePanel}
                  aria-expanded={panelExpanded}
                  aria-controls="portal-developer-ticket-panel-body"
                  className="flex min-h-11 flex-1 items-center gap-2 pr-3 py-1.5 text-left text-xs font-semibold text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 cursor-pointer"
                >
                  <Wrench size={14} className="shrink-0 text-[#caa24c]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold leading-4 text-[color:var(--portal-text)]">Developer ticket</span>
                    <span
                      aria-hidden={!panelExpanded}
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
                        panelExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <span className="block min-h-0 overflow-hidden text-[10px] font-normal leading-tight text-[color:var(--portal-muted)]">
                        Stays in sync with Elena
                      </span>
                    </span>
                  </span>
                  <span className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center">
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={`transition-transform duration-300 motion-reduce:transition-none ${panelExpanded ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>
              </div>
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
                        className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)]/80 px-2.5 py-2 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
                      />
                    </label>
                    <label className="block text-[11px] font-semibold text-[color:var(--portal-text)]">
                      Details
                      <textarea
                        value={draft.description}
                        onChange={(event) => onPatchDraft({ description: event.target.value })}
                        rows={3}
                        className="mt-1 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)]/80 p-2 text-xs text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
                      />
                    </label>
                    <p className="text-[10px] text-[color:var(--portal-muted)]">
                      Page: <span className="font-semibold text-[color:var(--portal-text)]">{draft.pagePath}</span>
                    </p>
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-[color:var(--portal-text)]">Annotations</p>
                      {draft.annotations.length === 0 ? (
                        <p className="text-[10px] text-[color:var(--portal-muted)]">No annotations yet.</p>
                      ) : (
                        <DeveloperTicketAnnotationRows
                          annotations={draft.annotations}
                          onEdit={(id, trigger) => {
                            const item = draft.annotations.find((a) => a.id === id)
                            if (item) {
                              openAnnotationEditor({
                                id: item.id,
                                note: item.note,
                                storedElement: item.element,
                                returnFocus: trigger,
                              })
                            }
                          }}
                          onRemove={(id) => onRemoveAnnotation(id)}
                          onRemoveAll={onRemoveAllAnnotations}
                        />
                      )}
                    </div>
                  </div>
                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] px-3 py-2.5">
                    <button
                      type="button"
                      onClick={onExit}
                      className="inline-flex sm:hidden items-center gap-1 rounded border-0 bg-transparent p-0 text-xs font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                    >
                      <X size={12} aria-hidden="true" />
                      <span>Exit QA</span>
                    </button>
                    <button
                      ref={selectElementTriggerRef}
                      type="button"
                      onClick={onToggleSelect}
                      className={`group inline-flex shrink-0 items-center gap-1.5 rounded border-0 bg-transparent p-0 text-xs font-semibold leading-5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 ml-auto ${
                        elementSelectMode
                          ? 'text-[#a8792f] dark:text-[#f1d27a] active:scale-95'
                          : 'text-[color:var(--portal-muted)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] active:scale-95'
                      }`}
                    >
                      <MousePointerClick
                        size={13}
                        aria-hidden="true"
                        className="shrink-0 transition-transform group-hover:scale-110 group-active:scale-90"
                      />
                      <span>{elementSelectMode ? 'Selecting…' : 'Select element'}</span>
                    </button>
                  </footer>
                </div>
              </div>
            </section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

export function DeveloperTicketAnnotationRows({
  annotations,
  onEdit,
  onRemove,
  onRemoveAll,
  disabled,
}: {
  annotations: DeveloperTicketAnnotation[]
  onEdit: (id: string, trigger: HTMLElement) => void
  onRemove: (id: string) => void
  onRemoveAll?: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const count = annotations.length

  if (!count) return null

  const label = `${count} ${count === 1 ? 'annotation' : 'annotations'}`

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/90 py-1 pl-2.5 pr-1 text-xs font-semibold text-[color:var(--portal-text)] shadow-xs transition-colors hover:border-[#caa24c]/45">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 bg-transparent p-0 text-left outline-none cursor-pointer"
          aria-expanded={open}
          aria-label={`View ${label}`}
        >
          <MessageSquareText size={14} className="shrink-0 text-[#caa24c]" aria-hidden="true" />
          <span className="tabular-nums">{label}</span>
        </button>
        {onRemoveAll && !disabled ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveAll()
            }}
            aria-label="Remove all annotations"
            title="Remove all annotations"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-rose-500 transition-colors cursor-pointer"
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="portal-dev-glass-surface absolute bottom-full left-0 z-30 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-[color:var(--portal-border)] p-2 shadow-2xl"
          >
            <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-bold text-[color:var(--portal-text)]">
              <span>Annotations ({count})</span>
              {onRemoveAll && !disabled ? (
                <button
                  type="button"
                  onClick={() => onRemoveAll()}
                  className="text-[10px] font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 cursor-pointer"
                >
                  Clear all
                </button>
              ) : null}
            </div>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
              <AnimatePresence initial={false}>
                {annotations.map((item, idx) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                    className="group flex items-start gap-2 overflow-hidden rounded-lg border border-[color:var(--portal-border)]/70 bg-[color:var(--portal-bg)]/80 p-2 text-xs"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/15 text-[10px] font-bold tabular-nums text-[#a8792f] dark:text-[#f1d27a]">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="rounded bg-[color:var(--portal-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[color:var(--portal-muted)]">
                          {item.element.role || 'element'}
                        </span>
                        <span className="truncate text-[10px] text-[color:var(--portal-muted)]">
                          {item.element.label || item.element.visibleText || item.element.selector}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 leading-snug text-[color:var(--portal-text)]">
                        {item.note}
                      </p>
                    </div>
                    {!disabled ? (
                      <div className="flex shrink-0 items-center -space-x-0.5 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => onEdit(item.id, e.currentTarget)}
                          aria-label={`Edit annotation ${idx + 1}`}
                          title="Edit annotation"
                          className="rounded p-0.5 text-[color:var(--portal-muted)] hover:text-[#caa24c] transition-colors cursor-pointer"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(item.id)}
                          aria-label={`Remove annotation ${idx + 1}`}
                          title="Remove annotation"
                          className="rounded p-0.5 text-[color:var(--portal-muted)] hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ) : null}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}