'use client'

import { PortalDatePicker, PortalSelect } from './PortalUI'
import type { LuxorPromotion } from '@/lib/luxorInquiryTypes'

export type PromotionTermsDraft = {
  expires_on?: string | null
  expirationMode?: 'date' | 'none'
  complimentary_item?: string | null
  complimentary_scope?: LuxorPromotion['complimentary_scope']
  complimentary_item_id?: string | null
}

const vendorOptions = [
  ['essential_decor', 'Essential Decor'], ['full_decor', 'Full Decor & Planning'],
  ['buffet_catering', 'Buffet catering'], ['plated_catering', 'Plated catering'], ['dj', 'DJ (6 hours)'],
  ['photo_booth_signature', 'Signature Photo Booth'], ['photo_booth_celebration', 'Celebration Photo Booth'], ['photo_booth_forever', 'Forever Photo Booth'],
  ['bartender_service', 'Bartender service'], ['byob_signature', 'Signature BYOB bar'], ['byob_premium', 'Premium BYOB bar'], ['byob_non_alcoholic', 'Non-alcoholic bar package'],
]

export function PromotionTermsFields({ value, complimentary, onChange }: { value: PromotionTermsDraft; complimentary: boolean; onChange: (patch: PromotionTermsDraft) => void }) {
  const dated = value.expirationMode === 'date' || (value.expirationMode !== 'none' && Boolean(value.expires_on))
  const inputClass = 'min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/10'
  return <div className="space-y-4">
    <label className="block space-y-1.5"><span className="text-xs font-semibold text-[color:var(--portal-muted)]">Promotion expiration</span><PortalSelect value={dated ? 'date' : 'none'} onChange={mode => onChange({expirationMode: mode as 'date' | 'none', expires_on: mode === 'none' ? null : value.expires_on || ''})} options={[{value:'none', label:'No expiration'}, {value:'date', label:'Expiration date'}]} /></label>
    {dated ? <PortalDatePicker value={value.expires_on || ''} onChange={date => onChange({expires_on: date})} placeholder="Choose expiration date" /> : null}
    {complimentary ? <>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-[color:var(--portal-muted)]">Service provider</span><PortalSelect value={value.complimentary_scope || 'vendor'} onChange={scope => onChange({complimentary_scope: scope as 'luxor' | 'vendor', complimentary_item_id: null})} options={[{value:'vendor', label:'Preferred vendor'}, {value:'luxor', label:'Luxor'}]} /></label>
      {(value.complimentary_scope || 'vendor') === 'vendor' ? <label className="block space-y-1.5"><span className="text-xs font-semibold text-[color:var(--portal-muted)]">Complimentary service</span><PortalSelect value={value.complimentary_item_id || ''} onChange={id => onChange({complimentary_item_id: id || null, complimentary_item: vendorOptions.find(([key]) => 'preferred-vendor-' + key === id)?.[1] || ''})} options={[{value:'', label:'Other service or item'}, ...vendorOptions.map(([id,label]) => ({value:'preferred-vendor-' + id,label}))]} /></label> : null}
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-[color:var(--portal-muted)]">Item / service name</span><input className={inputClass} value={value.complimentary_item || ''} onChange={event => onChange({complimentary_item: event.target.value})} placeholder="Videography" /></label>
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">The regular value is shown with a $0 promotional value. A vendor benefit never reduces Luxor charges.</p>
    </> : null}
  </div>
}
