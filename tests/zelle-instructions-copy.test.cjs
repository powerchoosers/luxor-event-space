'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative), mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : name === 'server-only' ? {} : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename); return mod.exports
}
const copy = load('src/lib/luxorZelleInstructionsCopy.ts')
let saved, override, settingsFail
const server = load('src/lib/luxorZelleInstructionsServer.ts', {
  './luxorZelleInstructionsCopy': copy,
  './luxorZelleInstructionsCopyServer': { readZelleInstructionsSetting: async () => { if (settingsFail) throw new Error('unavailable'); return { setting: { copy_override: override } } } },
  './luxorEmailDesignSystem': { renderLuxorSystemEmail: value => JSON.stringify(value) },
  './supabaseRestServer': { supabaseRest: async (query, options) => { if (!options) return []; saved = JSON.parse(options.body); return [saved] } },
})
const input = { clientName: 'Sarah Guest', recipient: 'booking@example.invalid', amount: 250, amountLabel: 'reservation deposit' }
test('custom wording preserves the real amount, payment recipient and required warning', () => {
  const email = server.buildLuxorZelleInstructionsEmail({ ...input, copyOverride: { ...copy.ZELLE_INSTRUCTIONS_DEFAULT, body: '<script> {{payment_type}}' } })
  const body = JSON.parse(email.body)
  assert.match(body.bodyHtml, /&lt;script&gt; reservation deposit/)
  assert.deepEqual(body.details, [{ label:'Amount selected', value:'$250.00' }, { label:'Zelle recipient', value:'booking@example.invalid' }])
  assert.match(body.note, /does not mean a transfer was sent or received/)
  assert.throws(() => copy.validateZelleInstructionsCopy({ ...copy.ZELLE_INSTRUCTIONS_DEFAULT, body:'Please pay us.' }), /payment_type/)
  assert.throws(() => copy.validateZelleInstructionsCopy({ ...copy.ZELLE_INSTRUCTIONS_DEFAULT, subject:'Hello\nInjected' }), /single line/)
})
test('queued wording is snapshotted and settings failures preserve the original', async () => {
  const queue = { booking:{ id:'booking', client_name:'Sarah Guest', email:'sarah@example.invalid' }, inquiry:null, amount:250, amountLabel:'reservation deposit', recipient:'booking@example.invalid' }
  override = { ...copy.ZELLE_INSTRUCTIONS_DEFAULT, subject:'Payment for {{first_name}}' }; settingsFail = false
  await server.queueLuxorZelleInstructionsEmail(queue)
  assert.equal(saved.subject,'Payment for Sarah'); assert.equal(saved.metadata.payment_method,'zelle')
  const previous = console.error; console.error = () => {}
  try { settingsFail = true; await server.queueLuxorZelleInstructionsEmail(queue); assert.equal(saved.subject,'Luxor Zelle payment instructions'); assert.equal(saved.metadata.copy_settings_unavailable,true) } finally { console.error = previous }
})
