'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS,
  type LuxorCreatedDocumentFieldRow,
  type LuxorCreatedDocumentFieldType,
  type LuxorCreatedDocumentSignerRow,
} from '@/lib/luxorCreatedDocumentFieldTypes'
import {
  defaultCreatedDocumentFieldRequired,
  defaultCreatedDocumentFieldSize,
  nextPaletteFieldPlacement,
  pointerToNormalizedTopLeft,
} from '@/lib/luxorCreatedDocumentFieldLayout'
import { signerRoleTintClass, toneForRoleKey } from '@/lib/luxorCreatedDocumentFieldColors'
import { PortalButton, PortalCheckbox, PortalSelect } from '@/components/portal/PortalUI'

const CreatedDocumentFieldPdfCanvas = dynamic(
  () => import('@/components/created-document/CreatedDocumentFieldPdfCanvas').then((mod) => mod.CreatedDocumentFieldPdfCanvas),
  { ssr: false, loading: () => <p className="text-sm text-[color:var(--portal-muted)]">Loading PDF…</p> },
)

type LocalField = Omit<LuxorCreatedDocumentFieldRow, 'document_id' | 'created_at' | 'updated_at'> & { clientId: string }

type Props = {
  documentId: string
  pdfUrl: string | null
  canEdit: boolean
}

function newClientId() {
  return `field_${Math.random().toString(36).slice(2, 10)}`
}

export function DocumentCreatorFieldsStep({ documentId, pdfUrl, canEdit }: Props) {
  const [fields, setFields] = useState<LocalField[]>([])
  const [signers, setSigners] = useState<LuxorCreatedDocumentSignerRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [numPages, setNumPages] = useState(1)
  const [pageWidth, setPageWidth] = useState(0)
  const [placingType, setPlacingType] = useState<LuxorCreatedDocumentFieldType | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testLink, setTestLink] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testRoleKey, setTestRoleKey] = useState('')
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; origin: LocalField } | null>(null)

  const roleOrder = useMemo(() => signers.map((signer) => signer.role_key), [signers])
  const selected = fields.find((field) => field.clientId === selectedId) || null

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/operations/documents/${encodeURIComponent(documentId)}/fields`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Fields could not be loaded.')
      setSigners(body.signers || [])
      setTestRoleKey(body.signers?.[0]?.role_key || '')
      setFields((body.fields || []).map((field: LuxorCreatedDocumentFieldRow) => ({
        clientId: field.id,
        id: field.id,
        field_type: field.field_type,
        role_key: field.role_key,
        label: field.label,
        required: field.required,
        page_index: field.page_index,
        x: field.x,
        y: field.y,
        w: field.w,
        h: field.h,
        sort_order: field.sort_order,
      })))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Fields could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const wrap = canvasWrapRef.current
    if (!wrap) return
    const measure = () => setPageWidth(Math.max(260, Math.min(620, wrap.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setPageIndex((value) => Math.max(0, Math.min(numPages - 1, value)))
  }, [numPages])

  const pageFields = fields.filter((field) => field.page_index === pageIndex)

  const addFieldAt = (fieldType: LuxorCreatedDocumentFieldType, x: number, y: number) => {
    if (!canEdit) return
    const signer = signers.find((row) => row.role_key === testRoleKey) || signers[0]
    if (!signer) return
    const size = defaultCreatedDocumentFieldSize(fieldType)
    const clientId = newClientId()
    const label = LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS[fieldType]
    const field: LocalField = {
      clientId,
      id: clientId,
      field_type: fieldType,
      role_key: signer.role_key,
      label,
      required: defaultCreatedDocumentFieldRequired(fieldType),
      page_index: pageIndex,
      x,
      y,
      w: size.w,
      h: size.h,
      sort_order: fields.length,
    }
    setFields((current) => [...current, field])
    setSelectedId(clientId)
  }

  const addFieldFromPalette = (fieldType: LuxorCreatedDocumentFieldType) => {
    const placement = nextPaletteFieldPlacement(pageFields)
    addFieldAt(fieldType, placement.x, placement.y)
  }

  const placeFromPointer = (event: { clientX: number; clientY: number }, fieldType: LuxorCreatedDocumentFieldType) => {
    const canvas = pageRef.current?.querySelector('[data-page-index]') as HTMLElement | null
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const size = defaultCreatedDocumentFieldSize(fieldType)
    const { x, y } = pointerToNormalizedTopLeft(event.clientX, event.clientY, rect, size)
    addFieldAt(fieldType, x, y)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/operations/documents/${encodeURIComponent(documentId)}/fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fields.map((field, index) => ({
            field_type: field.field_type,
            role_key: field.role_key,
            label: field.label,
            required: field.required,
            page_index: field.page_index,
            x: field.x,
            y: field.y,
            w: field.w,
            h: field.h,
            sort_order: index,
          })),
          signers: signers.map((signer) => ({
            id: signer.id,
            role_label: signer.role_label,
            name: signer.name,
            email: signer.email,
          })),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Fields could not be saved.')
      setFields((body.fields || []).map((field: LuxorCreatedDocumentFieldRow) => ({
        clientId: field.id,
        ...field,
      })))
      setSigners(body.signers || [])
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Fields could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const createTestLink = async (roleKey: string) => {
    setTestBusy(true)
    setTestLink('')
    setError('')
    try {
      const response = await fetch(`/api/operations/documents/${encodeURIComponent(documentId)}/test-signing-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleKey }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Test link could not be created.')
      setTestLink(body.signingUrl)
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Test link could not be created.')
    } finally {
      setTestBusy(false)
    }
  }

  const beginDrag = (event: React.PointerEvent, field: LocalField, mode: 'move' | 'resize') => {
    if (!canEdit || window.matchMedia('(max-width: 819px)').matches) return
    event.stopPropagation()
    dragRef.current = { id: field.clientId, mode, startX: event.clientX, startY: event.clientY, origin: field }
    setSelectedId(field.clientId)
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onCanvasPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    const canvas = pageRef.current?.querySelector('[data-page-index]') as HTMLElement | null
    if (!drag || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const dx = (event.clientX - drag.startX) / rect.width
    const dy = (event.clientY - drag.startY) / rect.height
    setFields((current) => current.map((field) => {
      if (field.clientId !== drag.id) return field
      if (drag.mode === 'move') {
        return {
          ...field,
          x: Math.max(0, Math.min(1 - field.w, drag.origin.x + dx)),
          y: Math.max(0, Math.min(1 - field.h, drag.origin.y + dy)),
        }
      }
      return {
        ...field,
        w: Math.max(0.08, Math.min(1 - field.x, drag.origin.w + dx)),
        h: Math.max(0.04, Math.min(1 - field.y, drag.origin.h + dy)),
      }
    }))
  }

  const endDrag = () => { dragRef.current = null }

  if (loading) return <p className="text-sm text-[color:var(--portal-muted)]">Loading fields…</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 min-[1280px]:grid min-[1280px]:h-full min-[1280px]:grid-cols-[220px_minmax(0,1fr)_280px] min-[1280px]:gap-6">
      <aside className="hidden min-[820px]:block">
        <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Field palette</h2>
        <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Drag onto the page, or choose a type then click to place.</p>
        <div className="mt-3 grid gap-2">
          {(Object.keys(LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS) as LuxorCreatedDocumentFieldType[]).map((type) => (
            <PortalButton
              key={type}
              type="button"
              variant="secondary"
              className="min-h-10 w-full justify-start"
              disabled={!canEdit}
              draggable={canEdit}
              onDragStart={(event) => event.dataTransfer.setData('field-type', type)}
              onClick={() => setPlacingType(type)}
              onDoubleClick={() => addFieldFromPalette(type)}
            >
              {LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS[type]}
            </PortalButton>
          ))}
        </div>
        {placingType ? (
          <p className="mt-2 text-xs text-[#a8792f]">Click on the PDF to place a {LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS[placingType]} field.</p>
        ) : null}
      </aside>

      <section className="min-h-0 min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PortalButton type="button" variant="secondary" className="min-h-9" disabled={pageIndex <= 0} onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>Page −</PortalButton>
            <span className="text-xs font-semibold text-[color:var(--portal-muted)]">Page {pageIndex + 1} of {Math.max(1, numPages)}</span>
            <PortalButton type="button" variant="secondary" className="min-h-9" disabled={pageIndex >= numPages - 1} onClick={() => setPageIndex((value) => Math.min(numPages - 1, value + 1))}>Page +</PortalButton>
          </div>
          <PortalButton type="button" variant="secondary" className="min-h-10" disabled={!canEdit || saving} onClick={() => void save()}>Save fields</PortalButton>
        </div>
        <div
          ref={canvasWrapRef}
          className="relative mx-auto w-full max-w-[620px]"
          onPointerMove={onCanvasPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          <div ref={pageRef}>
            <CreatedDocumentFieldPdfCanvas
              pdfUrl={pdfUrl}
              fields={fields}
              pageWidth={pageWidth}
              mode="layout"
              layoutPageIndex={pageIndex}
              onNumPages={setNumPages}
              onError={() => setError('PDF preview is unavailable for field placement.')}
              layout={{
                selectedId,
                tintClassForField: (field) => signerRoleTintClass(toneForRoleKey(field.role_key || 'signer_1', roleOrder)),
                onSelect: setSelectedId,
                onMovePointerDown: (event, field) => beginDrag(event, field as LocalField, 'move'),
                onResizePointerDown: (event, field) => beginDrag(event, field as LocalField, 'resize'),
                onCanvasBackgroundClick: () => setSelectedId(null),
                onCanvasPlacePointerUp: (event) => {
                  if (!placingType || !canEdit) return
                  placeFromPointer(event, placingType)
                  setPlacingType(null)
                },
                onDropField: (event) => {
                  if (!canEdit) return
                  const type = event.dataTransfer.getData('field-type') as LuxorCreatedDocumentFieldType
                  if (!type) return
                  placeFromPointer(event, type)
                },
              }}
            />
          </div>
        </div>
      </section>

      <aside className="hidden min-[1280px]:block">
        <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Inspector</h2>
        {selected ? (
          <div className="mt-3 space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
            <label className="block text-[11px] text-[color:var(--portal-muted)]">Label</label>
            <input
              className="w-full min-h-10 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 text-sm"
              value={selected.label}
              disabled={!canEdit}
              onChange={(event) => setFields((current) => current.map((field) => (field.clientId === selected.clientId ? { ...field, label: event.target.value } : field)))}
            />
            <PortalSelect
              aria-label="Signer role"
              value={selected.role_key}
              disabled={!canEdit}
              options={signers.map((signer) => ({ value: signer.role_key, label: signer.role_label }))}
              onChange={(value) => setFields((current) => current.map((field) => (field.clientId === selected.clientId ? { ...field, role_key: value } : field)))}
            />
            <PortalCheckbox
              checked={selected.required}
              disabled={!canEdit}
              onChange={(checked) => setFields((current) => current.map((field) => (field.clientId === selected.clientId ? { ...field, required: checked } : field)))}
              label="Required"
            />
            <PortalButton type="button" variant="secondary" className="min-h-10 w-full" disabled={!canEdit} onClick={() => setFields((current) => current.filter((field) => field.clientId !== selected.clientId))}>
              Remove field
            </PortalButton>
          </div>
        ) : (
          <p className="mt-2 text-xs text-[color:var(--portal-muted)]">Select a field on the canvas to edit it.</p>
        )}
        <div className="mt-6 rounded-xl border border-dashed border-[#caa24c]/50 bg-[#caa24c]/5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a8792f]">Phase 2 preview</p>
          <PortalSelect
            className="mt-2"
            aria-label="Role for test link"
            value={testRoleKey || signers[0]?.role_key || ''}
            disabled={!canEdit || testBusy}
            options={signers.map((signer) => ({ value: signer.role_key, label: signer.role_label }))}
            onChange={(value) => setTestRoleKey(value)}
          />
          <PortalButton type="button" className="mt-2 min-h-10 w-full" variant="secondary" disabled={!canEdit || testBusy || !testRoleKey} onClick={() => void createTestLink(testRoleKey || signers[0]?.role_key || '')}>
            Create test signing link
          </PortalButton>
          {testLink ? <p className="mt-2 break-all text-xs font-medium text-[color:var(--portal-text)]">{testLink}</p> : null}
        </div>
      </aside>

      {error ? <p role="alert" className="col-span-full text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  )
}