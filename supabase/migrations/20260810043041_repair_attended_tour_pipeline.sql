with repaired_inquiries as (
  update public.luxor_inquiries
  set pipeline_stage = 'proposal',
      updated_at = now()
  where tour_attendance_status = 'attended'
    and status in ('new', 'contacted', 'tour_requested', 'tour_confirmed')
    and coalesce(pipeline_stage, 'inquiry') in ('inquiry', 'tour')
  returning id
)
update public.luxor_lead_events as event
set status = 'tour_confirmed',
    pipeline_stage = 'proposal',
    updated_at = now()
from repaired_inquiries as inquiry
where event.inquiry_id = inquiry.id
  and event.is_primary = true
  and event.status in ('new', 'contacted', 'tour_requested', 'tour_confirmed')
  and coalesce(event.pipeline_stage, 'inquiry') in ('inquiry', 'tour');
