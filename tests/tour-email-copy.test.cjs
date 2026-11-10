'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file), mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  assert.deepEqual(result.diagnostics || [], []); mod._compile(result.outputText, filename); return mod.exports
}
const model = load('src/lib/luxorTourEmailCopy.ts')
const copy = { subject: 'Your tour on {{tour_date}}', greeting: 'Hi {{first_name}},', introduction: 'See you at {{tour_time}}.', preparation: 'We will discuss your {{event_type}}.', closing: 'Please reply with questions.' }
test('validates fields and renders only allowed variables', () => {
  assert.equal(model.renderTourEmailCopy(copy, { tour_date: 'Monday', first_name: 'Sarah', tour_time: '11 AM', event_type: 'Wedding' }).subject, 'Your tour on Monday')
  assert.throws(() => model.validateTourEmailCopy({ ...copy, subject: 'Bad\r\nBcc: test' }), /single line/)
  assert.throws(() => model.validateTourEmailCopy({ ...copy, closing: '{{unknown}}' }), /variables/)
  assert.equal(model.renderTourEmailCopy({ ...copy, subject: '{{client_notes}}' }, { client_notes: 'Hello\r\nBcc: fake' }).subject, 'Hello Bcc: fake')
})
test('missing table preserves original code and AI behavior; other errors do not silently discard settings', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let failure = new RestError(404, 'PGRST205')
  const server = load('src/lib/luxorTourEmailCopyServer.ts', { 'server-only': {}, './luxorTourEmailCopy': model, './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async () => { throw failure } } })
  const result = await server.readTourEmailCopySettings()
  assert.equal(result.installed, false); assert.equal(result.settings.length, 3); assert.ok(result.settings.every((row) => row.copy_override === null))
  failure = new RestError(503, 'unavailable'); await assert.rejects(server.readTourEmailCopySettings(), /synthetic/)
})
test('edits and restore use optimistic revision', async () => {
  class RestError extends Error {}
  let called
  const server = load('src/lib/luxorTourEmailCopyServer.ts', { 'server-only': {}, './luxorTourEmailCopy': model, './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (...args) => { called = args; return [] } } })
  await assert.rejects(server.saveTourEmailCopySetting('confirmation', null, 2, 'OWNER@example.invalid'), /changed/)
  assert.match(called[0], /revision=eq\.2/); assert.equal(JSON.parse(called[1].body).copy_override, null)
})
test('custom copy renders into the existing protected tour email design', async () => {
  let rendered
  const server = load('src/lib/luxorTourEmailServer.ts', { 'server-only': {}, './luxorTourEmailCopy': model, './luxorEmailDesignSystem': { renderLuxorSystemEmail: (input) => { rendered = input; return 'html' } }, './luxorPhoneClient': { formatPhoneDisplay: () => '' }, './luxorAiContextServer': {}, './luxorUnslop': { LUXOR_UNSLOP_COPY_RULES: '' } })
  const context = { inquiry: { full_name: 'Sarah Jenkins', event_type: 'Wedding', guest_count: 50 }, meetingType: 'Private tour', clientFacingNotes: '', tourDateLabel: 'Monday', tourTimeLabel: '11 AM', durationMinutes: 30, responseUrl: 'https://example.invalid/tour-response/test' }
  const result = await server.buildAiTourConfirmationEmail(context, { copyOverride: copy })
  assert.equal(result.subject, 'Your tour on Monday'); assert.equal(result.aiGenerated, false)
  assert.match(rendered.bodyHtml, /See you at 11 AM/); assert.equal(rendered.details.find((item) => item.label === 'Date').value, 'Monday')
  assert.equal(rendered.actions[0].url, context.responseUrl)
})
test('tour plan passes each notice its own setting without changing revision inputs', async () => {
  let settings = model.TOUR_EMAIL_NOTICE_KEYS.map((notice_key) => ({ notice_key, copy_override: null }))
  const planBuilder = load('src/lib/luxorTourPlanningServer.ts', {
    'server-only': {},
    './luxorTourEmailCopyServer': { readTourEmailCopySettings: async () => ({ settings, installed: true }) },
    './luxorTourEmailServer': { buildAiTourConfirmationEmail: async (_, options) => ({ subject: 'confirmation', body: 'body', override: options.copyOverride }), buildTourReminderEmail: (_, label, override) => ({ subject: label, body: 'body', override }) },
  })
  const input = { inquiry: { email: 'sample@example.invalid', full_name: 'Sample Guest', event_type: 'Wedding' }, date: '2099-12-10', time: '11:00 AM', responseToken: 'sample', responseUrl: 'https://example.invalid/tour-response/sample' }
  const original = await planBuilder.buildLuxorTourPlan(input)
  assert.equal(original.templates.confirmation.override, null); assert.equal(original.templates.reminder_24.override, null)
  settings = settings.map((item) => item.notice_key === 'reminder_24' ? { ...item, copy_override: copy } : item)
  const changed = await planBuilder.buildLuxorTourPlan(input)
  assert.deepEqual(changed.templates.reminder_24.override, copy); assert.equal(changed.templates.reminder_2.override, null)
  assert.deepEqual(changed.state, original.state); assert.deepEqual(changed.tour, original.tour)
})
