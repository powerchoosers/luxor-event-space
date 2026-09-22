import { readFile } from 'node:fs/promises'
import path from 'node:path'

const BROCHURE_FILENAME = 'Luxor-at-Las-Palmas-Venue-Brochure.pdf'
const brochurePath = path.join(process.cwd(), 'public', 'brochures', BROCHURE_FILENAME)

let cachedBrochurePdf: Uint8Array | null = null

/**
 * Returns the approved, client-facing Luxor brochure. Keeping one source asset
 * ensures the immediate download and emailed attachment always match.
 */
export async function getLuxorBrochurePdf(): Promise<Uint8Array> {
  if (!cachedBrochurePdf) {
    cachedBrochurePdf = new Uint8Array(await readFile(brochurePath))
  }

  return cachedBrochurePdf
}

export { BROCHURE_FILENAME }
