import { after, NextRequest, NextResponse } from 'next/server'
import { getOperationsSession } from '@/lib/luxorOperationsAccess'
import { analyzeManualBill, manualBillSnapshot, queueManualBillAnalysis, manualProcessingLeaseUnknown, manualQueuedScheduleMalformed } from '@/lib/luxorManualBillAnalysisServer'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'

export const maxDuration = 60
async function billForRequest(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [bill] = await supabaseRestStrict<LuxorBill[]>(`luxor_bills?id=eq.${id}&source_type=eq.manual&select=*&limit=1`)
  return bill || null
}
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await getOperationsSession()) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const bill = await billForRequest((await context.params).id)
  if (!bill) return NextResponse.json({ error: 'Manual bill not found.' }, { status: 404 })
  const analysis = bill.extracted_fields?.manual_analysis as { snapshot?: string } | undefined
  return NextResponse.json({ bill, analysis: analysis || null, leaseUnknown: manualProcessingLeaseUnknown(analysis), queueMalformed: manualQueuedScheduleMalformed(analysis), stale: Boolean(analysis?.snapshot && analysis.snapshot !== manualBillSnapshot(bill)) })
}
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!await getOperationsSession()) return NextResponse.json({ error: 'Operations access required.' }, { status: 401 })
  const bill = await billForRequest((await context.params).id)
  if (!bill || bill.status === 'paid') return NextResponse.json({ error: 'An unpaid manual bill is required.' }, { status: 404 })
  if (!await queueManualBillAnalysis(bill.id)) return NextResponse.json({ error: 'Analysis is active, its lease cannot be verified, or the bill changed. Reload; if the lease cannot be verified, contact an administrator.' }, { status: 409 })
  try { after(async () => { await analyzeManualBill(bill.id).catch((error) => console.error('Manual bill analysis failed:', error)) }) } catch { console.warn('Manual bill analysis queued for recovery.') }
  return NextResponse.json({ queued: true }, { status: 202 })
}
