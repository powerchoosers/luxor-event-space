import type { LuxorCreatedDocumentRow } from '@/lib/luxorDocumentCreatorTypes'

const handoffKey = (id: string) => `luxor-created-document-handoff:${id}`

/** Stashes a freshly saved row so the [id] route can hydrate without wiping the editor. */
export function stashCreatedDocumentHandoff(document: LuxorCreatedDocumentRow) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(handoffKey(document.id), JSON.stringify(document))
  } catch {
    /* ignore quota errors */
  }
}

export function takeCreatedDocumentHandoff(id: string): LuxorCreatedDocumentRow | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(handoffKey(id))
    if (!raw) return null
    sessionStorage.removeItem(handoffKey(id))
    return JSON.parse(raw) as LuxorCreatedDocumentRow
  } catch {
    return null
  }
}