'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS,
  type LuxorCreatedDocumentFieldRow,
  type LuxorCreatedDocumentFieldType,
  type LuxorCreatedDocumentSignerRow,
} from '@/lib/luxorCreatedDocumentFieldTypes'
import { signerRoleTintClass, toneForRoleKey } from '@/lib/luxorCreatedDocumentFieldColors'
import { PortalButton, PortalCheckbox, PortalSelect } from '@/components/portal/PortalUI'

type LocalField = Omit<LuxorCreatedDocumentFieldRow, 'document_id' | 'created_at' | 'updated_at'> & { clientId: string }

type Props = {
  documentId: string
  canEdit: boolean
}

function newClientId() {
  return `field_${Math.random().toString(36).slice(2, 10)}`
}

export function DocumentCreatorFieldsStep({ documentId, canEdit }: Props) {
  const [fields, setFields] = useState<LocalField[]>([])
  const [signers, setSigners] = useState<LuxorCreatedDocumentSignerRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testLink, setTestLink] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testRoleKey, setTestRoleKey] = useState('')
  const canvasRef = useRef<HTMLDivElement | null>(null)
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

  const addField = (fieldType: LuxorCreatedDocumentFieldType) => {
    if (!canEdit) return
    const signer = signers[0]
    if (!signer) return
    const clientId = newClientId()
    const label = LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS[fieldType]
    const field: LocalField = {
      clientId,
      id: clientId,
      field_type: fieldType,
      role_key: signer.role_key,
      label,
      required: fieldType === 'signature',
      page_index: pageIndex,
      x: 0.12,
      y: 0.62,
      w: fieldType === 'signature' ? 0.42 : 0.3,
      h: fieldType === 'signature' ? 0.08 : 0.05,
      sort_order: fields.length,
    }
    setFields((current) => [...current, field])
    setSelectedId(clientId)
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
    dragRef.current = {
      id: field.clientId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: field,
    }
    setSelectedId(field.clientId)
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onCanvasPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current
    const canvas = canvasRef.current
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

  const pageFields = fields.filter((field) => field.page_index === pageIndex)

  if (loading) return <p className="text-sm text-[color:var(--portal-muted)]">Loading fields…</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 min-[1280px]:grid min-[1280px]:h-full min-[1280px]:grid-cols-[220px_minmax(0,1fr)_280px] min-[1280px]:gap-6">
      <aside className="hidden min-[820px]:block">
        <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">Field palette</h2>
        <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Drag fields onto the page canvas.</p>
        <div className="mt-3 grid gap-2">
          {(Object.keys(LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS) as LuxorCreatedDocumentFieldType[]).map((type) => (
            <PortalButton key={type} type="button" variant="secondary" className="min-h-10 w-full justify-start" disabled={!canEdit} onClick={() => addField(type)}>
              {LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS[type]}
            </PortalButton>
          ))}
        </div>
      </aside>

      <section className="min-h-0 min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PortalButton type="button" variant="secondary" className="min-h-9" onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>Page −</PortalButton>
            <span className="text-xs font-semibold text-[color:var(--portal-muted)]">Page {pageIndex + 1}</span>
            <PortalButton type="button" variant="secondary" className="min-h-9" onClick={() => setPageIndex((value) => value + 1)}>Page +</PortalButton>
          </div>
          <div className="flex gap-2">
            <PortalButton type="button" variant="secondary" className="min-h-10" disabled={!canEdit || saving} onClick={() => void save()}>Save fields</PortalButton>
          </div>
        </div>
        <div
          ref={canvasRef}
          className="relative mx-auto aspect-[8.5/11] w-full max-w-[620px] overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-white shadow-sm"
          onPointerMove={onCanvasPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onClick={() => setSelectedId(null)}
        >
          {pageFields.map((field) => {
            const tone = toneForRoleKey(field.role_key, roleOrder)
            const selectedRing = selectedId === field.clientId ? 'ring-2 ring-[#caa24c]' : ''
            return (
              <button
                key={field.clientId}
                type="button"
                style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%` }}
                className={`absolute border text-left text-[10px] font-semibold text-[color:var(--portal-text)] ${signerRoleTintClass(tone)} ${selectedRing} ${canEdit ? 'cursor-move' : 'pointer-events-none'}`}
                onClick={(event) => { event.stopPropagation(); setSelectedId(field.clientId) }}
                onPointerDown={(event) => beginDrag(event, field, 'move')}
              >
                <span className="block truncate px-1 py-0.5">{field.label || LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS[field.field_type]}</span>
                {canEdit ? (
                  <span
                    className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-[#caa24c]/70"
                    onPointerDown={(event) => beginDrag(event, field, 'resize')}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="mt-4 min-[820px]:hidden">
          <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Fields on page {pageIndex + 1}</h3>
          <ul className="mt-2 space-y-2">
            {pageFields.map((field) => (
              <li key={field.clientId} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
                <p className="text-xs font-semibold">{field.label}</p>
                <label className="mt-2 block text-[11px] text-[color:var(--portal-muted)]">Role label</label>
                <input
                  className="mt-1 w-full min-h-10 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 text-sm"
                  value={signers.find((signer) => signer.role_key === field.role_key)?.role_label || field.role_key}
                  disabled={!canEdit}
                  onChange={(event) => {
                    const label = event.target.value
                    setSigners((current) => current.map((signer) => (signer.role_key === field.role_key ? { ...signer, role_label: label } : signer)))
                  }}
                />
                <PortalCheckbox
                  className="mt-2"
                  checked={field.required}
                  disabled={!canEdit}
                  onChange={(checked) => setFields((current) => current.map((row) => (row.clientId === field.clientId ? { ...row, required: checked } : row)))}
                  label="Required"
                />
              </li>
            ))}
          </ul>
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
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Create a test signing link (no email). Draft documents only.</p>
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
          {testBusy ? <p className="mt-2 text-xs text-[color:var(--portal-muted)]">Creating link…</p> : null}
          {testLink ? (
            <p className="mt-2 break-all text-xs font-medium text-[color:var(--portal-text)]">{testLink}</p>
          ) : null}
        </div>
      </aside>

      {error ? <p role="alert" className="col-span-full text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
    </div>
  )
}