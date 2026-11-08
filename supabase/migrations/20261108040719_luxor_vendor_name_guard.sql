begin;
-- Preserve existing duplicates for review; prevent new ambiguous names across all vendor types.
-- This uses the same normalized advisory key as luxor_link_bill_company.
create function public.luxor_guard_vendor_name() returns trigger
language plpgsql set search_path = public as $$
declare normalized text;
begin
  normalized := lower(regexp_replace(btrim(coalesce(new.name,'')), '\s+', ' ', 'g'));
  if normalized = '' or length(normalized) > 200 then
    raise exception 'Enter a vendor name.' using errcode='22023';
  end if;
  if tg_op = 'UPDATE' and normalized = lower(regexp_replace(btrim(coalesce(old.name,'')), '\s+', ' ', 'g')) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('luxor-company:' || normalized, 0));
  if exists (select 1 from public.luxor_vendors where id is distinct from new.id and lower(regexp_replace(btrim(coalesce(name,'')), '\s+', ' ', 'g')) = normalized) then
    raise exception 'A vendor with this name already exists. Review the existing vendor.' using errcode='23505';
  end if;
  return new;
end $$;
create trigger luxor_vendor_name_guard before insert or update of name on public.luxor_vendors
  for each row execute function public.luxor_guard_vendor_name();
revoke all on function public.luxor_guard_vendor_name() from public,anon,authenticated;
commit;
