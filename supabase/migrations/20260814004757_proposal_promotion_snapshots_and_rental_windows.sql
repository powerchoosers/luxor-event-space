-- Saved promotions are referenced by an editable draft, while every proposal
-- keeps its own immutable copy of the applied promotion terms.  A later edit
-- or deactivation can therefore never change an already-sent proposal.
begin;

alter table public.luxor_invoices
  add column if not exists promotion_id uuid,
  add column if not exists promotion_snapshot jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'luxor_invoices_promotion_id_fkey'
      and conrelid = 'public.luxor_invoices'::regclass
  ) then
    alter table public.luxor_invoices
      add constraint luxor_invoices_promotion_id_fkey
      foreign key (promotion_id)
      references public.luxor_promotions(id)
      on delete set null;
  end if;
end $$;

create index if not exists luxor_invoices_promotion_id_idx
  on public.luxor_invoices (promotion_id)
  where promotion_id is not null;

comment on column public.luxor_invoices.promotion_id is
  'Saved promotion used by an editable proposal draft. Null when no saved promotion is selected.';
comment on column public.luxor_invoices.promotion_snapshot is
  'Immutable promotion id, name, code, type, value, and applied amount used by this proposal version.';

-- New proposals use the approved access windows. Locked proposal snapshots
-- live on luxor_invoices and are deliberately not touched by this update.
update public.luxor_proposal_pricing
set
  config = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(config, '{rental_access,morning,start}', '"08:00"'::jsonb, true),
        '{rental_access,morning,end}', '"15:00"'::jsonb, true
      ),
      '{rental_access,evening,start}', '"17:00"'::jsonb, true
    ),
    '{rental_access,evening,end}', '"00:00"'::jsonb, true
  ),
  version = version + 1,
  updated_at = timezone('utc', now())
where is_default = true
  and (
    coalesce(config #>> '{rental_access,morning,start}', '') <> '08:00'
    or coalesce(config #>> '{rental_access,morning,end}', '') <> '15:00'
    or coalesce(config #>> '{rental_access,evening,start}', '') <> '17:00'
    or coalesce(config #>> '{rental_access,evening,end}', '') <> '00:00'
  );

notify pgrst, 'reload schema';

commit;
