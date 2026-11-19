/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function compile(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const loaded = new Module(relativePath, module)
  loaded.filename = path.join(root, relativePath)
  loaded.paths = module.paths
  loaded._compile(js, loaded.filename)
  return loaded.exports
}

const plan = compile('src/lib/luxorCreatedDocumentSendPlan.ts')
const overlay = compile('src/lib/luxorCreatedDocumentSignerOverlay.ts')

test('parallel send invites every uninvited recipient and sequential waits', () => {
  const signers = [
    { id: 'a', name: 'Ada', email: 'ada@example.com', sign_order: 1, status: 'pending', invited_at: null },
    { id: 'b', name: 'Bea', email: 'elenaassistant@mail.grokbot.com', sign_order: 2, status: 'pending', invited_at: null },
  ]
  assert.deepEqual(plan.planCreatedDocumentInvitations('parallel', signers).map((signer) => signer.id), ['a', 'b'])
  assert.deepEqual(plan.planCreatedDocumentInvitations('sequential', signers).map((signer) => signer.id), ['a'])
  const afterFirst = signers.map((signer) => signer.id === 'a' ? { ...signer, invited_at: '2026-11-19T00:00:00.000Z', status: 'viewed' } : signer)
  assert.deepEqual(plan.planCreatedDocumentInvitations('sequential', afterFirst), [])
  const firstSigned = afterFirst.map((signer) => signer.id === 'a' ? { ...signer, status: 'signed' } : signer)
  assert.deepEqual(plan.planCreatedDocumentInvitations('sequential', firstSigned).map((signer) => signer.id), ['b'])
})

test('reminders are scheduled only when the operator enables them', () => {
  const now = Date.parse('2026-11-19T00:00:00.000Z')
  assert.equal(plan.createdDocumentReminderSchedule(false, 3, now), null)
  assert.equal(plan.createdDocumentReminderSchedule(true, 3, now), '2026-11-22T00:00:00.000Z')
  assert.equal(plan.createdDocumentReminderSchedule(true, 0, now), '2026-11-20T00:00:00.000Z')
})

test('document status rolls up to viewed, partial, fully signed, and declined', () => {
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'pending' }, { status: 'pending' }]), 'sent')
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'viewed' }, { status: 'pending' }]), 'opened')
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'signed' }, { status: 'viewed' }]), 'partially_signed')
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'signed' }, { status: 'signed' }]), 'signed')
  assert.equal(plan.rollupCreatedDocumentStatus([{ status: 'signed' }, { status: 'declined' }]), 'declined')
})

test('library groupings keep drafts, out for signature, and completed apart', () => {
  assert.equal(plan.createdDocumentLibraryStatusFilter('my_documents'), 'status=eq.draft')
  assert.equal(plan.createdDocumentLibraryStatusFilter('out_for_signature'), 'status=in.(sent,opened,partially_signed)')
  assert.equal(plan.createdDocumentLibraryStatusFilter('completed'), 'status=in.(signed,declined,voided)')
})

test('queue guard refuses a real customer address unless the portal confirms a live send', () => {
  assert.equal(plan.isLuxorCreatedDocumentTestRecipient('elenaassistant@mail.grokbot.com'), true)
  assert.equal(plan.isLuxorCreatedDocumentTestRecipient('guest@example.com'), true)
  assert.equal(plan.isLuxorCreatedDocumentTestRecipient('booking@luxoratlaspalmas.com'), false)
  assert.throws(
    () => plan.assertCreatedDocumentQueueRecipient('booking@luxoratlaspalmas.com', false),
    /non-test recipient/,
  )
  assert.doesNotThrow(() => plan.assertCreatedDocumentQueueRecipient('guest@example.com', false))
  assert.doesNotThrow(() => plan.assertCreatedDocumentQueueRecipient('booking@luxoratlaspalmas.com', true))
})

test('combined PDF path stays in the private created-documents folder', () => {
  assert.equal(
    plan.executedCreatedDocumentPdfPath('doc-1'),
    'created-documents/doc-1/final/executed.pdf',
  )
})

test('signer overlay inputs stay at 16px and scale to fit', () => {
  const presentation = overlay.signerOverlayInputPresentation(8)
  assert.equal(presentation.fontSize, '16px')
  assert.match(presentation.transform, /^scale\(0\.5/)
  assert.equal(overlay.signerOverlayInputPresentation(16).transform, 'none')
})

test('send route and delivery queue use the existing email job helper', () => {
  const delivery = fs.readFileSync(path.join(root, 'src/lib/luxorCreatedDocumentDeliveryServer.ts'), 'utf8')
  const route = fs.readFileSync(path.join(root, 'src/app/api/operations/documents/[id]/send/route.ts'), 'utf8')
  assert.match(delivery, /createLuxorEmailJob/)
  assert.match(delivery, /jobType: 'contract_signature'/)
  assert.doesNotMatch(delivery, /RESEND_API_KEY|new Resend|sendLuxorResendEmail/)
  assert.match(route, /confirmLiveSend: true/)
  assert.match(delivery, /createdDocumentReminderSchedule/)
})
