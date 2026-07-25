export const LUXOR_CONTRACT_PAGE_SIZE = {
  width: 612,
  height: 792,
} as const

export type LuxorContractSignaturePlacement = {
  pageIndex: number
  client: { x: number; y: number; width: number; height: number }
  owner: { x: number; y: number; width: number; height: number }
}

export const LUXOR_LEGACY_CONTRACT_SIGNATURE_PLACEMENT: LuxorContractSignaturePlacement = {
  pageIndex: 1,
  client: {
    x: 52,
    y: 604,
    width: 228,
    height: 42,
  },
  owner: {
    x: 330,
    y: 604,
    width: 230,
    height: 42,
  },
} as const

export const LUXOR_CONTRACT_SIGNATURE_PLACEMENT: LuxorContractSignaturePlacement = {
  pageIndex: 5,
  client: {
    x: 52,
    y: 500,
    width: 228,
    height: 42,
  },
  owner: {
    x: 330,
    y: 500,
    width: 230,
    height: 42,
  },
}

export function getLuxorContractSignaturePlacement(metadata?: Record<string, unknown> | null) {
  const candidate = metadata?.signaturePlacement
  if (!candidate || typeof candidate !== 'object') return LUXOR_LEGACY_CONTRACT_SIGNATURE_PLACEMENT
  const placement = candidate as Partial<LuxorContractSignaturePlacement>
  if (
    typeof placement.pageIndex !== 'number' ||
    !placement.client ||
    !placement.owner ||
    typeof placement.client.x !== 'number' ||
    typeof placement.client.y !== 'number' ||
    typeof placement.client.width !== 'number' ||
    typeof placement.client.height !== 'number' ||
    typeof placement.owner.x !== 'number' ||
    typeof placement.owner.y !== 'number' ||
    typeof placement.owner.width !== 'number' ||
    typeof placement.owner.height !== 'number'
  ) return LUXOR_LEGACY_CONTRACT_SIGNATURE_PLACEMENT
  return placement as LuxorContractSignaturePlacement
}
