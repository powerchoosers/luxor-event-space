begin;

create table public.luxor_paid_bill_provider_events (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.luxor_bills(id) on delete restrict,
  vendor_id uuid not null references public.luxor_vendors(id) on delete restrict,
  actor_email text not null check (length(btrim(actor_email)) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table public.luxor_paid_bill_provider_events enable row level security;
revoke all on public.luxor_paid_bill_provider_events from public, anon, authenticated, service_role;
grant select on public.luxor_paid_bill_provider_events to service_role;

-- This action fills a missing association only; it never updates bill facts,
-- readiness, expense records, or payment history. Existing provider and
-- recurring-schedule guards remain in force.
create function public.luxor_link_paid_bill_provider(p_bill_id uuid, p_expected_updated_at timestamptz, p_vendor_id uuid, p_actor_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.luxor_bills; v public.luxor_vendors;
begin
  if p_expected_updated_at is null or p_vendor_id is null or length(btrim(coalesce(p_actor_email, ''))) not between 1 and 200 then
    raise exception 'A provider, current bill version, and actor are required.' using errcode = '22023';
  end if;
  select * into b from public.luxor_bills where id = p_bill_id for update;
  if not found or b.updated_at is distinct from p_expected_updated_at then raise exception 'Bill changed. Reload and try again.' using errcode = '55000'; end if;
  if b.archived_at is not null or b.status <> 'paid' or b.vendor_id is not null then
    raise exception 'Only an active paid bill without a provider can be linked here.' using errcode = '55000';
  end if;
  select * into v from public.luxor_vendors where id = p_vendor_id for share;
  if not found or v.archived_at is not null then raise exception 'Choose an active provider.' using errcode = '55000'; end if;
  update public.luxor_bills set vendor_id = v.id, vendor_link_method = 'owner', updated_at = greatest(clock_timestamp(), b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
  insert into public.luxor_paid_bill_provider_events(bill_id, vendor_id, actor_email) values (b.id, v.id, lower(btrim(p_actor_email)));
  return jsonb_build_object('bill', to_jsonb(b), 'vendor', to_jsonb(v));
end;
$$;
revoke all on function public.luxor_link_paid_bill_provider(uuid,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.luxor_link_paid_bill_provider(uuid,timestamptz,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
