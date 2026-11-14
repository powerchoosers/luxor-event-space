#!/usr/bin/env node
'use strict'

const APPLY = process.argv.includes('--apply')

async function main() {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) {
    console.error('Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  const rpc = APPLY ? 'luxor_apply_call_contact_backfill' : 'luxor_preview_call_contact_backfill'
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({}),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    console.error(`RPC ${rpc} failed (${response.status}).`)
    console.error(typeof payload === 'object' ? JSON.stringify(payload, null, 2) : payload)
    process.exit(1)
  }

  if (APPLY) {
    console.log(`Updated ${payload} call row(s).`)
    return
  }

  console.log(`Preview: ${Array.isArray(payload) ? payload.length : 0} unlinked call(s).`)
  console.log(JSON.stringify(payload, null, 2))
  console.log('')
  console.log('To apply after review: node scripts/luxor-call-contact-link-backfill.cjs --apply')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})