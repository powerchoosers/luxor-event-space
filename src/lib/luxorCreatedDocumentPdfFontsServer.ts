import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, type PDFImage } from 'pdf-lib'
import {
  loadLuxorPdfLogo,
  luxorPdfPageHeight,
  luxorPdfPageWidth,
} from './luxorPdfBrandingServer'

type CachedFontBytes = {
  regular: Uint8Array
  bold: Uint8Array
  oblique: Uint8Array
  boldOblique: Uint8Array
  serifBold: Uint8Array
}

let cachedBytes: CachedFontBytes | null = null

async function loadFontBytes(): Promise<CachedFontBytes> {
  if (cachedBytes) return cachedBytes
  const base = path.join(process.cwd(), 'public', 'fonts')
  const [regular, bold, oblique, boldOblique, serifBold] = await Promise.all([
    fs.readFile(path.join(base, 'DejaVuSans.ttf')),
    fs.readFile(path.join(base, 'DejaVuSans-Bold.ttf')),
    fs.readFile(path.join(base, 'DejaVuSans-Oblique.ttf')),
    fs.readFile(path.join(base, 'DejaVuSans-BoldOblique.ttf')),
    fs.readFile(path.join(base, 'DejaVuSerif-Bold.ttf')),
  ])
  cachedBytes = { regular, bold, oblique, boldOblique, serifBold }
  return cachedBytes
}

export type LuxorCreatedDocumentPdfFonts = {
  regular: PDFFont
  bold: PDFFont
  oblique: PDFFont
  boldOblique: PDFFont
  serifBold: PDFFont
}

export function selectCreatedDocumentBodyFont(fonts: LuxorCreatedDocumentPdfFonts, style: { bold?: boolean; italic?: boolean }): PDFFont {
  if (style.bold && style.italic) return fonts.boldOblique
  if (style.bold) return fonts.bold
  if (style.italic) return fonts.oblique
  return fonts.regular
}

export async function embedLuxorCreatedDocumentFonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit)
  const bytes = await loadFontBytes()
  const regular = await pdf.embedFont(bytes.regular, { subset: true })
  const oblique = await pdf.embedFont(bytes.oblique, { subset: true })
  const bold = await pdf.embedFont(bytes.bold, { subset: true })
  return { regular, oblique, bold }
}

export async function createLuxorCreatedDocumentPdfKit() {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const bytes = await loadFontBytes()
  const regular = await pdf.embedFont(bytes.regular, { subset: true })
  const bold = await pdf.embedFont(bytes.bold, { subset: true })
  const oblique = await pdf.embedFont(bytes.oblique, { subset: true })
  const boldOblique = await pdf.embedFont(bytes.boldOblique, { subset: true })
  const serifBold = await pdf.embedFont(bytes.serifBold, { subset: true })
  const logo = await loadLuxorPdfLogo(pdf)
  return {
    pdf,
    regular,
    bold,
    oblique,
    boldOblique,
    serif: regular,
    serifBold,
    logo,
    pageWidth: luxorPdfPageWidth,
    pageHeight: luxorPdfPageHeight,
    fonts: { regular, bold, oblique, boldOblique, serifBold },
  }
}

export type LuxorCreatedDocumentPdfKit = Awaited<ReturnType<typeof createLuxorCreatedDocumentPdfKit>>
export type { PDFFont, PDFImage }