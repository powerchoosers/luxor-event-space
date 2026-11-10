begin;
create table if not exists public.luxor_recurring_cost_ai_summaries (
 template_id uuid primary key references public.luxor_expense_templates(id) on delete cascade,
 summary text, source_bill_id uuid references public.luxor_bills(id) on delete restrict,
 source_fingerprint text, generated_at timestamptz, updated_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(), attempts integer not null default 0
);
alter table public.luxor_recurring_cost_ai_summaries enable row level security;
revoke all on public.luxor_recurring_cost_ai_summaries from public, anon, authenticated;
grant select, insert, update on public.luxor_recurring_cost_ai_summaries to service_role;

-- Only owner-reviewed bills explicitly reconciled to an occurrence qualify.
create or replace function public.luxor_recurring_summary_candidates(p_limit integer default 5)
returns table(template_id uuid, source_bill_id uuid, source_fingerprint text, source_updated_at timestamptz, occurrence_id uuid, occurrence_updated_at timestamptz, source_kind text, provider text, service text, category text)
language sql security definer set search_path = public as $$
 with sources as (
  select p.recurring_template_id as template_id,b.id as bill_id,b.updated_at as bill_updated_at,p.id as occurrence_id,p.updated_at as occurrence_updated_at,
   'occurrence'::text as source_kind,b.provider,b.service,t.category,coalesce(b.due_date,b.issue_date,b.created_at::date) as bill_date,b.created_at as bill_created
  from public.luxor_booking_expenses p
  join public.luxor_expense_templates t on t.id=p.recurring_template_id
  left join public.luxor_booking_expenses linked on linked.id=p.matched_expense_id
  join public.luxor_bills b on b.id=coalesce(p.source_bill_id,linked.source_bill_id)
  where p.recurring_template_id is not null and b.archived_at is null and b.extraction_status='ready' and b.payment_ready_at is not null and b.duplicate_of_bill_id is null
  union all
  select l.template_id,b.id,b.updated_at,l.bill_id,l.confirmed_at,'profile'::text,b.provider,b.service,t.category,coalesce(b.due_date,b.issue_date,b.created_at::date),b.created_at
  from public.luxor_recurring_cost_bill_links l join public.luxor_bills b on b.id=l.bill_id join public.luxor_expense_templates t on t.id=l.template_id
  where b.archived_at is null and b.extraction_status='ready' and b.payment_ready_at is not null and b.duplicate_of_bill_id is null
 ), latest as (
  select distinct on (s.template_id) s.*, s.bill_id::text || ':' || s.bill_updated_at::text || ':' || s.occurrence_id::text || ':' || s.occurrence_updated_at::text as fingerprint
  from sources s order by s.template_id,s.bill_date desc nulls last,s.bill_created desc,s.bill_id desc,s.source_kind asc
 )
 select l.template_id,l.bill_id,l.fingerprint,l.bill_updated_at,l.occurrence_id,l.occurrence_updated_at,l.source_kind,l.provider,l.service,l.category
 from latest l left join public.luxor_recurring_cost_ai_summaries s on s.template_id=l.template_id
 where s.source_fingerprint is distinct from l.fingerprint and (s.lease_until is null or s.lease_until < now())
   and (s.next_attempt_at is null or s.next_attempt_at <= now())
 order by s.updated_at asc nulls first,l.template_id limit greatest(1,least(p_limit,20))
$$;
revoke all on function public.luxor_recurring_summary_candidates(integer) from public, anon, authenticated;
grant execute on function public.luxor_recurring_summary_candidates(integer) to service_role;

create or replace function public.luxor_claim_recurring_summary(p_template_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
 insert into public.luxor_recurring_cost_ai_summaries(template_id,lease_token,lease_until,attempts)
 values(p_template_id,p_token,now()+interval '2 minutes',1)
 on conflict(template_id) do update set lease_token=p_token,lease_until=now()+interval '2 minutes',attempts=public.luxor_recurring_cost_ai_summaries.attempts+1
 where (public.luxor_recurring_cost_ai_summaries.lease_until is null or public.luxor_recurring_cost_ai_summaries.lease_until < now()) and public.luxor_recurring_cost_ai_summaries.next_attempt_at <= now();
 get diagnostics changed = row_count; return changed=1;
end $$;
revoke all on function public.luxor_claim_recurring_summary(uuid,uuid) from public, anon, authenticated;
grant execute on function public.luxor_claim_recurring_summary(uuid,uuid) to service_role;
commit;
