import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import ts from 'typescript'

const require = createRequire(import.meta.url)
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
}
const { finishLuxorProposalPublicationAndFetchFreshInvoice } = require('../src/lib/luxorProposalPublicationReconciliation.ts')

test('receipt recovery returns the invoice timestamp updated by publication completion before resend CAS', async () => {
  const invoiceId = '11111111-1111-4111-8111-111111111111'
  const attemptId = '22222222-2222-4222-8222-222222222222'
  let stored = {
    id: invoiceId,
    updated_at: '2026-10-13T12:00:00.000Z',
    proposal_context: { publication_attempt: { id: attemptId, state: 'sending' } },
  }
  const returned = await finishLuxorProposalPublicationAndFetchFreshInvoice(
    invoiceId,
    attemptId,
    async (id, attempt, state) => {
      assert.equal(id, invoiceId)
      assert.equal(attempt, attemptId)
      assert.equal(state, 'completed')
      // Simulate the database trigger changing updated_at with the completion write.
      stored = { ...stored, updated_at: '2026-10-13T12:00:01.000Z', proposal_context: { publication_attempt: { id: attemptId, state: 'completed' } } }
      return false
    },
    async () => stored,
  )
  assert.equal(returned.updated_at, '2026-10-13T12:00:01.000Z')
  const resendCasSucceeded = stored.updated_at === returned.updated_at
  assert.equal(resendCasSucceeded, true, 'resend must use the refreshed timestamp after receipt reconciliation')
})

test('receipt recovery fails when the latest publication row is not completed', async () => {
  await assert.rejects(
    finishLuxorProposalPublicationAndFetchFreshInvoice(
      'invoice', 'attempt', async () => false,
      async () => ({ id: 'invoice', proposal_context: { publication_attempt: { id: 'attempt', state: 'sending' } } }),
    ),
    /publication state needs retry/,
  )
})