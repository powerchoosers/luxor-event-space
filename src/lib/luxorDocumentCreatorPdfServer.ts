import 'server-only'

import { type PDFPage } from 'pdf-lib'
import {
  drawLuxorPdfHeader,
  luxorPdfCream,
  luxorPdfGold,
  luxorPdfInk,
  luxorPdfMargin,
} from './luxorPdfBrandingServer'
import { createLuxorCreatedDocumentPdfKit } from './luxorCreatedDocumentPdfFontsServer'
import {
  drawListBlock,
  drawLuxorCreatedDocumentFooters,
  drawRichInlines,
  wrapTitleLines,
} from './luxorDocumentCreatorPdfRender'
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
  const { pdf, bold, serifBold, logo, pageWidth, pageHeight, fonts, regular } = await createLuxorCreatedDocumentPdfKit()
  const blocks = extractRenderableBlocks(input.bodyJson)
  const documentLabel = (LUXOR_CREATED_DOCUMENT_TYPE_LABELS[input.documentType] || 'DOCUMENT').toUpperCase()
  let page: PDFPage
  let y = 0
  const contentWidth = pageWidth - luxorPdfMargin * 2

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight])
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: luxorPdfCream })
    drawLuxorPdfHeader(page, documentLabel, logo, bold)
    y = 690
    return page
  }
  addPage()

  const ensure = (height = 40) => {
    if (y < 66 + height) addPage()
  }

  const titleLines = wrapTitleLines(input.title, serifBold, 22, contentWidth)
  for (const line of titleLines) {
    ensure(28)
    page!.drawText(line, { x: luxorPdfMargin, y, size: 22, font: serifBold, color: luxorPdfInk })
    y -= 28
  }
  page!.drawLine({ start: { x: luxorPdfMargin, y }, end: { x: pageWidth - luxorPdfMargin, y }, thickness: 1, color: luxorPdfGold })
  y -= 24

  for (const block of blocks) {
    if (block.type === 'heading') {
      ensure(36)
      const size = block.level === 1 ? 14 : block.level === 2 ? 12 : 10.5
      const color = block.level === 1 ? luxorPdfInk : luxorPdfGold
      const before = y
      y = drawRichInlines(page!, fonts, block.inlines, luxorPdfMargin, y, contentWidth, size, size + 6, color)
      if (y === before) y -= size + 6
      y -= 6
      continue
    }
    if (block.type === 'bullet' || block.type === 'ordered') {
      ensure(block.items.length * 16 + 8)
      y = drawListBlock(page!, fonts, block.items, block.type === 'ordered', luxorPdfMargin, y, contentWidth, 9.6, 13)
      continue
    }
    const before = y
    y = drawRichInlines(page!, fonts, block.inlines, luxorPdfMargin, y, contentWidth, 9.7, 14)
    if (y === before) y -= 14
    y -= 7
  }

  drawLuxorCreatedDocumentFooters(pdf.getPages(), regular)
  return pdf.save({ useObjectStreams: false })
}