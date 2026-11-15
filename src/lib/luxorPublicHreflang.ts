import type { Metadata } from 'next'

/** Shared hreflang alternates for English/Spanish public marketing page pairs. */
export function buildLuxorBilingualAlternates(
  canonical: string,
  englishPath: string,
  spanishPath: string,
): NonNullable<Metadata['alternates']> {
  return {
    canonical,
    languages: {
      'en-US': englishPath,
      'es-US': spanishPath,
      'x-default': englishPath,
    },
  }
}