/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  aggregateMarketingEmailMetrics,
  classifyMarketingEmailChannel,
  isProductionMarketingMailRow,
} = require('../src/lib/luxorMarketingEmailMetrics.ts')

test('classifyMarketingEmailChannel splits campaign, follow-up, and system mail', () => {
  assert.equal(
    classifyMarketingEmailChannel(
      { id: 'm0', provider_id: 'p0', accepted_at: '2026-01-01', occurred_at: '2026-01-01', subject: 'Campaign type only', metadata: { emailJobId: '44444444-4444-4444-8444-444444444444' } },
      { id: '44444444-4444-4444-8444-444444444444', test_run_id: null, job_type: 'marketing_campaign', metadata: {} },
    ),
    'system',
  )
  assert.equal(classifyMarketingEmailChannel({ id: 'm1', provider_id: 'p1', accepted_at: '2026-01-01', occurred_at: '2026-01-01', subject: 'Campaign', metadata: { marketingCampaignId: '11111111-1111-4111-8111-111111111111' } }), 'campaign')
  assert.equal(
    classifyMarketingEmailChannel(
      { id: 'm2', provider_id: 'p2', accepted_at: '2026-01-01', occurred_at: '2026-01-01', subject: 'Brochure', metadata: { emailJobId: '22222222-2222-4222-8222-222222222222' } },
      { id: '22222222-2222-4222-8222-222222222222', test_run_id: null, job_type: 'brochure_follow_up', metadata: { follow_up_sequence: true } },
    ),
    'follow_up',
  )
  assert.equal(
    classifyMarketingEmailChannel(
      { id: 'm3', provider_id: 'p3', accepted_at: '2026-01-01', occurred_at: '2026-01-01', subject: 'Receipt', metadata: { emailJobId: '33333333-3333-4333-8333-333333333333' } },
      { id: '33333333-3333-4333-8333-333333333333', test_run_id: null, job_type: 'transactional_notice', metadata: {} },
    ),
    'system',
  )
})

test('aggregateMarketingEmailMetrics counts resend clicks from joined provider ids', () => {
  const mailRows = [
    {
      id: 'mail-campaign',
      provider_id: 'provider-campaign',
      accepted_at: '2026-03-01T12:00:00.000Z',
      occurred_at: '2026-03-01T12:00:00.000Z',
      subject: 'March campaign',
      metadata: { marketingCampaignId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    },
    {
      id: 'mail-follow-up',
      provider_id: 'provider-follow-up',
      accepted_at: '2026-03-02T12:00:00.000Z',
      occurred_at: '2026-03-02T12:00:00.000Z',
      subject: 'Brochure follow-up',
      metadata: { emailJobId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    },
  ]
  const jobsById = new Map([
    ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', test_run_id: null, job_type: 'brochure_follow_up', metadata: { follow_up_sequence: true } }],
  ])
  const mailByProviderId = new Map(mailRows.map((mail) => [mail.provider_id, mail]))
  const metrics = aggregateMarketingEmailMetrics({
    sentMailRows: mailRows,
    mailByProviderId,
    jobsById,
    resendEvents: [
      { event_id: 'e1', event_type: 'email.clicked', provider_email_id: 'provider-campaign', received_at: '2026-03-01T13:00:00.000Z' },
      { event_id: 'e2', event_type: 'email.clicked', provider_email_id: 'provider-follow-up', received_at: '2026-03-02T13:00:00.000Z' },
      { event_id: 'e3', event_type: 'email.opened', provider_email_id: 'provider-follow-up', received_at: '2026-03-02T13:05:00.000Z' },
      { event_id: 'e4', event_type: 'email.bounced', provider_email_id: 'provider-campaign', received_at: '2026-03-01T14:00:00.000Z' },
    ],
  })

  assert.equal(metrics.totals.sent, 2)
  assert.equal(metrics.totals.clicked, 2)
  assert.equal(metrics.totals.opened, 1)
  assert.equal(metrics.totals.bounced, 1)
  assert.equal(metrics.byChannel.campaign.clicked, 1)
  assert.equal(metrics.byChannel.follow_up.clicked, 1)
  assert.equal(metrics.recentActivity.length, 4)
})

test('production mail filter excludes test-run jobs', () => {
  const mail = {
    id: 'mail-test',
    provider_id: 'provider-test',
    accepted_at: '2026-03-01T12:00:00.000Z',
    occurred_at: '2026-03-01T12:00:00.000Z',
    subject: 'Test',
    metadata: { emailJobId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', is_test_record: true },
  }
  const job = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', test_run_id: 'test-run', job_type: 'marketing_campaign', metadata: {} }
  assert.equal(isProductionMarketingMailRow(mail, job), false)
})