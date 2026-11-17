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
  assert.equal(types.luxorTranscriptStorageTrack('caller', metadata), 'caller')
  assert.equal(types.luxorTranscriptStorageTrack('luxor_agent', metadata), 'luxor_agent')
})

test('elena parent-leg custom track labels map to storage without extra swap', () => {
  const metadata = { scope: 'elena_live_inbound' }
  assert.equal(types.luxorTranscriptStorageTrack('luxor_agent', metadata), 'luxor_agent')
  assert.equal(types.luxorTranscriptStorageTrack('caller', metadata), 'caller')
  assert.equal(types.luxorTranscriptSpeaker('luxor_agent', { elenaSipBridge: true }), 'luxor')
  assert.equal(types.luxorTranscriptSpeaker('caller', { elenaSipBridge: true }), 'caller')
})

test('elena sip bridge maps labeled tracks to the correct speaker', () => {
  assert.equal(types.luxorTranscriptSpeaker('caller', { elenaSipBridge: true }), 'caller')
  assert.equal(types.luxorTranscriptSpeaker('luxor_agent', { elenaSipBridge: true }), 'luxor')
})

test('standard calls keep twilio track mapping', () => {
  assert.equal(types.luxorTranscriptSpeaker('inbound_track'), 'caller')
  assert.equal(types.luxorTranscriptSpeaker('outbound_track'), 'luxor')
})

test('dual channel index follows storage track labels', () => {
  const elena = { scope: 'elena_live_inbound' }
  assert.equal(types.luxorDualChannelIndexForStorageTrack('caller', elena), 0)
  assert.equal(types.luxorDualChannelIndexForStorageTrack('luxor_agent', elena), 1)
  assert.equal(types.luxorDualChannelIndexForStorageTrack('caller', {}), 0)
  assert.equal(types.luxorDualChannelIndexForStorageTrack('luxor_agent', {}), 1)
})

test('elena parent pstn labeled tracks keep caller on channel 0', () => {
  const metadata = { scope: 'elena_live_inbound', ingress_mode: 'programmable_sip' }
  assert.equal(types.luxorTranscriptStorageTrack('caller', metadata), 'caller')
  assert.equal(types.luxorTranscriptStorageTrack('luxor_agent', metadata), 'luxor_agent')
  assert.equal(types.luxorDualChannelIndexForStorageTrack('caller', metadata), 0)
  assert.equal(types.luxorDualChannelIndexForStorageTrack('luxor_agent', metadata), 1)
})