'use client'

import { useState } from 'react'
import { ToastProvider } from '@/components/portal/ToastProvider'
import { PortalBulkConfirmDialog } from '@/components/portal/PortalBulkSelection'
import { LuxorCrmRecordCard, LuxorCrmSecondaryAction } from '@/components/portal/LuxorCrmRecordCard'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { canReopenLuxorTourCompletion } from '@/lib/luxorTourOutcome'

const fixtureTour = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  full_name: 'Fixture Tour Client',
  email: 'fixture.tour@example.test',
  phone: '+12105551234',
  status: 'tour_confirmed',
  source: 'homepage_brochure',
  flow: 'brochure_lead',
  event_type: 'Quinceañera',
  target_date: '2027-06-14',
  guest_count: 120,
  budget: '$18k',
  preferred_tour_date: '2026-12-04',
  preferred_tour_time: '11:00 AM',
  tour_attendance_status: 'attended',
  pipeline_stage: 'proposal',
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-11-17T12:00:00Z',
  metadata: {},
  marketing_opt_in: true,
  message: 'Synthetic lead for portal QA only.',
} as unknown as LuxorInquiry

const todayKey = '2026-11-17'

export default function TourReopenQaPreview({ showConfirm = false }: { showConfirm?: boolean }) {
  const [open, setOpen] = useState(showConfirm)
  const canReopen = canReopenLuxorTourCompletion(fixtureTour, todayKey)
  return (
    <ToastProvider>
      <main className="mx-auto min-h-screen max-w-lg bg-[color:var(--portal-bg)] p-5">
        <p className="mb-4 text-xs text-[color:var(--portal-muted)]">Portal leads · Tours · synthetic fixture</p>
        <LuxorCrmRecordCard
          lead={fixtureTour}
          listFlush
          badges={[{ label: 'Completed', tone: 'green' }]}
          subtitle={<>Quinceañera · June 14, 2027 · 120 guests</>}
          contact={fixtureTour.email}
          className="border border-[color:var(--portal-border)]"
          onOpen={() => undefined}
          interactionLabel="Fixture tour card"
        >
          <div className="space-y-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Tour time</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">December 4, 2026</p>
              <p className="text-xs text-[color:var(--portal-muted)]">11:00 AM · Central</p>
            </div>
            {canReopen ? (
              <LuxorCrmSecondaryAction className="w-full" onClick={() => setOpen(true)}>
                Reopen tour
              </LuxorCrmSecondaryAction>
            ) : null}
          </div>
        </LuxorCrmRecordCard>
        <PortalBulkConfirmDialog
          open={open}
          title="Reopen this tour?"
          description="This removes the completed visit mark, returns the lead to the tour stage, and cancels post-tour follow-ups that have not sent yet. Nothing is deleted and no email sends."
          confirmLabel="Reopen tour"
          busy={false}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      </main>
    </ToastProvider>
  )
}