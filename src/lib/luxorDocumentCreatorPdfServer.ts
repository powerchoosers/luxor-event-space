import 'server-only'

import fontkit from '@pdf-lib/fontkit'
import { type PDFPage } from 'pdf-lib'
import {
  createLuxorPdfFontKit,
  drawLuxorPdfHeader,
  drawLuxorPdfStandardFooters,
  luxorPdfCream,
  luxorPdfGold,
  luxorPdfInk,
  luxorPdfMargin,
  luxorPdfMuted,
  luxorPdfPageHeight,
  luxorPdfPageWidth,
  wrapLuxorPdfText,
} from './luxorPdfBrandingServer'
import { blocksFromTipTapJson, type LuxorDocumentCreatorBlock } from './luxorDocumentCreatorVerbatim'
import { LUXOR_CREATED_DOCUMENT_TYPE_LABELS, type LuxorCreatedDocumentType } from './luxorDocumentCreatorTypes'

type RenderInput = {
  title: string
  documentType: LuxorCreatedDocumentType
  bodyJson: unknown
}

export function extractRenderableBlocks(bodyJson: unknown): LuxorDocumentCreatorBlock[] {
  return blocksFromTipTapJson(bodyJson)
}

export async function buildLuxorCreatedDocumentPdf(input: RenderInput): Promise<Uint8Array> {
  const { pdf, regular, bold, serif, serifBold, logo } = await createLuxorPdfFontKit()
  pdf.registerFontkit(fontkit)
  const blocks = extractRenderableBlocks(input.bodyJson)
  const documentLabel = (LUXOR_CREATED_DOCUMENT_TYPE_LABELS[input.documentType] || 'DOCUMENT').toUpperCase()
  let page: PDFPage
  let y = 0

  const addPage = () => {
    page = pdf.addPage([luxorPdfPageWidth, luxorPdfPageHeight])
    page.drawRectangle({ x: 0, y: 0, width: luxorPdfPageWidth, height: luxorPdfPageHeight, color: luxorPdfCream })
    drawLuxorPdfHeader(page, documentLabel, logo, bold)
    y = 690
    return page
  }
  addPage()

  const ensure = (height = 40) => {
    if (y < 66 + height) addPage()
  }

  page!.drawText(input.title, { x: luxorPdfMargin, y, size: 22, font: serifBold, color: luxorPdfInk, maxWidth: luxorPdfPageWidth - luxorPdfMargin * 2 })
  y -= 28
  page!.drawLine({ start: { x: luxorPdfMargin, y }, end: { x: luxorPdfPageWidth - luxorPdfMargin, y }, thickness: 1, color: luxorPdfGold })
  y -= 24

  for (const block of blocks) {
    if (block.type === 'heading') {
      ensure(36)
      const size = block.level === 1 ? 14 : block.level === 2 ? 12 : 10.5
      const font = block.level === 1 ? serifBold : bold
      const color = block.level === 1 ? luxorPdfInk : luxorPdfGold
      const lines = wrapLuxorPdfText(block.text, font, size, luxorPdfPageWidth - luxorPdfMargin * 2)
      for (const line of lines) {
        ensure(18)
        page!.drawText(line, { x: luxorPdfMargin, y, size, font, color })
        y -= size + 6
      }
      y -= 6
      continue
    }
    if (block.type === 'bullet' || block.type === 'ordered') {
      let index = 0
      for (const item of block.items) {
        index += 1
        const prefix = block.type === 'ordered' ? `${index}. ` : '• '
        const lines = wrapLuxorPdfText(item, regular, 9.6, luxorPdfPageWidth - luxorPdfMargin * 2 - 14)
        ensure(lines.length * 13 + 4)
        let first = true
        for (const line of lines) {
          if (first) {
            page!.drawText(prefix, { x: luxorPdfMargin, y, size: 9.6, font: bold, color: luxorPdfMuted })
            page!.drawText(line, { x: luxorPdfMargin + 14, y, size: 9.6, font: regular, color: luxorPdfInk })
            first = false
          } else {
            page!.drawText(line, { x: luxorPdfMargin + 14, y, size: 9.6, font: regular, color: luxorPdfInk })
          }
          y -= 13
        }
        y -= 4
      }
      continue
    }
    const font = block.bold ? bold : regular
    const size = 9.7
    const lines = wrapLuxorPdfText(block.text, font, size, luxorPdfPageWidth - luxorPdfMargin * 2)
    ensure(lines.length * 14 + 6)
    for (const line of lines) {
      page!.drawText(line, { x: luxorPdfMargin, y, size, font, color: luxorPdfInk })
      y -= 14
    }
    y -= 7
  }

  drawLuxorPdfStandardFooters(pdf.getPages(), regular)
  return pdf.save({ useObjectStreams: false })
}