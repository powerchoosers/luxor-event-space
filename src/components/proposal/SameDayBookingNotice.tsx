'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SAME_DAY_BOOKING_TERMS, SAME_DAY_CARD_CUTOFF_TERMS, type LuxorSameDayBookingSnapshot } from '@/lib/luxorSameDayBooking'

export function SameDayBookingNotice({ benefit, completed = false, review = false, onExpire }: {
  benefit: LuxorSameDayBookingSnapshot; completed?: boolean; review?: boolean; onExpire?: () => void
}) {
  const router = useRouter()
  const [expired, setExpired] = useState(benefit.status === 'expired')
  useEffect(() => {
    if (completed || expired || benefit.coverage_amount <= 0) return
    const check = () => {
      if (Date.now() >= new Date(benefit.expires_at).getTime()) {
        setExpired(true)
        onExpire?.()
        router.refresh()
      }
    }
    const delay = new Date(benefit.expires_at).getTime() - Date.now()
    const timer = window.setTimeout(check, Math.max(0, Math.min(delay, 2_147_483_647)))
    window.addEventListener('focus', check)
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', check) }
  }, [benefit.expires_at, benefit.coverage_amount, completed, expired, onExpire, router])
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(benefit.original_created_at))
  return <div className="space-y-2 text-sm leading-6" role="status">
    <p className="font-semibold">{benefit.name}</p>
    <p>{review ? 'Payment received — owner review required. Please do not pay again. Your date is pending.' : completed ? 'Qualified: the signed agreement and initial booking payment were completed on time.' : benefit.coverage_amount <= 0 && benefit.status === 'expired' ? `Expired benefit removed from this revised price. Applicable sales tax is payable by the client; compatible discounts remain. Original proposal date: ${date}.` : expired ? 'Expired. Revised pricing and a fresh agreement are required before payment.' : `Conditional until midnight America/Chicago on ${date}.`}</p>
    {benefit.coverage_amount > 0 && <p>{SAME_DAY_BOOKING_TERMS}</p>}
    {!completed && benefit.coverage_amount > 0 && <p>{SAME_DAY_CARD_CUTOFF_TERMS}</p>}
  </div>
}
