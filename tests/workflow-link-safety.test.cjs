'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorWorkflowLink.ts')
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const { isSafeWorkflowLink } = loaded.exports
test('accepts the paid-invoice workflow destination', () => { assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-paid-invoice-email'), true) })
test('accepts the staff-requested payment receipt destination', () => { assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-payment-receipt'), true) })
test('accepts the executed agreement destination', () => { assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-agreement-client'), true) })
test('accepts the owner audit destination', () => { assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-agreement-owner'), true) })
test('accepts the Zelle instructions destination', () => { assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-zelle-instructions'), true) })
test('accepts legacy invoice reminder builder aliases', () => {
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-invoice-due'), true)
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-invoice-overdue'), true)
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-invoice-due?step=evil'), false)
})
test('accepts system workflow overview links without allowing untrusted query strings', () => {
  for (const id of ['agreement-emails','event-emails','final-payment-emails','installment-emails','tour-texts','tour-emails','invoice-reminders']) {
    assert.equal(isSafeWorkflowLink(`/portal/marketing/custom-workflows/system-${id}`),true)
    assert.equal(isSafeWorkflowLink(`/portal/marketing/custom-workflows/system-${id}?next=https://example.invalid`),false)
  }
})
test('accepts the planner invitation destination', () => {
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-planner-invitation'), true)
})
test('accepts the planner verification destination', () => {
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-planner-verification'), true)
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-proposal-breakdown'), true)
})
test('accepts the agreement package destination', () => {
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-agreement-package'), true)
})
test('accepts calendar message workflow steps', () => {
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-calendar-messages?step=cancellation'), true)
  assert.equal(isSafeWorkflowLink('/portal/marketing/custom-workflows/system-calendar-messages?step=update'), true)
})
test('accepts specific workflow destinations used by chat and voice cards', () => {
  for (const href of ['/portal/marketing/custom-workflows/system-brochure', '/portal/marketing/custom-workflows/system-tour-no-show-email', '/portal/marketing/custom-workflows/system-offer-email', '/portal/marketing/custom-workflows/system-payment-request-email', '/portal/marketing/custom-workflows/system-inquiry-confirmation', '/portal/marketing/custom-workflows/system-tour-emails?step=reminder_24', '/portal/marketing/custom-workflows/6a79a3c0-cde3-4c9e-b90d-bad2036e076e']) assert.equal(isSafeWorkflowLink(href), true, href)
})
test('rejects external or malformed destinations', () => {
  for (const href of ['https://example.invalid', '//example.invalid/portal/marketing/custom-workflows/system-brochure', '/portal/marketing/custom-workflows/system-brochure?next=https://example.invalid', '/portal/marketing/custom-workflows/------------------------------------', null]) assert.equal(isSafeWorkflowLink(href), false, String(href))
})
