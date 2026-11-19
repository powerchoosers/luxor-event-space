export const LUXOR_CREATED_DOCUMENT_TYPES = [
  'venue_use_agreement',
  'partnership_agreement',
  'vendor_agreement',
  'rental_contract',
  'waiver',
  'other',
] as const

export type LuxorCreatedDocumentType = (typeof LUXOR_CREATED_DOCUMENT_TYPES)[number]

export const LUXOR_CREATED_DOCUMENT_TYPE_LABELS: Record<LuxorCreatedDocumentType, string> = {
  venue_use_agreement: 'Venue Use Agreement',
  partnership_agreement: 'Partnership Agreement',
  vendor_agreement: 'Vendor Agreement',
  rental_contract: 'Rental Contract',
  waiver: 'Waiver',
  other: 'Other',
}

export const LUXOR_CREATED_DOCUMENT_STATUSES = [
  'draft',
  'template',
  'sent',
  'opened',
  'partially_signed',
  'signed',
  'declined',
  'expired',
  'voided',
  'archived',
] as const

export type LuxorCreatedDocumentStatus = (typeof LUXOR_CREATED_DOCUMENT_STATUSES)[number]

export const LUXOR_CREATED_DOCUMENT_STATUS_LABELS: Record<LuxorCreatedDocumentStatus, string> = {
  draft: 'Draft',
  template: 'Template',
  sent: 'Sent',
  opened: 'Viewed',
  partially_signed: 'Partially signed',
  signed: 'Fully signed',
  declined: 'Declined',
  expired: 'Expired',
  voided: 'Voided',
  archived: 'Archived',
}

export type LuxorCreatedDocumentLibrarySection =
  | 'my_documents'
  | 'out_for_signature'
  | 'completed'
  | 'templates'
  | 'archived'

export type LuxorCreatedDocumentSigningOrder = 'parallel' | 'sequential'

export type LuxorCreatedDocumentRow = {
  id: string
  created_at: string
  updated_at: string
  title: string
  document_type: LuxorCreatedDocumentType
  body_json: Record<string, unknown>
  body_html: string
  is_template: boolean
  status: LuxorCreatedDocumentStatus
  archived_at: string | null
  created_by: string
  version: number
  pdf_storage_path: string | null
  source_template_id: string | null
  signing_order?: LuxorCreatedDocumentSigningOrder
  reminder_enabled?: boolean
  reminder_after_days?: number
  sent_subject?: string | null
  sent_message?: string | null
  sent_at?: string | null
  voided_at?: string | null
  final_pdf_path?: string | null
  recipient_summary?: string | null
  signing_link_origin?: string | null
}

export type LuxorCreatedDocumentSummary = Pick<
  LuxorCreatedDocumentRow,
  'id' | 'created_at' | 'updated_at' | 'title' | 'document_type' | 'is_template' | 'status' | 'archived_at' | 'created_by' | 'version' | 'recipient_summary'
>

export function isLuxorCreatedDocumentType(value: unknown): value is LuxorCreatedDocumentType {
  return typeof value === 'string' && (LUXOR_CREATED_DOCUMENT_TYPES as readonly string[]).includes(value)
}

export function displayStatusForDocument(row: Pick<LuxorCreatedDocumentRow, 'status' | 'is_template' | 'archived_at'>): LuxorCreatedDocumentStatus {
  if (row.archived_at) return 'archived'
  if (row.is_template) return 'template'
  return row.status
}