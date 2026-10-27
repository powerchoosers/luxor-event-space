-- Restrict the scan to the exact brochure link and support date and lead lookups.
create index luxor_resend_brochure_click_date_idx on public.luxor_resend_events (received_at, provider_email_id)
  where event_type = 'email.clicked' and payload #>> '{data,click,link}' = 'https://www.luxoratlaspalmas.com/api/brochure/download';
create index luxor_resend_brochure_click_provider_idx on public.luxor_resend_events (provider_email_id, received_at)
  where event_type = 'email.clicked' and payload #>> '{data,click,link}' = 'https://www.luxoratlaspalmas.com/api/brochure/download';
create index luxor_mail_messages_email_job_idx on public.luxor_mail_messages ((metadata->>'emailJobId'))
  where provider = 'resend' and metadata ? 'emailJobId';

create function public.luxor_brochure_clicks(p_start date, p_end date, p_inquiry_id uuid, p_excluded_ids uuid[])
returns table(lead_count bigint, click_count bigint, latest_clicked_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select count(distinct j.inquiry_id), count(distinct e.event_id), max(e.received_at)
  from public.luxor_resend_events e
  join public.luxor_mail_messages m on m.provider = 'resend' and m.provider_id = e.provider_email_id
  join public.luxor_email_jobs j on j.id::text = m.metadata->>'emailJobId' and m.metadata ? 'emailJobId'
  join public.luxor_inquiries i on i.id = j.inquiry_id
  where e.event_type = 'email.clicked'
    and e.payload #>> '{data,click,link}' = 'https://www.luxoratlaspalmas.com/api/brochure/download'
    and e.received_at >= (p_start::timestamp at time zone 'America/Chicago') and e.received_at < ((p_end + 1)::timestamp at time zone 'America/Chicago')
    and (p_inquiry_id is null or j.inquiry_id = p_inquiry_id)
    and not (j.inquiry_id = any(coalesce(p_excluded_ids, '{}'::uuid[])))
    and j.test_run_id is null and not coalesce(i.is_test, false)
    and i.metadata->'is_test_record' is distinct from 'true'::jsonb;
$$;
revoke all on function public.luxor_brochure_clicks(date, date, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.luxor_brochure_clicks(date, date, uuid, uuid[]) to service_role;
