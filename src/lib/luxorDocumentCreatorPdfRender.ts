import 'server-only'

import type { Color, PDFFont } from 'pdf-lib'
import { luxorPdfInk, luxorPdfMargin, luxorPdfMuted, luxorPdfPaleGold } from './luxorPdfBrandingServer'
import { LUXOR_VENUE_ADDRESS } from './luxorVenue'
import { wrapLuxorPdfLogicalLine } from './luxorCreatedDocumentPdfLayout'
import { CreatedDocumentPdfPaginator } from './luxorCreatedDocumentPdfPaginator'
import { selectCreatedDocumentBodyFont, type LuxorCreatedDocumentPdfFonts } from './luxorCreatedDocumentPdfFontsServer'
import { normalizeControlCharsForRender } from './luxorDocumentCreatorRenderNormalize'
import type { LuxorDocumentCreatorInline } from './luxorDocumentCreatorVerbatim'

type StyledWord = { word: string; bold?: boolean; italic?: boolean; underline?: boolean }

const hangingIndent = 16

function splitInlinesToRows(inlines: LuxorDocumentCreatorInline[]): LuxorDocumentCreatorInline[][] {
  const rows: LuxorDocumentCreatorInline[][] = [[]]
  for (const part of inlines) {
    if (part.kind === 'hardBreak') {
      if (rows[rows.length - 1].length) rows.push([])
      else rows.push([])
    } else {
      rows[rows.length - 1].push(part)
    }
  }
  if (rows.length === 1 && rows[0].length === 0) return [[]]
  return rows
}

function wordsFromInlines(inlines: LuxorDocumentCreatorInline[]): StyledWord[] {
  const words: StyledWord[] = []
  for (const part of inlines) {
    if (part.kind !== 'text') continue
    const text = normalizeControlCharsForRender(part.text)
    if (!text.trim() && text) {
      words.push({ word: ' ', bold: part.bold, italic: part.italic, underline: part.underline })
      continue
    }
    const chunks = text.split(/(\s+)/)
    for (const chunk of chunks) {
      if (!chunk) continue
      if (/^\s+$/.test(chunk)) {
        words.push({ word: ' ', bold: part.bold, italic: part.italic, underline: part.underline })
      } else {
        words.push({ word: chunk, bold: part.bold, italic: part.italic, underline: part.underline })
      }
    }
  }
  return words
}

type LayoutLine = StyledWord[]

function layoutWords(words: StyledWord[], fonts: LuxorCreatedDocumentPdfFonts, size: number, maxWidth: number): LayoutLine[] {
  const lines: LayoutLine[] = []
  let current: LayoutLine = []
  let currentWidth = 0

  const measure = (word: StyledWord) => {
    const font = selectCreatedDocumentBodyFont(fonts, word)
    const spacer = word.word === ' ' ? '' : (current.length ? ' ' : '')
    return font.widthOfTextAtSize(`${spacer}${word.word}`, size)
  }

  for (const word of words) {
    const width = measure(word)
    if (current.length && currentWidth + width > maxWidth) {
      lines.push(current)
      current = []
      currentWidth = 0
    }
    const singleWidth = selectCreatedDocumentBodyFont(fonts, word).widthOfTextAtSize(word.word, size)
    if (!current.length && singleWidth > maxWidth) {
      let chunk = ''
      const font = selectCreatedDocumentBodyFont(fonts, word)
      for (const char of word.word) {
        const next = chunk + char
        if (font.widthOfTextAtSize(next, size) <= maxWidth) chunk = next
        else {
          if (chunk) lines.push([{ ...word, word: chunk }])
          chunk = char
        }
      }
      if (chunk) {
        current = [{ ...word, word: chunk }]
        currentWidth = font.widthOfTextAtSize(chunk, size)
      }
      continue
    }
    current.push(word)
    currentWidth += width
  }
  if (current.length) lines.push(current)
  if (!lines.length) lines.push([])
  return lines
}

function drawLine(
  paginator: CreatedDocumentPdfPaginator,
  fonts: LuxorCreatedDocumentPdfFonts,
  line: LayoutLine,
  x: number,
  size: number,
  lineHeight: number,
  color: Color,
) {
  paginator.ensureLine(lineHeight)
  const page = paginator.page
  const y = paginator.y
  let cursor = x

  type Segment = { startX: number; endX: number; underline?: boolean }

  const segments: Segment[] = []

  for (let index = 0; index < line.length; index += 1) {
    const word = line[index]
    const font = selectCreatedDocumentBodyFont(fonts, word)
  const prefix = index > 0 && line[index - 1].word !== ' ' ? ' ' : ''
    const text = word.word === ' ' ? ' ' : `${prefix}${word.word}`
    page.drawText(text, { x: cursor, y, size, font, color })
    const width = font.widthOfTextAtSize(text, size)

    const seg: Segment = { startX: cursor, endX: cursor + width, underline: word.underline }
    const last = segments[segments.length - 1]
    if (last && Boolean(last.underline) === Boolean(seg.underline)) {
      last.endX = seg.endX
    } else {
      segments.push({ ...seg })
    }
    cursor += width
  }

  for (const segment of segments) {
    if (!segment.underline) continue
    page.drawLine({
      start: { x: segment.startX, y: y - 1.2 },
      end: { x: segment.endX, y: y - 1.2 },
      thickness: 0.45,
      color,
    })
  }

  paginator.y -= lineHeight
}

export function drawRichInlines(
  paginator: CreatedDocumentPdfPaginator,
  fonts: LuxorCreatedDocumentPdfFonts,
  inlines: LuxorDocumentCreatorInline[],
  x: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  color: Color = luxorPdfInk,
) {
  const rows = splitInlinesToRows(inlines)
  for (const row of rows) {
    const words = wordsFromInlines(row)
    if (!words.length) {
      paginator.ensureLine(lineHeight)
      paginator.y -= lineHeight
      continue
    }
    const lines = layoutWords(words, fonts, size, maxWidth)
    for (const line of lines) {
      drawLine(paginator, fonts, line, x, size, lineHeight, color)
    }
  }
}

export function drawListBlock(
  paginator: CreatedDocumentPdfPaginator,
  fonts: LuxorCreatedDocumentPdfFonts,
  items: LuxorDocumentCreatorInline[][],
  ordered: boolean,
  x: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  markerColor = luxorPdfMuted,
) {
  let ordinal = 0
  for (const item of items) {
    ordinal += 1
    const marker = ordered ? `${ordinal}.` : '•'
    const markerFont = fonts.bold
    const textX = x + hangingIndent
    const textWidth = maxWidth - hangingIndent

    const rows = splitInlinesToRows(item)
    let firstLine = true
    for (const row of rows) {
      const words = wordsFromInlines(row)
      const lines = words.length ? layoutWords(words, fonts, size, textWidth) : [[]]
      for (const line of lines) {
        paginator.ensureLine(lineHeight)
        if (firstLine) {
          paginator.page.drawText(marker, { x, y: paginator.y, size, font: markerFont, color: markerColor })
          if (line.length) drawLine(paginator, fonts, line, textX, size, lineHeight, luxorPdfInk)
          else paginator.y -= lineHeight
          firstLine = false
        } else if (line.length) {
          drawLine(paginator, fonts, line, textX, size, lineHeight, luxorPdfInk)
        } else {
          paginator.y -= lineHeight
        }
      }
      if (!words.length && firstLine) {
        paginator.ensureLine(lineHeight)
        paginator.page.drawText(marker, { x, y: paginator.y, size, font: markerFont, color: markerColor })
        paginator.y -= lineHeight
        firstLine = false
      }
    }
    paginator.y -= 4
  }
}

export function drawLuxorCreatedDocumentFooters(pages: ReturnType<CreatedDocumentPdfPaginator['pages']>, regular: PDFFont) {
  const total = pages.length
  pages.forEach((target, index) => {
    target.drawLine({ start: { x: luxorPdfMargin, y: 43 }, end: { x: target.getWidth() - luxorPdfMargin, y: 43 }, thickness: 0.45, color: luxorPdfPaleGold })
    target.drawText(`Luxor Event Space  |  ${LUXOR_VENUE_ADDRESS}`, {
      x: luxorPdfMargin,
      y: 25,
      size: 7.2,
      font: regular,
      color: luxorPdfMuted,
    })
    const pageText = `Page ${index + 1} of ${total}`
    const width = regular.widthOfTextAtSize(pageText, 7.2)
    target.drawText(pageText, {
      x: target.getWidth() - luxorPdfMargin - width,
      y: 25,
      size: 7.2,
      font: regular,
      color: luxorPdfMuted,
    })
  })
}

export function wrapTitleLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const normalized = normalizeControlCharsForRender(text)
  return normalized.split('\n').flatMap((row) => wrapLuxorPdfLogicalLine(row, font, size, maxWidth))
}