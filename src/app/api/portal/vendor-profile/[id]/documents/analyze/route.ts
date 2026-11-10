import { NextRequest, NextResponse } from 'next/server'
import { inspectLuxorExpenseReceipt } from '@/lib/luxorExpenseReceiptsServer'
import { VENDOR_UUID, vendorFinanceSession } from '@/lib/luxorVendorDocumentsServer'
import { classifyProviderDocument, issueDocumentTicket } from '@/lib/luxorProviderDocumentAnalysis'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

export const maxDuration = 60
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await vendorFinanceSession()
  if (!session) return NextResponse.json({ error: 'Operations and finance access required.' }, { status: 403 })
  const { id: raw } = await context.params
  const id = raw.toLowerCase()
  if (!VENDOR_UUID.test(id)) return NextResponse.json({ error: 'Invalid provider.' }, { status: 400 })
  try {
    const [vendor] = await supabaseRestStrict<Array<{ id: string; archived_at: string | null }>>(`luxor_vendors?select=id,archived_at&id=eq.${id}&limit=1`)
    if (!vendor || vendor.archived_at) return NextResponse.json({ error: 'An active provider is required.' }, { status: 409 })
    const form = await request.formData(), file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF, JPG, or PNG.' }, { status: 400 })
    if (/(?:^|[^a-z])(?:w[\s_-]*9|ssn|tax[\s_-]*id|ein)(?:[^a-z]|$)/i.test(file.name)) return NextResponse.json({ sensitive: 'possible', message: 'This document may contain tax or government identification information. It was not saved.' }, { status: 422 })
    let inspected: Awaited<ReturnType<typeof inspectLuxorExpenseReceipt>>
    try { inspected = await inspectLuxorExpenseReceipt(file) } catch { return NextResponse.json({ error: 'Choose a valid PDF, JPG, or PNG up to 20 MB.' }, { status: 400 }) }
    const assessment = await classifyProviderDocument({ bytes: inspected.bytes, filename: inspected.safeName, contentType: inspected.contentType })
    if (assessment.sensitive !== 'none') return NextResponse.json({ sensitive: assessment.sensitive, message: assessment.sensitive === 'possible' ? 'This document may contain tax or government identification information. It was not saved.' : 'We could not check this document for sensitive information. It was not saved.' }, { status: 422 })
    return NextResponse.json({ assessment, ticket: issueDocumentTicket(assessment, inspected.sha256, id, session.email) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Document analysis is unavailable. Please try again.' }, { status: 503 })
  }
}
