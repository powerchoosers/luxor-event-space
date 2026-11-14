/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const types = (() => {
  const filename = path.resolve(__dirname, '../src/lib/luxorCallTypes.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod.require = (name) => (name === 'server-only' ? {} : Module.prototype.require.call(mod, name))
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
})()

test('elena sip bridge swaps inbound and outbound tracks for speaker mapping', () => {
  assert.equal(types.luxorTranscriptSpeaker('inbound_track', { elenaSipBridge: true }), 'luxor')
  assert.equal(types.luxorTranscriptSpeaker('outbound_track', { elenaSipBridge: true }), 'caller')
})

test('elena sip bridge normalizes storage tracks for new transcript rows', () => {
  const metadata = { scope: 'elena_live_inbound' }
  assert.equal(types.luxorTranscriptStorageTrack('inbound_track', metadata), 'luxor_agent')
  assert.equal(types.luxorTranscriptStorageTrack('outbound_track', metadata), 'caller')
})

test('standard calls keep twilio track mapping', () => {
  assert.equal(types.luxorTranscriptSpeaker('inbound_track'), 'caller')
  assert.equal(types.luxorTranscriptSpeaker('outbound_track'), 'luxor')
})