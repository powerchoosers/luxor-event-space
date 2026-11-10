'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const builder = fs.readFileSync(path.resolve(__dirname, '../src/app/(portal)/portal/marketing/custom-workflows/[workflowId]/page.tsx'), 'utf8')

test('system workflows with dedicated history show SystemWorkflowContacts in the builder', () => {
  const requiredFlags = [
    'isPlannerVerification',
    'isAgreementOwner',
    'isCalendarMessageSystem',
    'isProposalBreakdown',
    'isAgreementPackage',
    'isManualInvoiceReminderSystem',
  ]
  const block = builder.match(/\{isPhoneSystem[\s\S]*?<SystemWorkflowContacts workflowId=\{workflowId\} \/> : null\}/)
  assert.ok(block, 'SystemWorkflowContacts gate not found')
  for (const flag of requiredFlags) {
    assert.match(block[0], new RegExp(flag), `${flag} missing from SystemWorkflowContacts gate`)
  }
})
