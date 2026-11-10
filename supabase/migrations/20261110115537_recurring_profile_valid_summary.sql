-- Show a summary only while its source is still the latest eligible confirmed bill.
create or replace function public.luxor_recurring_profile_valid_summary(p_template_id uuid)
returns table(summary text, source_bill_id uuid, generated_at timestamptz, updated_at timestamptz)
language sql security definer set search_path = public as $$
  with sources as (
    select b.id as bill_id, b.updated_at as bill_updated_at, p.id as occurrence_id,
      p.updated_at as occurrence_updated_at, 'occurrence'::text as source_kind,
      coalesce(b.due_date,b.issue_date,b.created_at::date) as bill_date,b.created_at as bill_created
    from public.luxor_booking_expenses p
    left join public.luxor_booking_expenses linked on linked.id=p.matched_expense_id
    join public.luxor_bills b on b.id=coalesce(p.source_bill_id,linked.source_bill_id)
    where p.recurring_template_id=p_template_id and b.archived_at is null
      and b.extraction_status='ready' and b.payment_ready_at is not null and b.duplicate_of_bill_id is null
    union all
    select b.id,b.updated_at,l.bill_id,l.confirmed_at,'profile'::text,
      coalesce(b.due_date,b.issue_date,b.created_at::date),b.created_at
    from public.luxor_recurring_cost_bill_links l
    join public.luxor_bills b on b.id=l.bill_id
    where l.template_id=p_template_id and b.archived_at is null
      and b.extraction_status='ready' and b.payment_ready_at is not null and b.duplicate_of_bill_id is null
  ), latest as (
    select s.*,s.bill_id::text || ':' || s.bill_updated_at::text || ':' || s.occurrence_id::text || ':' || s.occurrence_updated_at::text as fingerprint
    from sources s order by s.bill_date desc nulls last,s.bill_created desc,s.bill_id desc,s.source_kind asc limit 1
  )
  select a.summary,a.source_bill_id,a.generated_at,a.updated_at
  from latest l join public.luxor_recurring_cost_ai_summaries a on a.template_id=p_template_id
    and a.source_bill_id=l.bill_id and a.source_fingerprint=l.fingerprint
  where a.summary is not null and a.generated_at is not null
$$;
revoke all on function public.luxor_recurring_profile_valid_summary(uuid) from public, anon, authenticated;
grant execute on function public.luxor_recurring_profile_valid_summary(uuid) to service_role;
