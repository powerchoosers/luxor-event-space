-- Proposed durable review choices only. Not a migration and not applied.
-- Requires the reviewed statement-import proposal and existing expense payments.
-- A recorded choice is not a bank reconciliation, settlement, or journal entry.
-- created_by is supplied by the application and is not database-authenticated;
-- do not enable until identity binding and the final access model are reviewed.
begin;
-- Hard stop: this draft accepts an application-supplied actor and is not safe
-- to apply. Replace the identity boundary and complete security testing first.
do $$ begin raise exception 'Match review proposal disabled: database-bound identity is required'; end $$;
create table public.luxor_statement_match_review_events (
  sequence bigint generated always as identity primary key,
  id uuid not null unique,
  statement_id uuid not null references public.luxor_statement_imports(id) on delete restrict,
  row_number integer not null check (row_number between 1 and 5001),
  previous_id uuid references public.luxor_statement_match_review_events(id) on delete restrict,
  action text not null check (action in ('selected','cleared')),
  source_payment_id uuid not null references public.luxor_expense_payments(id) on delete restrict,
  note text not null check (char_length(btrim(note)) between 1 and 500),
  explicitly_confirmed boolean not null check (explicitly_confirmed),
  account_currency_attested boolean not null,
  duplicate_acknowledged boolean not null,
  created_by text not null check (char_length(btrim(created_by)) between 1 and 320),
  created_at timestamptz not null default now(),
  check ((action = 'selected' and account_currency_attested) or (action = 'cleared' and not account_currency_attested and not duplicate_acknowledged))
);
create unique index luxor_statement_review_one_successor on public.luxor_statement_match_review_events(previous_id) where previous_id is not null;
create index luxor_statement_review_row_history on public.luxor_statement_match_review_events(statement_id,row_number,sequence desc);

create function public.luxor_statement_match_review_guard() returns trigger language plpgsql set search_path = public as $$
declare
  last_event public.luxor_statement_match_review_events%rowtype;
  source_payment public.luxor_expense_payments%rowtype;
  row_data jsonb;
  row_count integer;
begin
  if tg_op <> 'INSERT' then raise exception 'Review history is immutable'; end if;
  -- Serialize decisions across statements to prevent the same source being selected twice.
  perform pg_advisory_xact_lock(hashtextextended('luxor_statement_match_review', 0));
  select * into last_event from public.luxor_statement_match_review_events
    where statement_id = new.statement_id and row_number = new.row_number order by sequence desc limit 1;
  if new.previous_id is distinct from last_event.id then raise exception 'Review changed; refresh before continuing'; end if;
  if new.action = 'cleared' then
    if last_event.id is null or last_event.action <> 'selected' or last_event.source_payment_id <> new.source_payment_id then
      raise exception 'Only the current choice can be cleared';
    end if;
    return new;
  end if;
  if last_event.id is not null and last_event.action = 'selected' then raise exception 'Clear the current choice first'; end if;
  select count(*), (array_agg(item))[1] into row_count, row_data
    from public.luxor_statement_imports s cross join lateral jsonb_array_elements(s.rows) item
    where s.id = new.statement_id and item->>'rowNumber' = new.row_number::text;
  if row_count <> 1 or jsonb_typeof(row_data->'issues') is distinct from 'array'
    or jsonb_array_length(row_data->'issues') <> 0
    or jsonb_typeof(row_data->'possibleDuplicateRows') is distinct from 'array'
    or row_data->>'currency' is distinct from 'USD'
    or coalesce(row_data->>'amountCents','') !~ '^[1-9][0-9]{0,11}$' then
    raise exception 'Statement row is unresolved';
  end if;
  if jsonb_array_length(row_data->'possibleDuplicateRows') > 0 and not new.duplicate_acknowledged then raise exception 'Compare possible duplicate rows first'; end if;
  select * into source_payment from public.luxor_expense_payments where id = new.source_payment_id;
  if not found or source_payment.transaction_type not in ('payment','refund')
    or source_payment.payment_date::text is distinct from row_data->>'date'
    or source_payment.amount * 100 <> (row_data->>'amountCents')::numeric
    or (case source_payment.transaction_type when 'payment' then 'outflow' when 'refund' then 'inflow' end) is distinct from row_data->>'direction' then
    raise exception 'Only an exact source transaction can be selected';
  end if;
  if exists (
    select 1 from (
      select distinct on (statement_id,row_number) action,source_payment_id
      from public.luxor_statement_match_review_events order by statement_id,row_number,sequence desc
    ) current_choices where current_choices.action = 'selected' and current_choices.source_payment_id = new.source_payment_id
  ) then raise exception 'Source already selected for another row'; end if;
  return new;
end $$;
create trigger luxor_statement_match_review_guard before insert or update or delete on public.luxor_statement_match_review_events for each row execute function public.luxor_statement_match_review_guard();
alter table public.luxor_statement_match_review_events enable row level security;
revoke all on public.luxor_statement_match_review_events from public,anon,authenticated;
-- Intentionally no service-role or client grants in this disabled proposal.
revoke all on function public.luxor_statement_match_review_guard() from public,anon,authenticated;
commit;
