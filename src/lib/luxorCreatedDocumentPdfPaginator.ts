import 'server-only'

import type { Color, PDFDocument, PDFImage, PDFPage, PDFFont } from 'pdf-lib'
import { drawLuxorPdfHeader, luxorPdfCream, luxorPdfMargin } from './luxorPdfBrandingServer'

/** Minimum text baseline y; keep body above the footer band (footer draws at ~25–43). */
export const LUXOR_CREATED_DOCUMENT_PDF_MIN_Y = 68
export const LUXOR_CREATED_DOCUMENT_PDF_START_Y = 690

export class CreatedDocumentPdfPaginator {
  readonly pdf: PDFDocument
  readonly pageWidth: number
  readonly pageHeight: number
  readonly contentWidth: number
  private readonly documentLabel: string
  private readonly logo: PDFImage | null
  private readonly headerBold: PDFFont
  page: PDFPage
  y: number

  constructor(input: {
    pdf: PDFDocument
    pageWidth: number
    pageHeight: number
    documentLabel: string
    logo: PDFImage | null
    headerBold: PDFFont
  }) {
    this.pdf = input.pdf
    this.pageWidth = input.pageWidth
    this.pageHeight = input.pageHeight
    this.contentWidth = input.pageWidth - luxorPdfMargin * 2
    this.documentLabel = input.documentLabel
    this.logo = input.logo
    this.headerBold = input.headerBold
    this.page = this.pdf.addPage([input.pageWidth, input.pageHeight])
    this.paintPageShell()
    this.y = LUXOR_CREATED_DOCUMENT_PDF_START_Y
  }

  private paintPageShell() {
    this.page.drawRectangle({ x: 0, y: 0, width: this.pageWidth, height: this.pageHeight, color: luxorPdfCream })
    drawLuxorPdfHeader(this.page, this.documentLabel, this.logo, this.headerBold)
  }

  addPage() {
    this.page = this.pdf.addPage([this.pageWidth, this.pageHeight])
    this.paintPageShell()
    this.y = LUXOR_CREATED_DOCUMENT_PDF_START_Y
  }

  ensureLine(lineHeight: number) {
    if (this.y < LUXOR_CREATED_DOCUMENT_PDF_MIN_Y + lineHeight) {
      this.addPage()
    }
  }

  drawPlainText(line: string, font: PDFFont, size: number, color: Color, x = luxorPdfMargin, lineHeight = size + 6) {
    this.ensureLine(lineHeight)
    this.page.drawText(line, { x, y: this.y, size, font, color })
    this.y -= lineHeight
  }

  pages() {
    return this.pdf.getPages()
  }
}