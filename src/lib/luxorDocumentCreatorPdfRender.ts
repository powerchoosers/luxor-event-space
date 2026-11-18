import 'server-only'

import type { PDFPage, PDFFont } from 'pdf-lib'
import { luxorPdfInk, luxorPdfMargin, luxorPdfMuted, luxorPdfPaleGold } from './luxorPdfBrandingServer'
import { LUXOR_VENUE_ADDRESS } from './luxorVenue'
import { wrapLuxorPdfLogicalLine } from './luxorCreatedDocumentPdfLayout'
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
  page: PDFPage,
  fonts: LuxorCreatedDocumentPdfFonts,
  line: LayoutLine,
  x: number,
  y: number,
  size: number,
  color = luxorPdfInk,
) {
  let cursor = x
  for (let index = 0; index < line.length; index += 1) {
    const word = line[index]
    if (word.word === ' ') {
      const font = selectCreatedDocumentBodyFont(fonts, word)
      cursor += font.widthOfTextAtSize(' ', size)
      continue
    }
    const font = selectCreatedDocumentBodyFont(fonts, word)
    const prefix = index > 0 && line[index - 1].word !== ' ' ? ' ' : ''
    const text = `${prefix}${word.word}`
    page.drawText(text, { x: cursor, y, size, font, color })
    const width = font.widthOfTextAtSize(text, size)
    if (word.underline) {
      page.drawLine({
        start: { x: cursor, y: y - 1.2 },
        end: { x: cursor + width, y: y - 1.2 },
        thickness: 0.45,
        color,
      })
    }
    cursor += width
  }
}

export function drawRichInlines(
  page: PDFPage,
  fonts: LuxorCreatedDocumentPdfFonts,
  inlines: LuxorDocumentCreatorInline[],
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  color = luxorPdfInk,
): number {
  const rows = splitInlinesToRows(inlines)
  let cursorY = y
  for (const row of rows) {
    const words = wordsFromInlines(row)
    if (!words.length) {
      cursorY -= lineHeight
      continue
    }
    const lines = layoutWords(words, fonts, size, maxWidth)
    for (const line of lines) {
      drawLine(page, fonts, line, x, cursorY, size, color)
      cursorY -= lineHeight
    }
  }
  return cursorY
}

export function drawListBlock(
  page: PDFPage,
  fonts: LuxorCreatedDocumentPdfFonts,
  items: LuxorDocumentCreatorInline[][],
  ordered: boolean,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  lineHeight: number,
  markerColor = luxorPdfMuted,
): number {
  let cursorY = y
  let ordinal = 0
  for (const item of items) {
    ordinal += 1
    const marker = ordered ? `${ordinal}.` : '•'
    const markerFont = fonts.bold
    const markerWidth = markerFont.widthOfTextAtSize(`${marker} `, size)
    const textX = x + hangingIndent
    const textWidth = maxWidth - hangingIndent

    const rows = splitInlinesToRows(item)
    let firstLine = true
    for (const row of rows) {
      const words = wordsFromInlines(row)
      const lines = words.length ? layoutWords(words, fonts, size, textWidth) : [[]]
      for (const line of lines) {
        if (firstLine) {
          page.drawText(`${marker}`, { x, y: cursorY, size, font: markerFont, color: markerColor })
          if (line.length) drawLine(page, fonts, line, textX, cursorY, size)
          firstLine = false
        } else {
          drawLine(page, fonts, line, textX, cursorY, size)
        }
        cursorY -= lineHeight
      }
      if (!words.length) {
        if (firstLine) {
          page.drawText(`${marker}`, { x, y: cursorY, size, font: markerFont, color: markerColor })
          firstLine = false
        }
        cursorY -= lineHeight
      }
    }
    cursorY -= 4
  }
  return cursorY
}

export function drawLuxorCreatedDocumentFooters(pages: PDFPage[], regular: PDFFont) {
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