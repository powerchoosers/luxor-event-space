/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')

const { isLuxorInquiryBookedForAttribution } = require('../src/lib/luxorInquiryTypes.ts')

test('booked attribution uses pipeline stage or booking linkage, not status alone', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  assert.equal(isLuxorInquiryBookedForAttribution({ id, status: 'booked', pipeline_stage: null, metadata: {} }), false)
  assert.equal(isLuxorInquiryBookedForAttribution({ id, status: 'proposal_sent', pipeline_stage: 'deposit', metadata: {} }), true)
  assert.equal(isLuxorInquiryBookedForAttribution({ id, status: 'new', pipeline_stage: 'inquiry', metadata: {} }, new Set([id])), true)
  assert.equal(isLuxorInquiryBookedForAttribution({ id, status: 'new', pipeline_stage: 'inquiry', metadata: { deposit_paid_at: '2026-01-01' } }), true)
})