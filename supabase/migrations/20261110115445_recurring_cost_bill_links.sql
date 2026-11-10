begin;
create table public.luxor_recurring_cost_bill_links (
 bill_id uuid primary key references public.luxor_bills(id) on delete restrict,
 template_id uuid not null references public.luxor_expense_templates(id) on delete restrict,
 confirmed_at timestamptz not null default now(), confirmed_by text not null,
 check (length(trim(confirmed_by)) > 0)
);
create index luxor_recurring_cost_bill_links_template_idx on public.luxor_recurring_cost_bill_links(template_id);
alter table public.luxor_recurring_cost_bill_links enable row level security;
revoke all on public.luxor_recurring_cost_bill_links from public, anon, authenticated;
grant select, insert on public.luxor_recurring_cost_bill_links to service_role;
create or replace function public.luxor_confirm_recurring_profile_bill(p_template_id uuid,p_bill_id uuid,p_template_updated_at timestamptz,p_bill_updated_at timestamptz,p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare b public.luxor_bills%rowtype; t public.luxor_expense_templates%rowtype; prior uuid;
begin
 if nullif(trim(p_actor),'') is null or p_template_updated_at is null or p_bill_updated_at is null then raise exception 'Refresh and review the bill first.' using errcode='22023'; end if;
 select * into t from public.luxor_expense_templates where id=p_template_id for update;
 if not found or not t.is_active then raise exception 'Recurring cost is unavailable.' using errcode='55000'; end if;
 select * into b from public.luxor_bills where id=p_bill_id for update;
 if not found or b.archived_at is not null or b.extraction_status is distinct from 'ready' or b.payment_ready_at is null or b.duplicate_of_bill_id is not null then raise exception 'Approve this bill before adding it to a cost profile.' using errcode='55000'; end if;
 if t.updated_at is distinct from p_template_updated_at or b.updated_at is distinct from p_bill_updated_at then raise exception 'The bill or recurring cost changed. Refresh and review again.' using errcode='40001'; end if;
 if exists (select 1 from public.luxor_booking_expenses e where e.source_bill_id=b.id and (e.booking_id is not null or e.expense_type='event' or (e.recurring_template_id is not null and e.recurring_template_id<>t.id))) or exists (select 1 from public.luxor_booking_expenses p join public.luxor_booking_expenses e on e.id=p.matched_expense_id where e.source_bill_id=b.id and p.recurring_template_id<>t.id) then raise exception 'This bill is associated with a different cost or event.' using errcode='55000'; end if;
 select template_id into prior from public.luxor_recurring_cost_bill_links where bill_id=b.id;
 if prior is not null and prior<>t.id then raise exception 'This bill already belongs to another cost profile.' using errcode='23505'; end if;
 insert into public.luxor_recurring_cost_bill_links(bill_id,template_id,confirmed_by) values(b.id,t.id,lower(trim(p_actor))) on conflict(bill_id) do nothing;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.luxor_confirm_recurring_profile_bill(uuid,uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.luxor_confirm_recurring_profile_bill(uuid,uuid,timestamptz,timestamptz,text) to service_role;
-- An approved incoming bill can inherit a profile association only from an
-- earlier human-confirmed bill with the same sender, company and service.
create or replace function public.luxor_autolink_recurring_profile_bills(p_limit integer default 10)
returns integer language plpgsql security definer set search_path=public as $$
declare inserted integer;
begin
 with possible as (
  select b.id, min(l.template_id::text)::uuid as template_id
  from public.luxor_bills b
  join public.luxor_bills prior on prior.id<>b.id and lower(trim(prior.source_sender))=lower(trim(b.source_sender))
   and lower(trim(prior.provider))=lower(trim(b.provider)) and lower(trim(prior.service))=lower(trim(b.service))
  join public.luxor_recurring_cost_bill_links l on l.bill_id=prior.id and l.confirmed_by not like 'automation:%'
  join public.luxor_expense_templates t on t.id=l.template_id and t.is_active
  where b.source_type='email' and prior.source_type='email' and nullif(trim(b.source_sender),'') is not null
   and nullif(trim(b.provider),'') is not null and nullif(trim(b.service),'') is not null
   and b.archived_at is null and b.extraction_status='ready' and b.payment_ready_at is not null and b.duplicate_of_bill_id is null
   and prior.archived_at is null and prior.extraction_status='ready' and prior.payment_ready_at is not null and prior.duplicate_of_bill_id is null
   and not exists (select 1 from public.luxor_recurring_cost_bill_links existing where existing.bill_id=b.id)
   and not exists (select 1 from public.luxor_booking_expenses e where e.source_bill_id=b.id and (e.booking_id is not null or e.expense_type='event' or e.recurring_template_id is not null))
   and not exists (select 1 from public.luxor_booking_expenses p join public.luxor_booking_expenses e on e.id=p.matched_expense_id where e.source_bill_id=b.id)
  group by b.id having count(distinct l.template_id)=1
  order by b.id limit greatest(1,least(p_limit,50))
 ), saved as (
  insert into public.luxor_recurring_cost_bill_links(bill_id,template_id,confirmed_by)
  select id,template_id,'automation:confirmed-history' from possible on conflict(bill_id) do nothing returning 1
 ) select count(*) into inserted from saved;
 return inserted;
end $$;
revoke all on function public.luxor_autolink_recurring_profile_bills(integer) from public,anon,authenticated;
grant execute on function public.luxor_autolink_recurring_profile_bills(integer) to service_role;

commit;
