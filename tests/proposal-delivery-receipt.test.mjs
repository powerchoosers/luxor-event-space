import test from 'node:test'
import assert from 'node:assert/strict'
import { getLuxorProposalDeliveryReceipt } from '../src/lib/luxorProposalDeliveryReceipt.ts'

test('reconciliation uses the original history reservation after a durable provider receipt', () => {
  const result = getLuxorProposalDeliveryReceipt({
    delivery_snapshot: {
      proposal_email: {
        delivery_state: 'delivered',
        delivery_sent_at: '2026-10-13T17:00:00.000Z',
        provider_message_id: 'provider-123',
        proposal_send_attempt_id: 'reservation-A',
      },
    },
    publication_attempt: { id: 'publication-B' },
  })

  assert.deepEqual(result, {
    proposalSendAttemptId: 'reservation-A',
    sentAt: '2026-10-13T17:00:00.000Z',
    providerMessageId: 'provider-123',
  })
})

test('receipt without a history reservation is not reconciled against a different attempt', () => {
  assert.equal(getLuxorProposalDeliveryReceipt({
    delivery_snapshot: { proposal_email: { delivery_state: 'delivered', delivery_sent_at: '2026-10-13T17:00:00.000Z' } },
    publication_attempt: { id: 'unrelated-attempt' },
  }), null)
})

test('prepared and unconfirmed provider payloads are not mistaken for delivery receipts', () => {
  for (const delivery_state of ['prepared', 'delivery_unconfirmed']) {
    assert.equal(getLuxorProposalDeliveryReceipt({
      delivery_snapshot: { proposal_email: { delivery_state, delivery_sent_at: null, proposal_send_attempt_id: 'reservation-A' } },
    }), null)
  }
})
