/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const claim = (() => {
  const filename = path.resolve(__dirname, '../src/lib/luxorElenaInboundAgentTranscriptClaim.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
  return mod.exports
})()

test('agent transcript claim or filter uses PostgREST dot operators', () => {
  const clause = claim.agentTranscriptSidebandClaimOrFilter()
  assert.match(clause, /agent_transcript_sideband\.is\.null/)
  assert.match(clause, /agent_transcript_sideband\.eq\.failed/)
  assert.match(clause, /agent_transcript_sideband\.eq\.partial/)
  assert.doesNotMatch(clause, /=eq\./)
})

test('agent transcript claim query suffix wraps or filter', () => {
  const suffix = claim.agentTranscriptSidebandClaimQuerySuffix()
  assert.equal(suffix, `&or=${claim.agentTranscriptSidebandClaimOrFilter()}`)
})

test('worker origin defaults to www and rewrites apex', () => {
  assert.equal(claim.resolveElenaInboundAgentTranscriptWorkerOrigin(), 'https://www.luxoratlaspalmas.com')
  assert.equal(claim.resolveElenaInboundAgentTranscriptWorkerOrigin('https://www.luxoratlaspalmas.com/'), 'https://www.luxoratlaspalmas.com')
  assert.equal(claim.resolveElenaInboundAgentTranscriptWorkerOrigin('https://luxoratlaspalmas.com'), 'https://www.luxoratlaspalmas.com')
  assert.equal(claim.resolveElenaInboundAgentTranscriptWorkerOrigin('luxoratlaspalmas.com'), 'https://www.luxoratlaspalmas.com')
})