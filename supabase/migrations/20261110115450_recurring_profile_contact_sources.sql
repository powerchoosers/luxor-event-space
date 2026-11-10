-- Include both owner-confirmed profile associations and reconciled occurrences.
create or replace function public.luxor_recurring_profile_latest_bill(p_template_id uuid)
returns table(source_bill_id uuid, extracted_fields jsonb)
language sql security definer set search_path = public as $$
  with sources as (
    select b.id, b.extracted_fields, b.due_date, b.issue_date, b.created_at
    from public.luxor_booking_expenses p
    left join public.luxor_booking_expenses linked on linked.id = p.matched_expense_id
    join public.luxor_bills b on b.id = coalesce(p.source_bill_id, linked.source_bill_id)
    where p.recurring_template_id = p_template_id and b.archived_at is null
      and b.extraction_status = 'ready' and b.payment_ready_at is not null and b.duplicate_of_bill_id is null
    union all
    select b.id, b.extracted_fields, b.due_date, b.issue_date, b.created_at
    from public.luxor_recurring_cost_bill_links l
    join public.luxor_bills b on b.id = l.bill_id
    where l.template_id = p_template_id and b.archived_at is null
      and b.extraction_status = 'ready' and b.payment_ready_at is not null and b.duplicate_of_bill_id is null
  )
  select s.id, s.extracted_fields from sources s
  order by coalesce(s.due_date, s.issue_date, s.created_at::date) desc nulls last, s.created_at desc, s.id desc
  limit 1
$$;
