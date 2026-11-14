-- Link luxor_calls to a single matching lead (luxor_inquiries) or vendor (luxor_vendors)
-- by normalized E.164 phone on the external party number. Ambiguous matches stay unlinked.

alter table public.luxor_calls
  add column if not exists vendor_id uuid references public.luxor_vendors(id) on delete set null;

create index if not exists luxor_calls_vendor_created_idx
  on public.luxor_calls (vendor_id, created_at desc)
  where vendor_id is not null;

create or replace function public.luxor_call_external_party_phone(
  p_direction text,
  p_caller_number text,
  p_from_number text,
  p_callee_number text,
  p_to_number text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.luxor_workflow_normalize_phone(
    case
      when p_direction = 'inbound' then coalesce(nullif(btrim(p_caller_number), ''), nullif(btrim(p_from_number), ''))
      else coalesce(nullif(btrim(p_callee_number), ''), nullif(btrim(p_to_number), ''))
    end
  );
$$;

create or replace function public.luxor_resolve_call_contact_by_phone(p_phone text)
returns table (
  inquiry_id uuid,
  vendor_id uuid,
  contact_name text,
  match_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_inquiry_count integer := 0;
  v_vendor_count integer := 0;
  v_inquiry_id uuid;
  v_vendor_id uuid;
  v_inquiry_name text;
  v_vendor_name text;
begin
  v_phone := public.luxor_workflow_normalize_phone(p_phone);
  if v_phone is null then
    inquiry_id := null;
    vendor_id := null;
    contact_name := null;
    match_count := 0;
    return next;
    return;
  end if;

  select count(*)::integer,
         (array_agg(i.id order by i.created_at, i.id))[1],
         (array_agg(i.full_name order by i.created_at, i.id))[1]
    into v_inquiry_count, v_inquiry_id, v_inquiry_name
  from public.luxor_inquiries i
  where public.luxor_workflow_normalize_phone(i.phone) = v_phone
    and not coalesce(i.is_test, false)
    and lower(coalesce(i.metadata->>'is_test_record', 'false')) <> 'true'
    and i.archived_at is null;

  select count(*)::integer,
         (array_agg(v.id order by v.created_at, v.id))[1],
         (array_agg(v.name order by v.created_at, v.id))[1]
    into v_vendor_count, v_vendor_id, v_vendor_name
  from public.luxor_vendors v
  where public.luxor_workflow_normalize_phone(v.phone) = v_phone
    and v.archived_at is null;

  if v_inquiry_count + v_vendor_count <> 1 then
    inquiry_id := null;
    vendor_id := null;
    contact_name := null;
    match_count := v_inquiry_count + v_vendor_count;
    return next;
    return;
  end if;

  if v_inquiry_count = 1 then
    inquiry_id := v_inquiry_id;
    vendor_id := null;
    contact_name := v_inquiry_name;
  else
    inquiry_id := null;
    vendor_id := v_vendor_id;
    contact_name := v_vendor_name;
  end if;
  match_count := 1;
  return next;
end;
$$;

create or replace function public.luxor_should_refresh_call_contact_name(p_name text, p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_name is null
    or btrim(p_name) = ''
    or lower(btrim(p_name)) in ('unknown caller', 'unknown', 'caller', 'anonymous caller')
    or public.luxor_workflow_normalize_phone(p_name) is not distinct from public.luxor_workflow_normalize_phone(p_phone);
$$;

create or replace function public.luxor_apply_phone_match_to_call_row(p_call public.luxor_calls)
returns public.luxor_calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  r record;
  v_row public.luxor_calls := p_call;
begin
  if v_row.inquiry_id is not null then
    return v_row;
  end if;
  if v_row.vendor_id is not null then
    return v_row;
  end if;

  v_phone := public.luxor_call_external_party_phone(
    v_row.direction, v_row.caller_number, v_row.from_number, v_row.callee_number, v_row.to_number
  );
  if v_phone is null then
    return v_row;
  end if;

  select * into r
  from public.luxor_resolve_call_contact_by_phone(v_phone)
  limit 1;

  if r.match_count <> 1 then
    return v_row;
  end if;

  v_row.inquiry_id := r.inquiry_id;
  v_row.vendor_id := r.vendor_id;
  if public.luxor_should_refresh_call_contact_name(v_row.contact_name, v_phone) then
    v_row.contact_name := r.contact_name;
  end if;
  return v_row;
end;
$$;

create or replace function public.luxor_calls_apply_contact_link_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new := public.luxor_apply_phone_match_to_call_row(new);
  return new;
end;
$$;

drop trigger if exists luxor_calls_apply_contact_link on public.luxor_calls;
create trigger luxor_calls_apply_contact_link
  before insert or update of direction, caller_number, from_number, callee_number, to_number, inquiry_id, vendor_id
  on public.luxor_calls
  for each row
  execute function public.luxor_calls_apply_contact_link_trg();

create or replace function public.luxor_relink_unlinked_calls_for_phone(p_phone text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  r record;
  v_updated integer := 0;
  v_call public.luxor_calls%rowtype;
begin
  v_phone := public.luxor_workflow_normalize_phone(p_phone);
  if v_phone is null then
    return 0;
  end if;

  select * into r
  from public.luxor_resolve_call_contact_by_phone(v_phone)
  limit 1;

  if r.match_count <> 1 then
    return 0;
  end if;

  for v_call in
    select *
    from public.luxor_calls c
    where c.inquiry_id is null
      and c.vendor_id is null
      and public.luxor_call_external_party_phone(
        c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
      ) = v_phone
    for update
  loop
    update public.luxor_calls
      set inquiry_id = r.inquiry_id,
          vendor_id = r.vendor_id,
          contact_name = case
            when public.luxor_should_refresh_call_contact_name(v_call.contact_name, v_phone) then r.contact_name
            else contact_name
          end,
          updated_at = greatest(clock_timestamp(), updated_at + interval '1 millisecond')
      where id = v_call.id;
    v_updated := v_updated + 1;
  end loop;

  return v_updated;
end;
$$;

create or replace function public.luxor_inquiries_relink_calls_phone_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.luxor_relink_unlinked_calls_for_phone(new.phone);
    return new;
  end if;

  if new.phone is distinct from old.phone then
    perform public.luxor_relink_unlinked_calls_for_phone(new.phone);
    if old.phone is not null then
      perform public.luxor_relink_unlinked_calls_for_phone(old.phone);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_inquiries_relink_calls_phone on public.luxor_inquiries;
create trigger luxor_inquiries_relink_calls_phone
  after insert or update of phone
  on public.luxor_inquiries
  for each row
  execute function public.luxor_inquiries_relink_calls_phone_trg();

create or replace function public.luxor_vendors_relink_calls_phone_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.luxor_relink_unlinked_calls_for_phone(new.phone);
    return new;
  end if;

  if new.phone is distinct from old.phone then
    perform public.luxor_relink_unlinked_calls_for_phone(new.phone);
    if old.phone is not null then
      perform public.luxor_relink_unlinked_calls_for_phone(old.phone);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_vendors_relink_calls_phone on public.luxor_vendors;
create trigger luxor_vendors_relink_calls_phone
  after insert or update of phone
  on public.luxor_vendors
  for each row
  execute function public.luxor_vendors_relink_calls_phone_trg();

revoke all on function public.luxor_call_external_party_phone(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.luxor_resolve_call_contact_by_phone(text) from public, anon, authenticated;
revoke all on function public.luxor_should_refresh_call_contact_name(text, text) from public, anon, authenticated;
revoke all on function public.luxor_apply_phone_match_to_call_row(public.luxor_calls) from public, anon, authenticated;
revoke all on function public.luxor_calls_apply_contact_link_trg() from public, anon, authenticated;
revoke all on function public.luxor_relink_unlinked_calls_for_phone(text) from public, anon, authenticated;
revoke all on function public.luxor_inquiries_relink_calls_phone_trg() from public, anon, authenticated;
revoke all on function public.luxor_vendors_relink_calls_phone_trg() from public, anon, authenticated;

grant execute on function public.luxor_call_external_party_phone(text, text, text, text, text) to service_role;
grant execute on function public.luxor_resolve_call_contact_by_phone(text) to service_role;
grant execute on function public.luxor_should_refresh_call_contact_name(text, text) to service_role;
grant execute on function public.luxor_apply_phone_match_to_call_row(public.luxor_calls) to service_role;
grant execute on function public.luxor_calls_apply_contact_link_trg() to service_role;
grant execute on function public.luxor_relink_unlinked_calls_for_phone(text) to service_role;
grant execute on function public.luxor_inquiries_relink_calls_phone_trg() to service_role;
grant execute on function public.luxor_vendors_relink_calls_phone_trg() to service_role;

create or replace function public.luxor_preview_call_contact_backfill()
returns table (
  call_id uuid,
  twilio_call_sid text,
  direction text,
  created_at timestamptz,
  current_contact_name text,
  external_phone text,
  link_result text,
  would_link_name text,
  would_link_inquiry_id uuid,
  would_link_vendor_id uuid,
  match_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.twilio_call_sid,
    c.direction,
    c.created_at,
    c.contact_name,
    public.luxor_call_external_party_phone(
      c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
    ),
    case
      when r.match_count = 1 and r.inquiry_id is not null then 'inquiry'
      when r.match_count = 1 and r.vendor_id is not null then 'vendor'
      when r.match_count > 1 then 'ambiguous'
      else 'no_match'
    end,
    r.contact_name,
    r.inquiry_id,
    r.vendor_id,
    r.match_count
  from public.luxor_calls c
  cross join lateral public.luxor_resolve_call_contact_by_phone(
    public.luxor_call_external_party_phone(
      c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
    )
  ) r
  where c.inquiry_id is null
    and c.vendor_id is null
    and public.luxor_call_external_party_phone(
      c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
    ) is not null
  order by c.created_at desc;
$$;

create or replace function public.luxor_apply_call_contact_backfill()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  with targets as (
    select c.id,
           r.inquiry_id,
           r.vendor_id,
           r.contact_name,
           r.match_count,
           public.luxor_call_external_party_phone(
             c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
           ) as external_phone
    from public.luxor_calls c
    cross join lateral public.luxor_resolve_call_contact_by_phone(
      public.luxor_call_external_party_phone(
        c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
      )
    ) r
    where c.inquiry_id is null
      and c.vendor_id is null
      and r.match_count = 1
  )
  update public.luxor_calls c
    set inquiry_id = t.inquiry_id,
        vendor_id = t.vendor_id,
        contact_name = case
          when public.luxor_should_refresh_call_contact_name(c.contact_name, t.external_phone) then t.contact_name
          else c.contact_name
        end,
        updated_at = greatest(clock_timestamp(), c.updated_at + interval '1 millisecond')
  from targets t
  where c.id = t.id;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.luxor_preview_call_contact_backfill() from public, anon, authenticated;
revoke all on function public.luxor_apply_call_contact_backfill() from public, anon, authenticated;
grant execute on function public.luxor_preview_call_contact_backfill() to service_role;
grant execute on function public.luxor_apply_call_contact_backfill() to service_role;