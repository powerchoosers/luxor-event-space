import { PDFDocument } from 'pdf-lib'

export const MAX_BROCHURE_BYTES = 100 * 1024 * 1024

/** Validate the uploaded bytes, not just the browser's filename or MIME type. */
export async function validateBrochurePdf(bytes: Uint8Array): Promise<number> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BROCHURE_BYTES) {
    throw new Error('The brochure must be a PDF no larger than 100 MB.')
  }
  if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
    throw new Error('The selected file is not a valid PDF.')
  }
  try {
    const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true })
    const pages = pdf.getPageCount()
    if (pages < 1) throw new Error('Empty PDF')
    return pages
  } catch {
    throw new Error('The selected PDF could not be opened. Please choose a valid PDF.')
  }
}
