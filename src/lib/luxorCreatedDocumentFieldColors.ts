import type { PortalStatusTone } from '@/components/portal/PortalUI'
import { LUXOR_SIGNER_ROLE_TONES, roleToneForIndex } from './luxorCreatedDocumentFieldTypes'

export function signerRoleTintClass(tone: PortalStatusTone) {
  const map: Record<PortalStatusTone, string> = {
    gold: 'bg-[#caa24c]/18 border-[#caa24c]/45',
    blue: 'bg-sky-500/12 border-sky-500/35',
    green: 'bg-emerald-500/12 border-emerald-500/35',
    purple: 'bg-violet-500/12 border-violet-500/35',
    red: 'bg-rose-500/12 border-rose-500/35',
    warning: 'bg-amber-500/15 border-amber-500/35',
    neutral: 'bg-[color:var(--portal-soft)] border-[color:var(--portal-border)]',
  }
  return map[tone]
}

export function toneForRoleKey(roleKey: string, roleOrder: string[]) {
  const index = roleOrder.indexOf(roleKey)
  return roleToneForIndex(index >= 0 ? index : 0)
}

export const SIGNER_ROLE_TONES = LUXOR_SIGNER_ROLE_TONES