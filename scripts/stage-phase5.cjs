#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const scopeFile = path.join(__dirname, 'phase5-commit-scope.txt')
const lines = fs.readFileSync(scopeFile, 'utf8').split(/\r?\n/)
const staged = []
const missing = []
let inStage = false
for (const line of lines) {
  const trimmed = line.trim()
  if (trimmed === '## Stage (paths relative to repo root)') { inStage = true; continue }
  if (inStage && trimmed.startsWith('## ')) break
  if (!inStage || !trimmed || trimmed.startsWith('#')) continue
  const relative = trimmed.replace(/\\/g, '/')
  const absolute = path.join(root, relative)
  if (fs.existsSync(absolute)) {
    staged.push(relative)
  } else {
    missing.push(relative)
  }
}
if (!staged.length) {
  console.error('No Phase 5 paths found to stage.')
  process.exit(1)
}
execFileSync('git', ['add', '--', ...staged], { cwd: root, stdio: 'inherit' })
console.log(`Staged ${staged.length} Phase 5 path(s).`)
if (missing.length) console.warn('Missing (skipped):\n' + missing.map((p) => `  - ${p}`).join('\n'))
