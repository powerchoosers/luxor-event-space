-- Manual, idempotent backfill for Luxor call ↔ contact links by phone (E.164).
-- Not applied by Supabase migrations. Nia should review the dry-run preview first.
--
-- Dry run (preview only):
--   Run the SELECT below.
--
-- Apply (idempotent; only unlinked calls with a unique contact match):
--   Run the UPDATE below after the preview looks right.

-- === DRY RUN: calls that would link ===
select
  c.id as call_id,
  c.twilio_call_sid,
  c.direction,
  c.created_at,
  c.contact_name as current_contact_name,
  public.luxor_call_external_party_phone(
    c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
  ) as external_phone,
  case
    when r.match_count = 1 and r.inquiry_id is not null then 'inquiry'
    when r.match_count = 1 and r.vendor_id is not null then 'vendor'
    when r.match_count > 1 then 'ambiguous'
    else 'no_match'
  end as link_result,
  r.contact_name as would_link_name,
  r.inquiry_id as would_link_inquiry_id,
  r.vendor_id as would_link_vendor_id,
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

-- === APPLY (run only after preview review) ===
update public.luxor_calls c
set
  inquiry_id = r.inquiry_id,
  vendor_id = r.vendor_id,
  contact_name = case
    when public.luxor_should_refresh_call_contact_name(
      c.contact_name,
      public.luxor_call_external_party_phone(
        c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
      )
    ) then r.contact_name
    else c.contact_name
  end,
  updated_at = greatest(clock_timestamp(), c.updated_at + interval '1 millisecond')
from lateral public.luxor_resolve_call_contact_by_phone(
  public.luxor_call_external_party_phone(
    c.direction, c.caller_number, c.from_number, c.callee_number, c.to_number
  )
) r
where c.inquiry_id is null
  and c.vendor_id is null
  and r.match_count = 1;