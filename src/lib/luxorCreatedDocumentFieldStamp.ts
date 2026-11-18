import type { PDFPage, PDFFont, PDFDocument } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import type { LuxorCreatedDocumentFieldRow, LuxorCreatedDocumentFieldType } from './luxorCreatedDocumentFieldTypes'

export type LuxorFieldStampValue = {
  fieldId: string
  fieldType: LuxorCreatedDocumentFieldType
  value: string | boolean
  signaturePng?: Uint8Array
}

export function luxorPdfRectFromNormalized(page: PDFPage, rect: Pick<LuxorCreatedDocumentFieldRow, 'x' | 'y' | 'w' | 'h'>) {
  const { width, height } = page.getSize()
  const boxW = rect.w * width
  const boxH = rect.h * height
  const x = rect.x * width
  // PDF origin is bottom-left; stored y is top-origin normalized.
  const y = height - (rect.y * height) - boxH
  return { x, y, width: boxW, height: boxH, pageWidth: width, pageHeight: height }
}

export async function stampLuxorFieldsOnPdf(input: {
  pdf: PDFDocument
  fields: LuxorCreatedDocumentFieldRow[]
  stamps: LuxorFieldStampValue[]
  fonts: { regular: PDFFont; oblique: PDFFont }
}) {
  const byId = new Map(input.stamps.map((stamp) => [stamp.fieldId, stamp]))
  for (const field of input.fields) {
    const stamp = byId.get(field.id)
    if (!stamp) continue
    const pages = input.pdf.getPages()
    const page = pages[field.page_index]
    if (!page) continue
    const rect = luxorPdfRectFromNormalized(page, field)
    const ink = rgb(0.11, 0.09, 0.08)
    const type = field.field_type

    if ((type === 'signature' || type === 'initials') && stamp.signaturePng) {
      const image = await input.pdf.embedPng(stamp.signaturePng)
      const scale = Math.min(rect.width / image.width, rect.height / image.height)
      const drawW = image.width * scale
      const drawH = image.height * scale
      page.drawImage(image, {
        x: rect.x + (rect.width - drawW) / 2,
        y: rect.y + (rect.height - drawH) / 2,
        width: drawW,
        height: drawH,
      })
      continue
    }

    if (type === 'checkbox') {
      if (stamp.value === true) {
        const size = Math.min(rect.width, rect.height) * 0.7
        const cx = rect.x + rect.width / 2
        const cy = rect.y + rect.height / 2
        page.drawLine({ start: { x: cx - size * 0.35, y: cy }, end: { x: cx - size * 0.05, y: cy - size * 0.35 }, thickness: 1.3, color: ink })
        page.drawLine({ start: { x: cx - size * 0.05, y: cy - size * 0.35 }, end: { x: cx + size * 0.42, y: cy + size * 0.38 }, thickness: 1.3, color: ink })
      }
      continue
    }

    const text = typeof stamp.value === 'string' ? stamp.value.trim() : ''
    if (!text) continue
    const font = type === 'signature' || type === 'initials' ? input.fonts.oblique : input.fonts.regular
    const size = Math.min(14, Math.max(9, rect.height * 0.55))
    page.drawText(text, {
      x: rect.x + 4,
      y: rect.y + Math.max(2, (rect.height - size) / 2),
      size,
      font,
      color: ink,
      maxWidth: rect.width - 8,
    })
  }
}

export function decodeLuxorSignaturePng(dataUrl: string): Uint8Array | null {
  if (!/^data:image\/png;base64,/i.test(dataUrl)) return null
  const base64 = dataUrl.split(',')[1]
  if (!base64) return null
  try {
    return Uint8Array.from(Buffer.from(base64, 'base64'))
  } catch {
    return null
  }
}