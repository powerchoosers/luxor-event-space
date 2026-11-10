'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const apiRoot = path.resolve(__dirname, '../src/app/api/marketing/system-messages')
const routes = fs.readdirSync(apiRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(apiRoot, entry.name, 'route.ts')))
  .map((entry) => entry.name)
  .sort()

const catalogIds = new Set(
  fs.readFileSync(path.resolve(__dirname, '../src/lib/luxorSystemWorkflowCatalog.ts'), 'utf8')
    .matchAll(/\['(system-[^']+)'/g).map((match) => match[1]),
)

const routeByWorkflow = {
  'system-inquiry-confirmation': 'inquiry-confirmation',
  'system-payment-confirmation': 'payment-confirmation',
  'system-event-reminder': 'event-reminder',
  'system-tour-texts': 'tour-text',
  'system-tour-emails': 'tour-email',
  'system-invoice-reminders': 'invoice-reminder',
  'system-inquiry-email': 'inquiry-email',
  'system-newsletter-email': 'receipt-email',
  'system-tour-request-email': 'receipt-email',
  'system-tour-no-show-email': 'tour-no-show-email',
  'system-layout-review-email': 'layout-review-email',
  'system-planner-invitation': 'planner-invitation',
  'system-planner-verification': 'planner-verification',
  'system-zelle-instructions': 'zelle-instructions',
  'system-paid-invoice-email': 'paid-invoice-email',
  'system-payment-receipt': 'payment-receipt',
  'system-agreement-client': 'agreement-client',
  'system-agreement-owner': 'agreement-owner',
  'system-installment-emails': 'installment-email',
  'system-manual-invoice-reminder': 'manual-invoice-reminder',
  'system-final-payment-emails': 'final-payment-email',
  'system-event-emails': 'event-email',
  'system-agreement-emails': 'agreement-email',
  'system-agreement-package': 'agreement-package',
  'system-offer-email': 'offer-email',
  'system-payment-request-email': 'payment-request-email',
  'system-calendar-messages': 'calendar-messages',
  'system-proposal-breakdown': 'proposal-breakdown',
  'system-phone-missed_call': 'phone-text',
  'system-phone-inbound_acknowledgment': 'phone-text',
}

test('every system workflow catalog entry has a settings API route', () => {
  for (const id of catalogIds) {
    const folder = routeByWorkflow[id]
    assert.ok(folder, `Missing API map for ${id}`)
    assert.ok(routes.includes(folder), `Missing route folder ${folder} for ${id}`)
  }
})

test('settings routes expose GET and PATCH with default restoration', () => {
  const defaultInGet = /starter|DEFAULT|_DEFAULT|defaultBody|defaultCopy|readTourEmailCopySettings|readTourTextTemplate|template, installed|settings, installed/
  const restoreInPatch = /copy === null|null : validate|copy_override: value|restoreDefault === true|INQUIRY_CONFIRMATION_DEFAULT|Select copy or restore|saveTourEmailCopySetting|saveTourTextTemplate|saveInquiryConfirmationTemplate/
  for (const folder of [...new Set(Object.values(routeByWorkflow))]) {
    const source = fs.readFileSync(path.join(apiRoot, folder, 'route.ts'), 'utf8')
    assert.match(source, /export async function GET/, `${folder} missing GET`)
    assert.match(source, /export async function PATCH/, `${folder} missing PATCH`)
    assert.match(source, defaultInGet, `${folder} missing default payload in GET`)
    if (folder === 'phone-text') {
      assert.match(source, /validatePhoneTextBody/, `${folder} missing body save validation`)
    } else {
      assert.match(source, restoreInPatch, `${folder} missing restore/save copy handling`)
    }
  }
})
