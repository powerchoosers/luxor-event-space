'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

test('voice session tells Elena to delegate workflow attribution', () => {
  const voice = fs.readFileSync(path.join(root, 'src/app/api/portal/elena-chat/voice-session/route.ts'), 'utf8')
  assert.match(voice, /which workflow a text or email belongs to/i)
  assert.match(voice, /delegate/i)
  assert.match(voice, /Never guess/i)
})

test('chat returns workflow links from find_message_workflow and voice UI filters them', () => {
  const chat = fs.readFileSync(path.join(root, 'src/app/api/portal/elena-chat/route.ts'), 'utf8')
  const ui = fs.readFileSync(path.join(root, 'src/components/portal/PortalElenaChat.tsx'), 'utf8')
  assert.match(chat, /find_message_workflow/)
  assert.match(chat, /workflowLinksPayload/)
  assert.match(chat, /filterWorkflowMatches/)
  assert.match(ui, /workflowLinks\?\.filter\(\(item\) => isSafeWorkflowLink\(item\.href\)\)/)
  assert.match(ui, /stopVoice\(\)/)
})
