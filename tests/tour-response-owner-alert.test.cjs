/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const leadId = '11111111-1111-4111-8111-111111111111'
let notifyCalls = []

function compile(relativePath, filename, stubs) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, parent, isMain)
  }
  try { loaded._compile(js, filename) } finally { Module._load = originalLoad }
  return loaded.exports
}

const inquiry = {
  id: leadId,
  full_name: 'Sample Guest',
  status: 'tour_confirmed',
  tour_attendance_status: 'pending',
  is_test: false,
}

const route = compile('src/app/api/public/tour-response/route.ts', path.join(root, 'tour-response-route.synthetic.cjs'), {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  '@/lib/luxorInquiriesServer': {
    getLuxorInquiryByTourToken: async () => inquiry,
    updateLuxorInquiryIfTourAttendanceStatus: async () => ({ ...inquiry, status: 'tour_requested', tour_attendance_status: 'rescheduled', updated_at: '2026-11-18T12:00:00.000Z' }),
  },
  '@/lib/luxorTourCancellationServer': { cancelLuxorTourForInquiry: async () => ({ ok: true }) },
  '@/lib/luxorCalendarServer': { getLuxorCalendarEvent: async () => null },
  '@/lib/luxorNotesServer': { createNote: async () => ({ id: 'note' }) },
  '@/lib/luxorTestLeadServer': { assertLuxorProductionSideEffectsAllowed: async () => {} },
  '@/lib/luxorClientStatusOwnerAlertsServer': {
    notifyOwnerOfClientStatusChange: async (input) => { notifyCalls.push(input) },
  },
})

test('tour-response reschedule calls notifyOwnerOfClientStatusChange', async () => {
  notifyCalls = []
  const response = await route.POST({ json: async () => ({ token: 'synthetic-token', action: 'reschedule' }) })
  assert.equal(response.status, 200)
  assert.equal(notifyCalls.length, 1)
  assert.equal(notifyCalls[0].kind, 'tour_reschedule')
  assert.equal(notifyCalls[0].leadId, leadId)
})