/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function loadTsModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath)
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(js, filename)
  return loaded.exports
}

const link = loadTsModule('../src/lib/luxorCallContactLink.ts')

test('external party phone uses caller/from on inbound and callee/to on outbound', () => {
  assert.equal(link.luxorCallExternalPartyPhone({
    direction: 'inbound',
    caller_number: '(210) 376-0811',
    from_number: '+12103760811',
  }), '+12103760811')
  assert.equal(link.luxorCallExternalPartyPhone({
    direction: 'outbound',
    caller_number: '+15550001111',
    callee_number: '2103760811',
  }), '+12103760811')
})

test('linked display name prefers saved inquiry or vendor over generic placeholders', () => {
  assert.equal(link.luxorCallLinkedContactName({
    linkedInquiryName: 'Monica',
    linkedVendorName: null,
    contactName: 'Unknown caller',
  }), 'Monica')
  assert.equal(link.luxorCallLinkedContactName({
    linkedInquiryName: null,
    linkedVendorName: 'Adobe Lighting',
    contactName: '+12103760811',
  }), 'Adobe Lighting')
  assert.equal(link.luxorCallLinkedContactName({
    linkedInquiryName: null,
    linkedVendorName: null,
    contactName: 'Unknown caller',
  }), null)
  assert.equal(link.luxorCallLinkedContactName({
    linkedInquiryName: null,
    linkedVendorName: null,
    contactName: 'Jordan',
  }), 'Jordan')
})

test('linked display name ignores contact names that are only phone numbers', () => {
  assert.equal(link.luxorCallLinkedContactName({
    linkedInquiryName: null,
    linkedVendorName: null,
    contactName: '+12103760811',
  }), null)
  assert.equal(link.luxorCallLinkedContactName({
    linkedInquiryName: null,
    linkedVendorName: null,
    contactName: '(210) 376-0811',
  }), null)
  assert.equal(link.luxorCallLinkedContactName({
    linkedInquiryName: '2103760811',
    linkedVendorName: null,
    contactName: null,
  }), null)
})

test('normalization matches US numbers to E.164', () => {
  assert.equal(link.normalizeLuxorPhoneNumber('2103760811'), '+12103760811')
  assert.equal(link.normalizeLuxorPhoneNumber('+1 210-376-0811'), '+12103760811')
})