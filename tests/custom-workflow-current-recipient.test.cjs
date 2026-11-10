'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
let channel, current, failed, captured, tourStatus
const file = path.resolve(__dirname, '../src/lib/luxorCustomWorkflowRuntimeServer.ts'), mod = new Module(file, module)
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
const actual = mod.require.bind(mod)
const rest = async (query, options) => {
  if (query.startsWith('luxor_custom_workflow_runtime_controls')) return [{ execution_enabled: true }]
  if (query === 'rpc/luxor_custom_workflow_get_due_message_steps') return [{ step_run_id: 'run', inquiry_id: 'inquiry', workflow_version_id: 'version', channel, inquiry_context: { email: 'old@example.invalid', phone: '+12105550100' }, step_definition: channel === 'email' ? { id: 'step', type: 'email', mode: 'marketing' } : { id: 'step', type: 'text', body: 'body' } }]
  if (query.startsWith('luxor_custom_workflow_versions')) return [{ definition: { steps: [{ id: 'step', type: 'email', mode: 'marketing' }] } }]
  if (query.startsWith('rpc/luxor_custom_workflow_enqueue_')) { captured = JSON.parse(options.body); return [{ disposition: 'queued' }] }
  if (query === 'rpc/luxor_custom_workflow_consume_pending_events' || query === 'rpc/luxor_custom_workflow_advance_control_steps') return [{}]
  return 0
}
const mocks = {
  './luxorCustomWorkflowFeatureGates': { CUSTOM_WORKFLOW_EXECUTION_ENABLED: true },
  './luxorCustomWorkflowTourOrchestrationServer': { consumeAttendedTourEvents: async () => ({ status: tourStatus, consumed: 0, ignored: 0, enrolled: 0 }) },
  './supabaseRestServer': { supabaseRest: rest, supabaseRestStrict: async (query) => { assert.match(query, /select=email,phone,/); if (failed) throw new Error('read failed'); return current ? [current] : [] } },
  './luxorCallsServer': { normalizePhoneNumber: (phone) => phone || null },
  './luxorTextCampaignsServer': { estimateSmsSegments: () => 1 },
  './luxorWorkflowEmailServer': { hydrateWorkflowEmailTemplates: async () => {}, renderCustomWorkflowEmail: async () => ({ subject: 'subject', body: 'body', previewText: '' }), mergeWorkflowFields: (body) => body },
  './luxorPhoneNumbersServer': { getPublicLuxorPhoneNumber: async () => 'sample' },
}
mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file)
function reset(type) { channel = type; current = { email: 'new@example.invalid', phone: '+12105550101', full_name: 'Sample' }; failed = false; captured = null; tourStatus = 'not_installed' }
test('email and text use the same freshly read contact used for rendering', async () => {
  for (const type of ['email', 'text']) { reset(type); await mod.exports.processDueLuxorCustomWorkflowOrchestration(); assert.equal(type === 'email' ? captured.p_recipient_email : captured.p_recipient_phone, type === 'email' ? 'new@example.invalid' : '+12105550101') }
})
test('unavailable current contact leaves the step due instead of using an old recipient', async () => {
  const original = console.warn; console.warn = () => {}
  try { for (const missing of ['failed', 'missing']) { reset('text'); if (missing === 'failed') failed = true; else current = null; const result = await mod.exports.processDueLuxorCustomWorkflowOrchestration(); assert.equal(captured, null); assert.equal(result.queuedTextSteps, 0) } } finally { console.warn = original }
})
test('a failed optional tour consumer does not stop existing message steps', async () => {
  reset('email'); tourStatus = 'error'
  const result = await mod.exports.processDueLuxorCustomWorkflowOrchestration()
  assert.equal(result.attendedTours.status, 'error'); assert.equal(result.queuedEmailSteps, 1); assert.equal(captured.p_recipient_email, 'new@example.invalid')
})
