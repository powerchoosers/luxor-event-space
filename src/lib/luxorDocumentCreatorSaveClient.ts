import type { LuxorCreatedDocumentRow, LuxorCreatedDocumentType } from './luxorDocumentCreatorTypes'

export type DocumentSaveContentSnapshot = {
  title: string
  documentType: LuxorCreatedDocumentType
  bodyJson: Record<string, unknown>
  bodyHtml: string
  version: number
}

function stableJson(value: Record<string, unknown>) {
  return JSON.stringify(value)
}

/** True when the server row still matches what the editor intends to save (PDF refresh-only drift). */
export function shouldRetrySaveAfterConflict(
  snapshot: DocumentSaveContentSnapshot,
  server: LuxorCreatedDocumentRow,
): boolean {
  return (
    snapshot.title === server.title
    && snapshot.documentType === server.document_type
    && snapshot.bodyHtml === server.body_html
    && stableJson(snapshot.bodyJson) === stableJson(server.body_json)
    && snapshot.version === server.version
  )
}