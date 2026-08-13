import 'server-only'

import {
  type LuxorProposalPricingConfig,
} from './luxorProposalPricing'
import { supabaseRest } from './supabaseRestServer'

export type LuxorProposalPricingRecord = {
  id: string
  created_at: string
  updated_at: string
  version: number
  is_default: boolean
  config: LuxorProposalPricingConfig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeConfig(value: unknown): LuxorProposalPricingConfig {
  // Final proposals must always use the owner-managed database catalog. Do
  // not silently fall back to code-held rates when the saved record is
  // malformed; that could quote a client from an out-of-date price sheet.
  if (!isRecord(value)) {
    throw new Error('The active pricing catalog is invalid. Update it before creating a final proposal.')
  }
  return value as LuxorProposalPricingConfig
}

export async function getDefaultLuxorProposalPricing(): Promise<LuxorProposalPricingRecord> {
  const rows = await supabaseRest<Array<Omit<LuxorProposalPricingRecord, 'config'> & { config: unknown }>>(
    'luxor_proposal_pricing?select=*&is_default=eq.true&limit=1',
  )
  const row = rows[0]
  if (!row) {
    throw new Error('No active pricing rules are available. A final price cannot be calculated until the Luxor pricing catalog is restored.')
  }
  return { ...row, config: normalizeConfig(row.config) }
}

export async function updateDefaultLuxorProposalPricing(input: {
  id: string
  version: number
  config: LuxorProposalPricingConfig
}) {
  const [updated] = await supabaseRest<LuxorProposalPricingRecord[]>(
    `luxor_proposal_pricing?select=*&id=eq.${encodeURIComponent(input.id)}&is_default=eq.true`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        config: input.config,
        version: Math.max(1, Math.floor(Number(input.version) || 1)),
        updated_at: new Date().toISOString(),
      }),
    },
  )
  if (!updated) throw new Error('The default pricing configuration could not be updated.')
  return { ...updated, config: normalizeConfig(updated.config) }
}
