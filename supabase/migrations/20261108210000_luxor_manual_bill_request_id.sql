-- Durable identity for one manual bill save. A lost response can be retried
-- with the same request id instead of inserting a second bill.

alter table public.luxor_bills
  add column if not exists client_request_id uuid,
  add column if not exists client_request_fingerprint text;

do $$ begin
  alter table public.luxor_bills add constraint luxor_bills_create_request_pair_check
    check ((client_request_id is null and client_request_fingerprint is null)
        or (client_request_id is not null and client_request_fingerprint is not null and client_request_fingerprint ~ '^[0-9a-f]{64}$'));
exception when duplicate_object then null; end $$;

create unique index if not exists luxor_bills_client_request_uidx
  on public.luxor_bills (client_request_id) where client_request_id is not null;

create or replace function public.luxor_prevent_bill_request_key_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_request_id is distinct from old.client_request_id
     or new.client_request_fingerprint is distinct from old.client_request_fingerprint then
    raise exception 'Bill creation request keys are immutable.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_bills_request_key_immutable on public.luxor_bills;
create trigger luxor_bills_request_key_immutable
  before update of client_request_id, client_request_fingerprint on public.luxor_bills
  for each row execute function public.luxor_prevent_bill_request_key_mutation();
