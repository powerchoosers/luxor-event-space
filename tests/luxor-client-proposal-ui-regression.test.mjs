import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dossier = fs.readFileSync(path.join(root, 'src/app/(portal)/portal/leads/[id]/page.tsx'), 'utf8')
const clientList = fs.readFileSync(path.join(root, 'src/app/(portal)/portal/leads/page.tsx'), 'utf8')
const invoiceRoute = fs.readFileSync(path.join(root, 'src/app/api/invoices/route.ts'), 'utf8')
const proposalEvidenceSource = fs.readFileSync(path.join(root, 'src/lib/luxorProposalEvidence.ts'), 'utf8')
const duplicateContextSource = fs.readFileSync(path.join(root, 'src/lib/luxorProposalDuplicateContext.ts'), 'utf8')

function sectionAfter(source, marker, nextMarker) {
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `expected source section ${marker}`)
  const end = source.indexOf(nextMarker, start + marker.length)
  assert.notEqual(end, -1, `expected end of source section ${nextMarker}`)
  return source.slice(start, end)
}

test('client records open their dossier, where Proposals is a primary mobile tab with a create action', () => {
  assert.match(clientList, /href=\{'\/portal\/leads\/' \+ client\.id\}/)
  assert.match(dossier, /primaryLeadTabIds: LeadDetailTab\[\] = \[[^\]]*'proposals'/)
  assert.match(dossier, /role="tablist" aria-label="Client sections" className="grid grid-cols-4/)
  const proposalPanel = sectionAfter(dossier, "activeLeadTab === 'proposals'", "activeLeadTab === 'documents'")
  assert.match(proposalPanel, /Create New Proposal/)
  assert.match(proposalPanel, /onClick=\{\(\) => openProposalBuilder\(\)\}/)
})

test('proposal form is prefilled from the correct client and event, and saves against that lead/event', () => {
  assert.match(dossier, /clientName=\{lead\.full_name\}/)
  assert.match(dossier, /clientEmail=\{lead\.email\}/)
  assert.match(dossier, /eventType=\{proposalContext\?\.event_type \|\| activeEventForDisplay\?\.event_type \|\| lead\.event_type\}/)
  assert.match(dossier, /eventDate=\{proposalContext\?\.event_date \|\| activeEventForDisplay\?\.target_date \|\| lead\.target_date\}/)
  assert.match(dossier, /inquiry_id: id/)
  assert.match(dossier, /lead_event_id: proposalLeadEventId/)
  assert.match(dossier, /event_type: proposalContext\?\.event_type \|\| activeEventForDisplay\?\.event_type \|\| lead\.event_type/)
})

test('fresh proposals do not inherit saved line prices, discount, or promotion', () => {
  const create = sectionAfter(dossier, 'const openProposalBuilder =', 'const duplicateProposalDraft =')
  assert.match(create, /setInvoiceItems\(\[\{ description: '', quantity: 1, unitPrice: 0, total: 0 \}\]\)/)
  assert.match(create, /setInvoiceDiscountValue\('0'\)/)
  assert.match(create, /setLegacyProposalDiscount\(null\)/)
  assert.match(create, /setSelectedProposalPromotionId\(savedPromotionId\)/)
  assert.match(create, /const savedSelection = asProposalRecord\(savedContext\?\.pricing_selection\) \|\| \{\}/)
  assert.doesNotMatch(create, /metadata\?\.proposalLineItems/)
})

test('duplicate copies the selected proposal and its event association but gets a new request identity', () => {
  const duplicate = sectionAfter(dossier, 'const duplicateProposalDraft =', 'const handleProposalCalculationChange =')
  assert.match(duplicate, /openProposalBuilder\(\)/)
  assert.match(duplicate, /pricing_selection: duplicateSelection/)
  assert.match(duplicate, /setSelectedProposalPromotionId\(savedPromotionId\)/)
  assert.match(duplicate, /setInvoiceItems\(lineItems\)/)
  assert.match(duplicate, /findProposalLeadEvent\(invoice, leadEvents, bookings\)/)
  assert.match(duplicate, /setProposalLeadEventId\(invoice\.lead_event_id \|\| sourceEvent\?\.id \|\| null\)/)
  assert.match(dossier, /creation_request_id: invoiceCreationRequest\.current/)
  assert.match(invoiceRoute, /calculateServerProposal\(selection, revision\.prior\)/)
})

test('save and duplicate paths return to Proposals; shown proposal actions have handlers', () => {
  assert.match(dossier, /setActiveLeadTab\('proposals'\)/)
  const proposalPanel = sectionAfter(dossier, "activeLeadTab === 'proposals'", "activeLeadTab === 'documents'")
  assert.match(proposalPanel, /openProposalDeliveryPreview\(proposal\)/)
  assert.match(proposalPanel, /handleSendFinalProposal\(proposal, false, true\)/)
  assert.match(proposalPanel, /duplicateProposalDraft\(proposal\)/)
  assert.match(proposalPanel, /openProposalBuilder\(proposal\)/)
})

test('published proposals are revised instead of edited, preserving the prior version', () => {
  const save = sectionAfter(dossier, 'const handleCreateInvoice =', 'const createFlowNote =')
  assert.match(save, /editingInvoice\.price_locked_at[\s\S]*editingInvoice\.proposal_sent_at[\s\S]*editingInvoice\.status === 'sent'/)
  assert.match(save, /supersedes_invoice_id: editingInvoice\.id/)
  assert.match(invoiceRoute, /existing\.status === 'sent' \|\| Boolean\(existing\.price_locked_at\) \|\| Boolean\(existing\.proposal_accepted_at\) \|\| Boolean\(existing\.proposal_sent_at\)/)
  assert.match(invoiceRoute, /This final proposal is already published\. Create a revised proposal instead of changing this version\./)
})

test('accepted history uses exact proposal evidence; legacy timestamp gaps do not erase acceptance', () => {
  assert.match(dossier, /currentProposalAcceptanceActivity = Boolean\(currentProposalInvoice && proposalHistory\[currentProposalInvoice\.id\]/)
  assert.match(dossier, /proposalInvoiceId: currentProposalInvoice\?\.id/)
  assert.match(dossier, /bookingInvoiceId: currentProposalBooking\?\.invoice_id/)
  assert.match(proposalEvidenceSource, /if \(!hasMatchingProposalBooking\(input\.proposalInvoiceId, input\.bookingInvoiceId\)\) return false/)
  assert.match(proposalEvidenceSource, /if \(acceptedAt \|\| input\.acceptedActivity\) return true/)
  assert.doesNotMatch(dossier, /latestInvoice\?\.proposal_accepted_at[\s\S]{0,80}lead\.status === 'booked'/)
})

test('a booking proves proposal acceptance only when both invoice IDs are present and match', async () => {
  const helperJavaScript = ts.transpileModule(proposalEvidenceSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const { hasMatchingProposalBooking, hasProposalAcceptanceEvidence } = await import(`data:text/javascript;base64,${Buffer.from(helperJavaScript).toString('base64')}`)

  assert.equal(hasMatchingProposalBooking(undefined, undefined), false)
  assert.equal(hasMatchingProposalBooking('', ''), false)
  assert.equal(hasMatchingProposalBooking('proposal-a', undefined), false)
  assert.equal(hasMatchingProposalBooking('proposal-a', 'proposal-b'), false)
  assert.equal(hasMatchingProposalBooking('proposal-a', 'proposal-a'), true)
  assert.equal(hasProposalAcceptanceEvidence({ bookingContractStatus: 'signed' }), false)
  assert.equal(hasProposalAcceptanceEvidence({ proposalInvoiceId: 'proposal-a', bookingInvoiceId: 'proposal-b', bookingContractStatus: 'signed' }), false)
  assert.equal(hasProposalAcceptanceEvidence({ proposalInvoiceId: 'proposal-a', bookingInvoiceId: 'proposal-a', bookingContractStatus: 'signed' }), true)
  assert.match(dossier, /bookings\.find\(\(booking\) => booking\.invoice_id === currentProposalInvoice\.id\)/)
  assert.match(dossier, /getProposalWorkflowDisplayState\(\{[\s\S]*proposalInvoiceId: currentProposalInvoice\?\.id,[\s\S]*bookingInvoiceId: currentProposalBooking\?\.invoice_id/)
})

test('duplicated proposals preserve rental access independently from guest hours', async () => {
  const helperJavaScript = ts.transpileModule(duplicateContextSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const { getDuplicatedProposalSelection, getDuplicatedProposalTimingContext } = await import(`data:text/javascript;base64,${Buffer.from(helperJavaScript).toString('base64')}`)
  const context = {
    rental_start_time: '16:00',
    rental_end_time: '02:00',
    start_time: '16:00',
    end_time: '02:00',
    guest_arrival_time: '18:00',
    event_end_time: '00:00',
    pricing_selection: {
      rentalStartTime: '16:00',
      rentalEndTime: '02:00',
      guestArrivalTime: '18:00',
      eventEndTime: '00:00',
      additionalRentalHours: 2,
      fixedExtensionAmount: 450,
      quoteBreakdown: { additional_hours: 2, additional_hour_rate: 225 },
      promotionId: 'source-proposal-promotion',
    },
  }

  assert.deepEqual(getDuplicatedProposalTimingContext(context), {
    rental_start_time: '16:00',
    rental_end_time: '02:00',
    start_time: '16:00',
    end_time: '02:00',
    guest_arrival_time: '18:00',
    event_end_time: '00:00',
  })
  const duplicatedSelection = getDuplicatedProposalSelection(context.pricing_selection)
  assert.equal(duplicatedSelection.rentalStartTime, '16:00')
  assert.equal(duplicatedSelection.rentalEndTime, '02:00')
  assert.equal(duplicatedSelection.guestArrivalTime, '18:00')
  assert.equal(duplicatedSelection.eventEndTime, '00:00')
  assert.equal(duplicatedSelection.additionalRentalHours, 2)
  assert.equal(duplicatedSelection.fixedExtensionAmount, 450)
  assert.deepEqual(duplicatedSelection.quoteBreakdown, { additional_hours: 2, additional_hour_rate: 225 })
  assert.equal('promotionId' in duplicatedSelection, false)
  assert.match(dossier, /getDuplicatedProposalSelection\(savedSelection\)/)
  assert.match(dossier, /\.\.\.getDuplicatedProposalTimingContext\(savedContext\)/)
})
