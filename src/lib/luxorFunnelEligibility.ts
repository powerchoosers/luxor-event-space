import { isLuxorInquiryArchived, isLuxorNonRevenueTestInquiry } from './luxorInquiryTypes'

export type FunnelRecordEligibility = {
  id?: string
  is_test?: unknown
  deleted_at?: unknown
  metadata?: unknown
  archived_at?: unknown
  status?: unknown
  pipeline_stage?: unknown
}
function metadata(record: FunnelRecordEligibility): Record<string, unknown> {
  return record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown> : {}
}
export function isFunnelRecordDeleted(record: FunnelRecordEligibility): boolean {
  return Boolean(record.deleted_at || metadata(record).deleted_at)
}
export function hasFunnelTestMetadata(record: FunnelRecordEligibility): boolean {
  const meta = metadata(record)
  return ['is_test', 'test', 'test_inquiry', 'is_test_record'].some(key => meta[key] === true || meta[key] === 'true')
}
// Shared by the chart/KPIs and the period-filtered recent-submissions list.
export function isFunnelInquiryEligible(record: FunnelRecordEligibility): boolean {
  return !isFunnelRecordDeleted(record)
    && !hasFunnelTestMetadata(record)
    && !isLuxorNonRevenueTestInquiry({ id: record.id || '', is_test: record.is_test === true, metadata: metadata(record) })
    && !isLuxorInquiryArchived({
      archived_at: typeof record.archived_at === 'string' ? record.archived_at : null,
      status: typeof record.status === 'string' ? record.status : 'new',
      pipeline_stage: typeof record.pipeline_stage === 'string' ? record.pipeline_stage : 'inquiry',
    } as Parameters<typeof isLuxorInquiryArchived>[0])
}
