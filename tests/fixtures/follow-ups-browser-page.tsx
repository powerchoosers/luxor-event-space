'use client'

import { useState } from 'react'
import FollowUpsTab from '@/components/portal/FollowUpsTab'
import { ToastProvider } from '@/components/portal/ToastProvider'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

const leads = [
  { id: '11111111-1111-4111-8111-111111111111', full_name: 'Synthetic Demo', email: 'demo@example.test', phone: '+12105550101', status: 'new', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Wedding', target_date: '2027-06-14', guest_count: 90, budget: '$10k', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z', metadata: {}, marketing_opt_in: true, message: 'Fixture only' },
  { id: '22222222-2222-4222-8222-222222222222', full_name: 'Synthetic Demo', email: 'demo@example.test', phone: '+12105550102', status: 'new', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Wedding', target_date: '2027-06-14', guest_count: 90, budget: '$10k', created_at: '2026-10-02T12:00:00Z', updated_at: '2026-10-02T12:00:00Z', metadata: {}, marketing_opt_in: true, message: 'Fixture only' },
  { id: '33333333-3333-4333-8333-333333333333', full_name: 'Synthetic No Phone', email: 'nophone@example.test', phone: null, status: 'new', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Birthday', target_date: '2027-08-01', guest_count: 40, budget: null, created_at: '2026-10-03T12:00:00Z', updated_at: '2026-10-03T12:00:00Z', metadata: {}, marketing_opt_in: false, message: 'Fixture only' },
  { id: '44444444-4444-4444-8444-444444444444', full_name: 'Synthetic Post Tour', email: 'tour@example.test', phone: '+12105550104', status: 'tour_confirmed', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Quinceañera', target_date: '2027-09-03', guest_count: 120, budget: '$20k', tour_attendance_status: 'attended', created_at: '2026-10-04T12:00:00Z', updated_at: '2026-10-04T12:00:00Z', metadata: {}, marketing_opt_in: true, message: 'Fixture only' },
  { id: '55555555-5555-4555-8555-555555555555', full_name: 'Synthetic Paused', email: 'paused@example.test', phone: '+12105550105', status: 'new', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Wedding', target_date: '2027-10-03', guest_count: 50, budget: null, created_at: '2026-10-05T12:00:00Z', updated_at: '2026-10-05T12:00:00Z', metadata: {}, marketing_opt_in: true, message: 'Fixture only' },
] as unknown as LuxorInquiry[]

export default function FollowUpsQaPage() {
  const [currentLeads, setCurrentLeads] = useState(leads)
  async function refreshLeads() {
    const response = await fetch('/api/inquiries', { cache: 'no-store' })
    if (!response.ok) throw new Error('Synthetic lead refresh failed.')
    setCurrentLeads(await response.json() as LuxorInquiry[])
  }
  return <ToastProvider><main className="mx-auto min-h-screen max-w-7xl bg-[#f7f3ec] p-6 text-[#241d17]"><FollowUpsTab leads={currentLeads} onLeadsRefresh={refreshLeads} /></main></ToastProvider>
}
