import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { buildLuxorInvoicePdf } from '@/lib/luxorInvoicePdfServer'
import { enqueueLuxorTestEmail } from '@/lib/luxorTestLeadServer'
import { LuxorTestProposalConflictError, LUXOR_PERMANENT_TEST_LEAD_ID, LUXOR_TEST_PROPOSAL_RECIPIENT, prepareLuxorTestProposal, prepareLuxorTestProposalBreakdown } from '@/lib/luxorTestProposalServer'
import type { LuxorInquiry, LuxorInvoice } from '@/lib/luxorInquiryTypes'
import type { LuxorProposalSelection } from '@/lib/luxorProposalPricing'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function authorizedMember() {
  const session = await getLuxorPortalSession()
  if (!session) return null
  const member = await getLuxorPortalMember(session.email)
  if (!member || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'settings')) return null
  return member
}

export async function GET(request: NextRequest) {
  try {
    if (!await authorizedMember()) return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })
    const testRunId = request.nextUrl.searchParams.get('testRunId') || ''
    if (!UUID.test(testRunId)) return NextResponse.json({ error: 'A valid test run ID is required.' }, { status: 400 })
    const [run] = await supabaseRest<Array<{ id: string }>>(
      `luxor_test_runs?select=id&id=eq.${encodeURIComponent(testRunId)}&test_lead_id=eq.00b264d6-a3fb-4ea3-9142-415f76385c39&status=eq.in_progress&limit=1`,
    )
    if (!run) return NextResponse.json({ error: 'Choose an active permanent test lead run.' }, { status: 404 })
    const [artifact] = await supabaseRest<Array<{ id: string; test_run_id: string; artifact_type: string; status: string; details: Record<string, unknown> }>>(
      `luxor_test_run_artifacts?select=id,test_run_id,artifact_type,status,details&test_run_id=eq.${encodeURIComponent(testRunId)}&artifact_type=eq.proposal&limit=1`,
    )
    const format = request.nextUrl.searchParams.get('format')
    if (format === 'breakdown-preview') {
      const prepared = await prepareLuxorTestProposalBreakdown({
        testRunId,
        expectedRevision: Number(artifact?.details?.proposal_revision),
      })
      return new NextResponse(prepared.body, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'",
          'X-Content-Type-Options': 'nosniff',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      })
    }
    if (format === 'pdf') {
      const invoice = artifact?.details?.invoice
      if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice)) {
        return NextResponse.json({ error: 'Save or publish an isolated proposal before viewing its PDF.' }, { status: 404 })
      }
      const lead = await getLuxorInquiry(LUXOR_PERMANENT_TEST_LEAD_ID)
      if (!lead || lead.is_test !== true) return NextResponse.json({ error: 'The permanent Test Lead is unavailable.' }, { status: 404 })
      const source = await buildLuxorInvoicePdf(invoice as LuxorInvoice, { ...lead, email: LUXOR_TEST_PROPOSAL_RECIPIENT } as LuxorInquiry, { testOnly: true })
      const pdfBytes = new Uint8Array(source.length)
      pdfBytes.set(source)
      return new NextResponse(pdfBytes.buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="Luxor-SIMULATED-Proposal-${testRunId.slice(0, 8)}.pdf"`,
          'Cache-Control': 'private, no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      })
    }
    return NextResponse.json({
      artifact: artifact ? {
        id: artifact.id,
        status: artifact.status,
        revision: Number(artifact.details?.proposal_revision) || 0,
        details: { invoice: artifact.details?.invoice ?? null },
      } : null,
    })
  } catch (error) {
    const status = error instanceof LuxorTestProposalConflictError ? error.status : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load the test proposal.' }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await authorizedMember()) return NextResponse.json({ error: 'Owner or admin access required.' }, { status: 403 })
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const testRunId = typeof body.testRunId === 'string' ? body.testRunId : ''
    const action = body.action === 'publish' ? 'publish' : body.action === 'save' ? 'save' : body.action === 'breakdown' ? 'breakdown' : null
    const selection = body.selection && typeof body.selection === 'object' && !Array.isArray(body.selection)
      ? body.selection as LuxorProposalSelection
      : null
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    const expectedRevision = Number(body.expectedRevision)
    if (!UUID.test(testRunId) || !action) {
      return NextResponse.json({ error: 'An active test run and supported proposal action are required.' }, { status: 400 })
    }
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return NextResponse.json({ error: 'Refresh the test proposal before saving; its draft revision is missing.' }, { status: 409 })
    }

    if (action === 'breakdown') {
      const prepared = await prepareLuxorTestProposalBreakdown({ testRunId, expectedRevision })
      const result = await enqueueLuxorTestEmail({
        testRunId,
        category: 'proposal_breakdown',
        subject: prepared.subject,
        body: prepared.body,
        source: prepared.source,
      })
      if (result.conflict) return NextResponse.json({ error: String(result.error || 'This proposal Breakdown already has a queued test email.') }, { status: 409 })
      return NextResponse.json({
        queued: true,
        sent: false,
        replayed: result.replayed === true,
        revision: prepared.revision,
        recipient: LUXOR_TEST_PROPOSAL_RECIPIENT,
      }, { status: result.replayed ? 200 : 202 })
    }
    if (!selection || !description) {
      return NextResponse.json({ error: 'A proposal selection and description are required to save or publish.' }, { status: 400 })
    }

    const prepared = await prepareLuxorTestProposal({ testRunId, action, selection, description, notes, expectedRevision })
    const result = await supabaseRest<{
      artifact?: { details?: Record<string, unknown> }
      conflict?: boolean
      error?: string
      recipient?: string
      replayed?: boolean
    }>('rpc/luxor_save_test_proposal', {
      method: 'POST',
      body: JSON.stringify({
        p_test_run_id: testRunId,
        p_action: action,
        p_expected_revision: expectedRevision,
        p_request_fingerprint: prepared.requestFingerprint,
        p_details: prepared.details,
        p_email_subject: action === 'publish' ? prepared.email?.subject ?? null : null,
        p_email_body: action === 'publish' ? prepared.email?.html ?? null : null,
        p_pdf_base64: action === 'publish' ? prepared.pdfBase64 : null,
      }),
    })
    if (result.conflict) {
      return NextResponse.json({ error: result.error || 'This proposal changed in another window. Reload the draft before saving.' }, { status: 409 })
    }
    return NextResponse.json({
      published: action === 'publish',
      replayed: result.replayed === true,
      revision: Number(result.artifact?.details?.proposal_revision) || expectedRevision + 1,
      recipient: action === 'publish' ? result.recipient || prepared.recipient : null,
    }, { status: result.replayed ? 200 : action === 'publish' ? 201 : 200 })
  } catch (error) {
    const status = error instanceof LuxorTestProposalConflictError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save or publish the test proposal.' }, { status })
  }
}
