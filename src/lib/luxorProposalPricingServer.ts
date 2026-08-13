import 'server-only'

import {
  LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG,
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
  // The pricing engine independently validates each required scenario. This
  // narrow guard avoids treating a malformed database response as usable.
  return isRecord(value) ? value as LuxorProposalPricingConfig : LUXOR_DEFAULT_PROPOSAL_PRICING_CONFIG
}

export async function getDefaultLuxorProposalPricing(): Promise<LuxorProposalPricingRecord> {
  const rows = await supabaseRest<Array<Omit<LuxorProposalPricingRecord, 'config'> & { config: unknown }>>(
    'luxor_proposal_pricing?select=*&is_default=eq.true&limit=1',
  )
  const row = rows[0]
  if (!row) {
    throw new Error('Pricing configuration required — administrator review.')
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
