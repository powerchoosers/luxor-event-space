import type { PortalStatusTone } from '@/components/portal/PortalUI'
import {
  LUXOR_CREATED_DOCUMENT_STATUS_LABELS,
  type LuxorCreatedDocumentStatus,
} from '@/lib/luxorDocumentCreatorTypes'

export function createdDocumentStatusPresentation(
  status: LuxorCreatedDocumentStatus,
): { label: string; tone?: PortalStatusTone } {
  switch (status) {
    case 'draft':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.draft, tone: 'neutral' }
    case 'template':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.template, tone: 'neutral' }
    case 'sent':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.sent, tone: 'blue' }
    case 'opened':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.opened, tone: 'blue' }
    case 'partially_signed':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.partially_signed, tone: 'gold' }
    case 'signed':
      return { label: 'Fully signed', tone: 'green' }
    case 'declined':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.declined, tone: 'red' }
    case 'expired':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.expired, tone: 'warning' }
    case 'voided':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.voided, tone: 'neutral' }
    case 'archived':
      return { label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS.archived, tone: 'neutral' }
    default:
      return { label: status, tone: 'neutral' }
  }
}