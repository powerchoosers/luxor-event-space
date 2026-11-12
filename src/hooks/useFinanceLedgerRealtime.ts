'use client'

import { useEffect, useRef } from 'react'
import { getPortalSupabaseClient } from '@/lib/supabaseClient'

let channelSerial = 0

const FINANCE_TABLES = [
  'luxor_payments',
  'luxor_payment_refunds',
  'luxor_payment_installments',
  'luxor_invoices',
  'luxor_bills',
  'luxor_booking_expenses',
  'luxor_expense_payments',
] as const

/** One coalesced reload after a real ledger change. No interval and no refetch on focus. */
export function useFinanceLedgerRealtime(enabled: boolean, onChange: () => void) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!enabled) return
    const supabase = getPortalSupabaseClient()
    if (!supabase) return

    let active = true
    let timer: number | null = null
    const schedule = () => {
      if (!active || document.visibilityState !== 'visible') return
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        if (active && document.visibilityState === 'visible') onChangeRef.current()
      }, 400)
    }

    const channel = supabase.channel(`luxor-finance-ledger-${++channelSerial}`)
    for (const table of FINANCE_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule)
    }
    void channel.subscribe()

    return () => {
      active = false
      if (timer !== null) window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [enabled])
}
