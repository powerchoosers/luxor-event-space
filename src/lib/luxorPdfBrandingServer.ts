import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from 'pdf-lib'
import { LUXOR_VENUE_ADDRESS } from './luxorVenue'

export const luxorPdfGold = rgb(0.67, 0.47, 0.20)
export const luxorPdfPaleGold = rgb(0.92, 0.85, 0.72)
export const luxorPdfInk = rgb(0.13, 0.11, 0.09)
export const luxorPdfMuted = rgb(0.42, 0.38, 0.32)
export const luxorPdfCream = rgb(0.985, 0.972, 0.945)
export const luxorPdfSoft = rgb(0.955, 0.93, 0.885)
export const luxorPdfMargin = 52
export const luxorPdfPageWidth = 612
export const luxorPdfPageHeight = 792
export const luxorPdfContentWidth = 508

export function wrapLuxorPdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function loadLuxorPdfLogo(pdf: PDFDocument): Promise<PDFImage | null> {
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), 'public', 'luxor-portal-mark-gold-tight.png'))
    return await pdf.embedPng(bytes)
  } catch {
    return null
  }
}

export function drawLuxorPdfHeader(target: PDFPage, documentLabel: string, logo: PDFImage | null, bold: PDFFont) {
  target.drawRectangle({ x: 0, y: 734, width: luxorPdfPageWidth, height: 58, color: luxorPdfInk })
  if (logo) target.drawImage(logo, { x: luxorPdfMargin, y: 746, width: 34, height: 34 })
  target.drawText('LUXOR', { x: logo ? 96 : luxorPdfMargin, y: 760, size: 15, font: bold, color: luxorPdfPaleGold })
  target.drawText('AT LAS PALMAS EVENTS', { x: logo ? 96 : luxorPdfMargin, y: 749, size: 6.5, font: bold, color: luxorPdfCream })
  const labelWidth = bold.widthOfTextAtSize(documentLabel, 7)
  target.drawText(documentLabel, { x: luxorPdfPageWidth - luxorPdfMargin - labelWidth, y: 755, size: 7, font: bold, color: luxorPdfPaleGold })
}

export function drawLuxorPdfStandardFooters(pages: PDFPage[], regular: PDFFont, rightFooterText?: string) {
  pages.forEach((target, index) => {
    target.drawLine({ start: { x: luxorPdfMargin, y: 43 }, end: { x: luxorPdfPageWidth - luxorPdfMargin, y: 43 }, thickness: 0.45, color: luxorPdfPaleGold })
    target.drawText(rightFooterText ?? `Luxor Event Space  |  ${LUXOR_VENUE_ADDRESS}`, {
      x: luxorPdfMargin,
      y: 25,
      size: 7.2,
      font: regular,
      color: luxorPdfMuted,
    })
    const pageText = `${index + 1} / ${pages.length}`
    target.drawText(pageText, {
      x: luxorPdfPageWidth - luxorPdfMargin - regular.widthOfTextAtSize(pageText, 7.2),
      y: 25,
      size: 7.2,
      font: regular,
      color: luxorPdfMuted,
    })
  })
}

export async function createLuxorPdfFontKit() {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const logo = await loadLuxorPdfLogo(pdf)
  return { pdf, regular, bold, serif, serifBold, logo }
}