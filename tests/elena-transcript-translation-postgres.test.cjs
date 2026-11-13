/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const modulePath = process.env.PGLITE_MODULE
let PGlite
if (modulePath) ({ PGlite } = require(modulePath))
test('additive transcript SQL preserves existing source/access and constrains translation states', { skip: !PGlite }, async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table public.luxor_call_transcript_segments(id integer primary key,segment_text text,created_at timestamptz default now()); alter table public.luxor_call_transcript_segments enable row level security; insert into public.luxor_call_transcript_segments(id,segment_text) values(1,'مرحبا');`)
    await db.exec(fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261113060147_elena_transcript_translation.sql'), 'utf8'))
    const { rows } = await db.query('select segment_text,english_text,spoken_languages,translation_status,translation_attempts from public.luxor_call_transcript_segments')
    assert.deepEqual(rows[0], { segment_text: 'مرحبا', english_text: null, spoken_languages: [], translation_status: 'not_requested', translation_attempts: 0 })
    await db.exec("update public.luxor_call_transcript_segments set english_text='Hello',spoken_languages=array['Arabic'],translation_status='completed' where id=1")
    assert.equal((await db.query('select segment_text from public.luxor_call_transcript_segments')).rows[0].segment_text, 'مرحبا')
    await assert.rejects(db.exec("update public.luxor_call_transcript_segments set translation_status='fake'"))
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.luxor_call_transcript_segments'::regclass")).rows[0].relrowsecurity, true)
  } finally { await db.close() }
})
