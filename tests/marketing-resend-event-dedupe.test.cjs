/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const migrationPath = path.resolve(
  'supabase/migrations/20261115143004_luxor_marketing_resend_event_dedupe.sql',
)

test('resend marketing dedupe migration uses a non-partial unique index for PostgREST upsert', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert.match(
    sql,
    /create unique index if not exists luxor_marketing_events_resend_recipient_event_uidx\s+on public\.luxor_marketing_events \(recipient_id, resend_event_id\);/i,
  )
  const indexBlock = sql.slice(sql.toLowerCase().indexOf('create unique index'))
  assert.doesNotMatch(indexBlock, /\bwhere\b/i, 'partial unique indexes cannot back PostgREST on_conflict')
})

test('resend webhook uses recipient_id,resend_event_id on_conflict', () => {
  const source = fs.readFileSync(path.resolve('src/lib/luxorResendWebhookServer.ts'), 'utf8')
  assert.match(source, /luxor_marketing_events\?on_conflict=recipient_id,resend_event_id/)
  assert.match(source, /resolution=ignore-duplicates/)
})