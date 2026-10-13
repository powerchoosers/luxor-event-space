import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dossier = fs.readFileSync(path.join(root, 'src/app/(portal)/portal/leads/[id]/page.tsx'), 'utf8')
const clientList = fs.readFileSync(path.join(root, 'src/app/(portal)/portal/leads/page.tsx'), 'utf8')
const invoiceRoute = fs.readFileSync(path.join(root, 'src/app/api/invoices/route.ts'), 'utf8')

function sectionAfter(source, marker, nextMarker) {
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `expected source section ${marker}`)
  const end = source.indexOf(nextMarker, start + marker.length)
  assert.notEqual(end, -1, `expected end of source section ${nextMarker}`)
  return source.slice(start, end)
}

test('client records open their dossier, where Proposals is a primary mobile tab with a create action', () => {
  assert.match(clientList, /href=\{'\/portal\/leads\/' \+ client\.id\}/)
  assert.match(dossier, /primaryLeadTabIds: LeadDetailTab\[\] = \['overview', 'proposals'/)
  assert.match(dossier, /role="tablist" aria-label="Lead detail sections" className="grid grid-cols-5/)
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
  assert.match(duplicate, /leadEvents\.find\(\(event\) => event\.id === invoice\.lead_event_id\)/)
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
  assert.match(dossier, /proposal\.proposal_accepted_at \|\| acceptedActivity \|\| proposalBooking/)
  assert.match(dossier, /latestBooking\?\.invoice_id === latestInvoice\?\.id/)
  assert.match(dossier, /proposalAccepted = Boolean\(latestInvoice\?\.proposal_accepted_at \|\| hasAcceptedProposalEvidence/)
  assert.match(dossier, /Booking linked; acceptance timestamp unavailable/)
  assert.doesNotMatch(dossier, /latestInvoice\?\.proposal_accepted_at[\s\S]{0,80}lead\.status === 'booked'/)
})
