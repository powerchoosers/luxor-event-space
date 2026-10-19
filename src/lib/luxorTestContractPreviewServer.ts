import 'server-only'

import type { LuxorBooking, LuxorInquiry, LuxorInvoice } from '@/lib/luxorInquiryTypes'
import { prepareLuxorAcceptedProposalBooking } from '@/lib/luxorAgreementQueueServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { LUXOR_TEST_PROPOSAL_RECIPIENT } from '@/lib/luxorTestProposalServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

export const LUXOR_PERMANENT_TEST_LEAD_ID = '00b264d6-a3fb-4ea3-9142-415f76385c39'

type Artifact = {
  status: string
  details: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function storedPreview(value: unknown) {
  if (!isRecord(value) || value.legal_effect !== false || !isRecord(value.booking)) return null
  if (typeof value.agreement_date !== 'string') return null
  return value as { legal_effect: false; agreement_date: string; booking: LuxorBooking }
}

/**
 * Prepare the existing Luxor agreement PDF data from an accepted test proposal,
 * then persist only an isolated test-run artifact. This never creates a booking,
 * signature request, document row, or production queue item.
 */
export async function prepareLuxorTestContractPreview(testRunId: string) {
  const [run] = await supabaseRest<Array<{ id: string; started_at: string }>>(
    `luxor_test_runs?select=id,started_at&id=eq.${encodeURIComponent(testRunId)}&test_lead_id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&status=eq.in_progress&limit=1`,
  )
  if (!run) throw new Error('Choose the active permanent Test Lead run before preparing a simulated contract preview.')

  const [proposal, contract] = await Promise.all([
    supabaseRest<Artifact[]>(`luxor_test_run_artifacts?select=status,details&test_run_id=eq.${encodeURIComponent(testRunId)}&artifact_type=eq.proposal&limit=1`)
      .then((rows) => rows[0] ?? null),
    supabaseRest<Artifact[]>(`luxor_test_run_artifacts?select=status,details&test_run_id=eq.${encodeURIComponent(testRunId)}&artifact_type=eq.contract&limit=1`)
      .then((rows) => rows[0] ?? null),
  ])
  if (proposal?.status !== 'accepted') throw new Error('Simulate proposal acceptance before preparing the contract preview.')
  const savedPreview = storedPreview(contract?.details.contract_preview)
  if (savedPreview) return { preview: savedPreview, status: contract?.status || 'prepared', replayed: true }
  if (contract && contract.status !== 'simulated') {
    throw new Error('This run has a contract status without its isolated preview snapshot. Start a fresh Test Lead run to prepare another preview.')
  }

  const invoiceValue = proposal.details.invoice
  if (!isRecord(invoiceValue) || invoiceValue.inquiry_id !== LUXOR_PERMANENT_TEST_LEAD_ID) {
    throw new Error('The accepted test proposal has no valid isolated invoice snapshot.')
  }
  const invoice = invoiceValue as unknown as LuxorInvoice
  const inquiry = await getLuxorInquiry(LUXOR_PERMANENT_TEST_LEAD_ID)
  if (!inquiry || inquiry.is_test !== true) throw new Error('The permanent Test Lead is unavailable.')
  const testInquiry: LuxorInquiry = { ...inquiry, email: LUXOR_TEST_PROPOSAL_RECIPIENT }
  const prepared = prepareLuxorAcceptedProposalBooking(invoice, testInquiry)
  const now = new Date().toISOString()
  const booking = {
    id: run.id,
    created_at: run.started_at,
    updated_at: now,
    booked_at: null,
    contract_sent_at: null,
    contract_signed_at: null,
    ...prepared,
    email: LUXOR_TEST_PROPOSAL_RECIPIENT,
    phone: inquiry.phone,
    status: 'tentative',
    contract_status: 'not_sent',
  } as LuxorBooking
  const preview = {
    legal_effect: false as const,
    agreement_date: now,
    booking,
  }

  const result = await supabaseRest<{ artifact?: { status?: string } }>('rpc/luxor_advance_test_artifact', {
    method: 'POST',
    body: JSON.stringify({
      p_test_run_id: testRunId,
      p_artifact_type: 'contract',
      p_status: 'prepared',
      p_details: { simulation_only: true, contract_preview: preview },
    }),
  })
  return { preview, status: result.artifact?.status || 'prepared', replayed: false }
}

export async function getLuxorTestContractPreview(testRunId: string) {
  const [run] = await supabaseRest<Array<{ id: string }>>(
    `luxor_test_runs?select=id&id=eq.${encodeURIComponent(testRunId)}&test_lead_id=eq.${LUXOR_PERMANENT_TEST_LEAD_ID}&status=eq.in_progress&limit=1`,
  )
  if (!run) throw new Error('Choose the active permanent Test Lead run to preview its simulated contract.')
  const [artifact] = await supabaseRest<Artifact[]>(
    `luxor_test_run_artifacts?select=status,details&test_run_id=eq.${encodeURIComponent(testRunId)}&artifact_type=eq.contract&limit=1`,
  )
  if (!artifact || !['prepared', 'sent', 'signed'].includes(artifact.status)) {
    throw new Error('Prepare the simulated contract preview before opening it.')
  }
  const preview = storedPreview(artifact.details.contract_preview)
  if (!preview) throw new Error('The simulated contract preview snapshot is unavailable.')
  return preview
}
