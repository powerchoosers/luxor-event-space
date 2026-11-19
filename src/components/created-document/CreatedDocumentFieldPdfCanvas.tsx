'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from '@/lib/icons/phosphor-compat'
import { Document, Page } from 'react-pdf'
import type { LuxorCreatedDocumentFieldType } from '@/lib/luxorCreatedDocumentFieldTypes'
import { LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS } from '@/lib/luxorCreatedDocumentFieldTypes'
import { normalizedFieldOverlayStyle, luxorChicagoDateString } from '@/lib/luxorCreatedDocumentFieldLayout'
import { ensureLuxorPdfJsWorker } from '@/lib/luxorPdfJsWorkerClient'

export type CreatedDocumentPdfField = {
  id: string
  field_type: LuxorCreatedDocumentFieldType | string
  label: string
  required: boolean
  page_index: number
  role_key?: string
  x: number
  y: number
  w: number
  h: number
}

type LayoutHandlers = {
  selectedId: string | null
  tintClassForField: (field: CreatedDocumentPdfField) => string
  onSelect: (fieldId: string | null) => void
  onMovePointerDown: (event: React.PointerEvent, field: CreatedDocumentPdfField) => void
  onResizePointerDown: (event: React.PointerEvent, field: CreatedDocumentPdfField) => void
  onCanvasBackgroundClick?: () => void
  onCanvasPlacePointerUp?: (event: React.PointerEvent) => void
  onCanvasPagePointerUp?: (event: React.PointerEvent, pageIndex: number) => void
}

type SignHandlers = {
  activeFieldId: string | null
  fieldValues: Record<string, unknown>
  onActiveField: (fieldId: string) => void
  onFieldValue: (fieldId: string, value: string | boolean) => void
  onSignatureFieldTap: (field: CreatedDocumentPdfField) => void
  signerName: string
  signerEmail: string
  signatureDataUrl: string | null
  initialsDataUrl?: string | null
  registerFieldRef: (fieldId: string, node: HTMLDivElement | null) => void
  valuesFrozen?: boolean
}

type Props = {
  pdfUrl: string | null
  fields: CreatedDocumentPdfField[]
  pageWidth: number
  mode: 'layout' | 'sign'
  layoutPageIndex?: number
  layout?: LayoutHandlers
  sign?: SignHandlers
  onNumPages?: (count: number) => void
  onError?: () => void
  className?: string
}

export function CreatedDocumentFieldPdfCanvas({
  pdfUrl,
  fields,
  pageWidth,
  mode,
  layoutPageIndex = 0,
  layout,
  sign,
  onNumPages,
  onError,
  className = '',
}: Props) {
  ensureLuxorPdfJsWorker()
  const [numPages, setNumPages] = useState(0)
  const renderPageWidth = pageWidth > 0 ? pageWidth : 520
  const pageRange = useMemo(() => {
    if (mode === 'layout') return [layoutPageIndex]
    return Array.from({ length: numPages }, (_, index) => index)
  }, [layoutPageIndex, mode, numPages])

  const onLoad = useCallback((count: number) => {
    setNumPages(count)
    onNumPages?.(count)
  }, [onNumPages])

  if (!pdfUrl) {
    return (
      <div className={`flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-[#caa24c]/35 bg-white text-sm text-[#6f665b] ${className}`}>
        PDF preview is not ready yet.
      </div>
    )
  }

  return (
    <Document
      key={pdfUrl}
      file={pdfUrl}
      onLoadSuccess={({ numPages: count }) => onLoad(count)}
      onLoadError={() => onError?.()}
      loading={(
        <div className={`flex min-h-[360px] items-center justify-center text-[#b9afa3] ${className}`}>
          <LoaderCircle className="mr-2 animate-spin" size={18} /> Loading PDF…
        </div>
      )}
      className={mode === 'sign' ? 'flex flex-col items-center gap-6' : 'flex justify-center'}
    >
      {pageRange.map((pageIndex) => (
        <CreatedDocumentPdfPage
          key={pageIndex}
          pageIndex={pageIndex}
          pageNumber={pageIndex + 1}
          pageWidth={renderPageWidth}
          fields={fields.filter((field) => field.page_index === pageIndex)}
          mode={mode}
          layout={layout}
          sign={sign}
        />
      ))}
    </Document>
  )
}

function CreatedDocumentPdfPage({
  pageIndex,
  pageNumber,
  pageWidth,
  fields,
  mode,
  layout,
  sign,
}: {
  pageIndex: number
  pageNumber: number
  pageWidth: number
  fields: CreatedDocumentPdfField[]
  mode: 'layout' | 'sign'
  layout?: LayoutHandlers
  sign?: SignHandlers
}) {
  const pageRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={pageRef}
      className="relative inline-block overflow-hidden bg-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
      data-page-index={pageIndex}
      data-pdf-page-canvas=""
      onClick={mode === 'layout' ? () => layout?.onCanvasBackgroundClick?.() : undefined}
      onPointerUp={mode === 'layout' ? (event) => {
        layout?.onCanvasPagePointerUp?.(event, pageIndex)
        layout?.onCanvasPlacePointerUp?.(event)
      } : undefined}
    >
      <Page
        pageNumber={pageNumber}
        width={pageWidth}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={<div style={{ width: pageWidth, height: pageWidth * 1.294 }} className="bg-[#f7f0e4]" />}
      />
      {fields.map((field) => {
        if (mode === 'layout' && layout) {
          const selected = layout.selectedId === field.id
          const tint = layout.tintClassForField(field)
          return (
            <button
              key={field.id}
              type="button"
              style={normalizedFieldOverlayStyle(field)}
              data-layout-field-overlay=""
              className={`absolute border text-left text-[10px] font-semibold text-[#1a1816] ${tint} ${selected ? 'ring-2 ring-[#caa24c]' : ''} ${'cursor-move'}`}
              onClick={(event) => { event.stopPropagation(); layout.onSelect(field.id) }}
              onPointerDown={(event) => layout.onMovePointerDown(event, field)}
            >
              <span className="block truncate px-1 py-0.5">{field.label || LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS[field.field_type as LuxorCreatedDocumentFieldType] || field.field_type}</span>
              <span
                className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-[#caa24c]/70"
                onPointerDown={(event) => layout.onResizePointerDown(event, field)}
              />
            </button>
          )
        }
        if (mode === 'sign' && sign) {
          return (
            <SignFieldOverlay
              key={field.id}
              field={field}
              active={sign.activeFieldId === field.id}
              value={sign.fieldValues[field.id]}
              signerName={sign.signerName}
              signerEmail={sign.signerEmail}
              signatureDataUrl={sign.signatureDataUrl}
              initialsDataUrl={sign.initialsDataUrl}
              valuesFrozen={sign.valuesFrozen}
              onActive={() => sign.onActiveField(field.id)}
              onValue={(value) => sign.onFieldValue(field.id, value)}
              onSignatureTap={() => sign.onSignatureFieldTap(field)}
              registerRef={(node) => sign.registerFieldRef(field.id, node)}
            />
          )
        }
        return null
      })}
    </div>
  )
}

function useFitOverlayFontSize(containerRef: React.RefObject<HTMLElement | null>, text: string, maxPx = 11, minPx = 6) {
  const [fit, setFit] = useState({ fontSize: maxPx, overflows: false })
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const measure = () => {
      if (!containerRef.current) return
      if (!text) {
        setFit({ fontSize: maxPx, overflows: false })
        return
      }
      let size = maxPx
      const probe = document.createElement('span')
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      probe.style.whiteSpace = 'nowrap'
      probe.style.pointerEvents = 'none'
      probe.textContent = text
      probe.style.fontSize = `${size}px`
      node.appendChild(probe)
      const limit = Math.max(8, node.clientWidth - 6)
      while (size > minPx && probe.offsetWidth > limit) {
        size -= 0.5
        probe.style.fontSize = `${size}px`
      }
      probe.style.fontSize = `${size}px`
      const overflows = probe.offsetWidth > limit
      node.removeChild(probe)
      setFit({ fontSize: Math.max(minPx, size), overflows })
    }
    const frame = requestAnimationFrame(measure)
    const observer = new ResizeObserver(() => requestAnimationFrame(measure))
    observer.observe(node)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [containerRef, maxPx, minPx, text])
  return fit
}

function SignFieldOverlay({
  field,
  active,
  value,
  signerName,
  signerEmail,
  signatureDataUrl,
  initialsDataUrl,
  valuesFrozen,
  onActive,
  onValue,
  onSignatureTap,
  registerRef,
}: {
  field: CreatedDocumentPdfField
  active: boolean
  value: unknown
  signerName: string
  signerEmail: string
  signatureDataUrl: string | null
  initialsDataUrl?: string | null
  valuesFrozen?: boolean
  onActive: () => void
  onValue: (value: string | boolean) => void
  onSignatureTap: () => void
  registerRef: (node: HTMLDivElement | null) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    registerRef(ref.current)
    return () => registerRef(null)
  }, [registerRef])

  const base = 'absolute z-10 overflow-hidden rounded-sm border text-[#1a1816] shadow-sm'
  const ring = active ? 'border-[#c89d4b] ring-2 ring-[#c89d4b]/80' : 'border-[#c89d4b]/55'
  const stringValue = typeof value === 'string' ? value : ''
  const dateFallback = luxorChicagoDateString()
  const textForFit = field.field_type === 'date'
    ? (stringValue || dateFallback)
    : field.field_type === 'name'
      ? (stringValue || signerName)
      : field.field_type === 'email'
        ? (stringValue || signerEmail)
        : stringValue
  const fit = useFitOverlayFontSize(ref, textForFit)
  const frozenShell = valuesFrozen ? 'bg-white' : 'bg-white/92'

  if (field.field_type === 'signature' || field.field_type === 'initials') {
    const image = field.field_type === 'initials' ? (initialsDataUrl || null) : signatureDataUrl
    const initialsText = field.field_type === 'initials' && stringValue.trim() ? stringValue.trim() : ''
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        style={normalizedFieldOverlayStyle(field)}
        className={`${base} ${ring} ${frozenShell} flex cursor-pointer items-center justify-center`}
        onClick={(event) => { event.stopPropagation(); onActive(); if (!valuesFrozen) onSignatureTap() }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActive(); if (!valuesFrozen) onSignatureTap() } }}
      >
        {image ? (
          <img src={image} alt="" className="h-full w-full object-contain p-0.5" />
        ) : initialsText ? (
          <span className="px-1 text-center font-semibold leading-none text-[#1a1816]" style={{ fontSize: `${fit.fontSize}px` }}>{initialsText}</span>
        ) : (
          <span className="px-1 text-center text-[9px] font-semibold uppercase tracking-wide text-[#8b642e]">
            {field.field_type === 'initials' ? 'Initials' : 'Sign'}
          </span>
        )}
      </div>
    )
  }

  if (field.field_type === 'checkbox') {
    return (
      <div
        ref={ref}
        style={normalizedFieldOverlayStyle(field)}
        className={`${base} ${ring} ${frozenShell} flex items-center justify-center`}
      >
        <label className="flex h-full w-full cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#c89d4b]"
            checked={value === true}
            onChange={(event) => { onActive(); onValue(event.target.checked) }}
          />
        </label>
      </div>
    )
  }

  if (valuesFrozen) {
    const frozenText = field.field_type === 'date' ? (stringValue || dateFallback) : (stringValue || textForFit)
    return (
      <div ref={ref} style={normalizedFieldOverlayStyle(field)} className={`${base} ${ring} ${frozenShell} flex items-center overflow-hidden px-1`}>
        <span
          className={`block w-full whitespace-nowrap leading-none text-[#1a1816] ${fit.overflows ? 'overflow-hidden text-ellipsis' : ''}`}
          style={{ fontSize: `${fit.fontSize}px` }}
        >
          {frozenText}
        </span>
      </div>
    )
  }

  if (field.field_type === 'date') {
    return (
      <div
        ref={ref}
        style={normalizedFieldOverlayStyle(field)}
        className={`${base} ${ring} bg-white/92`}
        onClick={(event) => { event.stopPropagation(); onActive() }}
      >
        <input
          className="h-full min-w-0 w-full bg-transparent px-1 outline-none"
          style={{ fontSize: `${fit.fontSize}px` }}
          value={stringValue}
          placeholder={dateFallback}
          onChange={(event) => onValue(event.target.value)}
          onFocus={() => {
            onActive()
            if (!stringValue) onValue(dateFallback)
          }}
          aria-label={field.label}
        />
      </div>
    )
  }

  const placeholder = field.field_type === 'name'
    ? (signerName || 'Name')
    : field.field_type === 'email'
      ? (signerEmail || 'Email')
      : ''

  return (
    <div
      ref={ref}
      style={normalizedFieldOverlayStyle(field)}
      className={`${base} ${ring} bg-white/92`}
      onClick={(event) => { event.stopPropagation(); onActive() }}
    >
      <input
        className="h-full min-w-0 w-full bg-transparent px-1 outline-none placeholder:text-[#8a8074]"
        style={{ fontSize: `${fit.fontSize}px` }}
        value={stringValue}
        placeholder={placeholder}
        onChange={(event) => onValue(event.target.value)}
        onFocus={() => {
          onActive()
          if (field.field_type === 'name' && !stringValue && signerName.trim()) onValue(signerName.trim())
          if (field.field_type === 'email' && !stringValue && signerEmail.trim()) onValue(signerEmail.trim())
        }}
        aria-label={field.label}
      />
    </div>
  )
}

export function scrollToSignField(node: HTMLDivElement | null) {
  if (!node) return
  node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
}