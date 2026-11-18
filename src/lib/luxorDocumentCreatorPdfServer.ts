import 'server-only'

import {
  luxorPdfGold,
  luxorPdfInk,
  luxorPdfMargin,
} from './luxorPdfBrandingServer'
import { createLuxorCreatedDocumentPdfKit } from './luxorCreatedDocumentPdfFontsServer'
import { CreatedDocumentPdfPaginator } from './luxorCreatedDocumentPdfPaginator'
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
  const paginator = new CreatedDocumentPdfPaginator({
    pdf,
    pageWidth,
    pageHeight,
    documentLabel,
    logo,
    headerBold: bold,
  })
  const contentWidth = paginator.contentWidth

  const titleLines = wrapTitleLines(input.title, serifBold, 22, contentWidth)
  for (const line of titleLines) {
    paginator.drawPlainText(line, serifBold, 22, luxorPdfInk, luxorPdfMargin, 28)
  }
  paginator.ensureLine(4)
  paginator.page.drawLine({
    start: { x: luxorPdfMargin, y: paginator.y },
    end: { x: pageWidth - luxorPdfMargin, y: paginator.y },
    thickness: 1,
    color: luxorPdfGold,
  })
  paginator.y -= 24

  for (const block of blocks) {
    if (block.type === 'heading') {
      const size = block.level === 1 ? 14 : block.level === 2 ? 12 : 10.5
      const color = block.level === 1 ? luxorPdfInk : luxorPdfGold
      const beforeY = paginator.y
      drawRichInlines(paginator, fonts, block.inlines, luxorPdfMargin, contentWidth, size, size + 6, color)
      if (paginator.y === beforeY) {
        paginator.ensureLine(size + 6)
        paginator.y -= size + 6
      }
      paginator.y -= 6
      continue
    }
    if (block.type === 'bullet' || block.type === 'ordered') {
      drawListBlock(paginator, fonts, block.items, block.type === 'ordered', luxorPdfMargin, contentWidth, 9.6, 13)
      continue
    }
    const beforeY = paginator.y
    drawRichInlines(paginator, fonts, block.inlines, luxorPdfMargin, contentWidth, 9.7, 14)
    if (paginator.y === beforeY) {
      paginator.ensureLine(14)
      paginator.y -= 14
    }
    paginator.y -= 7
  }

  drawLuxorCreatedDocumentFooters(paginator.pages(), regular)
  return pdf.save({ useObjectStreams: false })
}