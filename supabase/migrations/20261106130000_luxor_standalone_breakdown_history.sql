-- Informational comparisons have no invoice, proposal family, or booking lifecycle.
-- Some production databases predate the original composite event index.
create unique index if not exists luxor_lead_events_id_inquiry_idx
  on public.luxor_lead_events(id, inquiry_id);
create table public.luxor_proposal_breakdowns (
  id uuid primary key,
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete restrict,
  lead_event_id uuid,
  recipient_email text not null check (length(recipient_email) between 3 and 254),
  recipient_name text not null,
  subject text not null,
  html text not null,
  selection jsonb not null check (jsonb_typeof(selection) = 'object'),
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot) = 'object'),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  actor_email text not null,
  provider text not null check (provider in ('resend', 'zoho')),
  created_at timestamptz not null default now(),
  delivery_state text not null default 'prepared' check (delivery_state in ('prepared', 'sending', 'sent', 'delivery_unconfirmed')),
  delivery_started_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  error_message text,
  constraint luxor_breakdowns_lead_event_fk foreign key (lead_event_id, inquiry_id)
    references public.luxor_lead_events(id, inquiry_id) on delete restrict,
  constraint luxor_breakdowns_receipt_check check (
    (delivery_state = 'prepared' and delivery_started_at is null and sent_at is null)
    or (delivery_state in ('sending', 'delivery_unconfirmed') and delivery_started_at is not null and sent_at is null)
    or (delivery_state = 'sent' and delivery_started_at is not null and sent_at is not null)
  )
);
create index luxor_proposal_breakdowns_inquiry_created_idx
  on public.luxor_proposal_breakdowns(inquiry_id, created_at desc, id);
alter table public.luxor_proposal_breakdowns enable row level security;
revoke all on public.luxor_proposal_breakdowns from public, anon, authenticated, service_role;
grant select, insert, update on public.luxor_proposal_breakdowns to service_role;

create function public.luxor_guard_breakdown_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Breakdown history cannot be deleted.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.delivery_state <> 'prepared' then
      raise exception 'A breakdown must begin prepared.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.luxor_inquiries q where q.id = new.inquiry_id and coalesce(q.is_test, false) = false
      and q.id <> '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
      and coalesce(q.metadata ->> 'is_test_record', 'false') <> 'true') then
      raise exception 'A production lead is required for breakdown delivery.' using errcode = '23514';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - array['delivery_state','delivery_started_at','sent_at','provider_message_id','error_message'])
     is distinct from (to_jsonb(old) - array['delivery_state','delivery_started_at','sent_at','provider_message_id','error_message']) then
    raise exception 'The saved breakdown content is immutable.' using errcode = '23514';
  end if;
  if old.delivery_started_at is not null and new.delivery_started_at is distinct from old.delivery_started_at then
    raise exception 'The original delivery start must be retained.' using errcode = '23514';
  end if;
  if old.delivery_state = 'sent' and new is distinct from old then
    raise exception 'The saved breakdown receipt is immutable.' using errcode = '23514';
  end if;
  if new.delivery_state is distinct from old.delivery_state and not (
    (old.delivery_state = 'prepared' and new.delivery_state = 'sending')
    or (old.delivery_state = 'sending' and new.delivery_state in ('sent', 'delivery_unconfirmed'))
    or (old.delivery_state = 'delivery_unconfirmed' and new.delivery_state = 'sent')
  ) then
    raise exception 'Invalid breakdown delivery transition.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.luxor_guard_breakdown_history() from public, anon, authenticated;
grant execute on function public.luxor_guard_breakdown_history() to service_role;
create trigger luxor_breakdown_history_guard before insert or update or delete
  on public.luxor_proposal_breakdowns for each row execute function public.luxor_guard_breakdown_history();
