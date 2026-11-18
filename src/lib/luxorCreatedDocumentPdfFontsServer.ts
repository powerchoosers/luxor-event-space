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
  serifBold: Uint8Array
}

let cachedBytes: CachedFontBytes | null = null

async function loadFontBytes(): Promise<CachedFontBytes> {
  if (cachedBytes) return cachedBytes
  const base = path.join(process.cwd(), 'public', 'fonts')
  const [regular, bold, serifBold] = await Promise.all([
    fs.readFile(path.join(base, 'DejaVuSans.ttf')),
    fs.readFile(path.join(base, 'DejaVuSans-Bold.ttf')),
    fs.readFile(path.join(base, 'DejaVuSerif-Bold.ttf')),
  ])
  cachedBytes = { regular, bold, serifBold }
  return cachedBytes
}

export async function createLuxorCreatedDocumentPdfKit() {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const bytes = await loadFontBytes()
  const regular = await pdf.embedFont(bytes.regular, { subset: true })
  const bold = await pdf.embedFont(bytes.bold, { subset: true })
  const serifBold = await pdf.embedFont(bytes.serifBold, { subset: true })
  const logo = await loadLuxorPdfLogo(pdf)
  return { pdf, regular, bold, serif: regular, serifBold, logo, pageWidth: luxorPdfPageWidth, pageHeight: luxorPdfPageHeight }
}

export type LuxorCreatedDocumentPdfKit = Awaited<ReturnType<typeof createLuxorCreatedDocumentPdfKit>>
export type { PDFFont, PDFImage }