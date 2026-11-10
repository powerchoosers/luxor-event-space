'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const inventory = fs.readFileSync(path.join(root, 'docs/workflow-message-inventory.md'), 'utf8')
const paths = [...new Set([...inventory.matchAll(/`(src\/(?:app|lib)\/[^`]+)`/g)].map((m) => m[1].split(';')[0].trim()))]

test('workflow inventory references existing source files', () => {
  const missing = []
  for (const rel of paths) {
    if (!fs.existsSync(path.join(root, rel))) missing.push(rel)
  }
  assert.deepEqual(missing, [], `Missing inventory paths:\n${missing.join('\n')}`)
})
