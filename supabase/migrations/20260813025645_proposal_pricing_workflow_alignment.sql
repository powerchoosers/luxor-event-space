-- Proposal workflow alignment
--
-- This migration intentionally creates no prospect, inquiry, booking, invoice,
-- or payment records. The only data change is a safe one-to-one normalization
-- of legacy pipeline labels so the current application stages can be enforced.

-- Multi-event support is a prerequisite for proposals that belong to a specific
-- event rather than only a lead. Keep this independent from the old trigger
-- implementation so no SECURITY DEFINER function is introduced here.
create table if not exists public.luxor_lead_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  event_type text,
  target_date text,
  guest_count integer check (guest_count is null or guest_count >= 0),
  package_interest text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent', 'booked', 'closed_lost')),
  pipeline_stage text not null default 'inquiry'
    check (pipeline_stage in ('inquiry', 'tour', 'proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing', 'closed_lost')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false
);

alter table public.luxor_lead_events
  add column if not exists event_type text,
  add column if not exists target_date text,
  add column if not exists guest_count integer,
  add column if not exists package_interest text,
  add column if not exists status text not null default 'new',
  add column if not exists pipeline_stage text not null default 'inquiry',
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists is_primary boolean not null default false;

create unique index if not exists luxor_lead_events_primary_idx
  on public.luxor_lead_events (inquiry_id)
  where is_primary;

create unique index if not exists luxor_lead_events_id_inquiry_idx
  on public.luxor_lead_events (id, inquiry_id);

create index if not exists luxor_lead_events_inquiry_idx
  on public.luxor_lead_events (inquiry_id, created_at);

alter table public.luxor_bookings
  add column if not exists lead_event_id uuid;

alter table public.luxor_invoices
  add column if not exists lead_event_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'luxor_bookings_lead_event_id_fkey'
      and conrelid = 'public.luxor_bookings'::regclass
  ) then
    alter table public.luxor_bookings
      add constraint luxor_bookings_lead_event_id_fkey
      foreign key (lead_event_id)
      references public.luxor_lead_events(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'luxor_invoices_lead_event_id_fkey'
      and conrelid = 'public.luxor_invoices'::regclass
  ) then
    alter table public.luxor_invoices
      add constraint luxor_invoices_lead_event_id_fkey
      foreign key (lead_event_id)
      references public.luxor_lead_events(id)
      on delete set null;
  end if;
end $$;

create index if not exists luxor_bookings_lead_event_idx
  on public.luxor_bookings (lead_event_id);

create index if not exists luxor_invoices_lead_event_idx
  on public.luxor_invoices (lead_event_id);

create table if not exists public.luxor_lead_event_preferences (
  portal_email text not null
    check (portal_email = lower(trim(portal_email))),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  lead_event_id uuid not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (portal_email, inquiry_id),
  foreign key (lead_event_id, inquiry_id)
    references public.luxor_lead_events (id, inquiry_id)
    on delete cascade
);

create index if not exists luxor_lead_event_preferences_event_idx
  on public.luxor_lead_event_preferences (lead_event_id);

-- Replace the legacy inquiry stage vocabulary with the current application
-- stages. The mapping preserves each record's position in the workflow.
do $$
declare
  constraint_name name;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.luxor_inquiries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pipeline_stage%'
  loop
    execute format('alter table public.luxor_inquiries drop constraint %I', constraint_name);
  end loop;
end $$;

update public.luxor_inquiries
set pipeline_stage = case pipeline_stage
  when 'proposal_sent' then 'proposal'
  when 'book_reserve' then 'deposit'
  when 'planning_begins' then 'planning'
  when 'final_details' then 'final_payment'
  when 'setup_event_day' then 'event'
  when 'after_event' then 'closing'
  else pipeline_stage
end
where pipeline_stage in (
  'proposal_sent',
  'book_reserve',
  'planning_begins',
  'final_details',
  'setup_event_day',
  'after_event'
);

alter table public.luxor_inquiries
  add constraint luxor_inquiries_pipeline_stage_check
  check (pipeline_stage in ('inquiry', 'tour', 'proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing', 'closed_lost'));

-- Apply the same canonical stage validation to an older lead-events table if
-- one was already created by a previous deployment.
do $$
declare
  constraint_name name;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.luxor_lead_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pipeline_stage%'
  loop
    execute format('alter table public.luxor_lead_events drop constraint %I', constraint_name);
  end loop;
end $$;

update public.luxor_lead_events
set pipeline_stage = case pipeline_stage
  when 'proposal_sent' then 'proposal'
  when 'book_reserve' then 'deposit'
  when 'planning_begins' then 'planning'
  when 'final_details' then 'final_payment'
  when 'setup_event_day' then 'event'
  when 'after_event' then 'closing'
  else pipeline_stage
end
where pipeline_stage in (
  'proposal_sent',
  'book_reserve',
  'planning_begins',
  'final_details',
  'setup_event_day',
  'after_event'
);

alter table public.luxor_lead_events
  add constraint luxor_lead_events_pipeline_stage_check
  check (pipeline_stage in ('inquiry', 'tour', 'proposal', 'contract', 'deposit', 'planning', 'final_payment', 'event', 'closing', 'closed_lost'));

-- The refundable security deposit is a separate booking obligation, not part
-- of the event-price calculation. Existing rows receive the schema default;
-- this migration does not backfill, create, or delete any client record.
alter table public.luxor_bookings
  add column if not exists security_deposit_amount numeric(12, 2) not null default 750;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'luxor_bookings_security_deposit_amount_check'
      and conrelid = 'public.luxor_bookings'::regclass
  ) then
    alter table public.luxor_bookings
      add constraint luxor_bookings_security_deposit_amount_check
      check (security_deposit_amount >= 0);
  end if;
end $$;

-- A sent proposal stores its complete, reproducible calculation snapshot. The
-- new version link allows an owner to issue a revised proposal without
-- overwriting an accepted or price-locked one.
alter table public.luxor_invoices
  add column if not exists proposal_context jsonb not null default '{}'::jsonb,
  add column if not exists proposal_accepted_at timestamptz,
  add column if not exists proposal_accepted_ip text,
  add column if not exists proposal_accepted_user_agent text,
  add column if not exists price_locked_at timestamptz,
  add column if not exists supersedes_invoice_id uuid,
  add column if not exists proposal_version integer not null default 1,
  add column if not exists discount_type text not null default 'percent',
  add column if not exists discount_value numeric(12, 2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'luxor_invoices_discount_type_check'
      and conrelid = 'public.luxor_invoices'::regclass
  ) then
    alter table public.luxor_invoices
      add constraint luxor_invoices_discount_type_check
      check (discount_type in ('percent', 'fixed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'luxor_invoices_discount_value_check'
      and conrelid = 'public.luxor_invoices'::regclass
  ) then
    alter table public.luxor_invoices
      add constraint luxor_invoices_discount_value_check
      check (discount_value >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'luxor_invoices_proposal_version_check'
      and conrelid = 'public.luxor_invoices'::regclass
  ) then
    alter table public.luxor_invoices
      add constraint luxor_invoices_proposal_version_check
      check (proposal_version >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'luxor_invoices_supersedes_invoice_id_fkey'
      and conrelid = 'public.luxor_invoices'::regclass
  ) then
    alter table public.luxor_invoices
      add constraint luxor_invoices_supersedes_invoice_id_fkey
      foreign key (supersedes_invoice_id)
      references public.luxor_invoices(id)
      on delete set null;
  end if;
end $$;

create index if not exists luxor_invoices_supersedes_invoice_id_idx
  on public.luxor_invoices (supersedes_invoice_id);

create table if not exists public.luxor_proposal_pricing (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  version integer not null default 1 check (version >= 1),
  is_default boolean not null default false,
  config jsonb not null default '{}'::jsonb
);

alter table public.luxor_proposal_pricing
  add column if not exists version integer not null default 1,
  add column if not exists is_default boolean not null default false,
  add column if not exists config jsonb not null default '{}'::jsonb;

create unique index if not exists luxor_proposal_pricing_single_default_idx
  on public.luxor_proposal_pricing (is_default)
  where is_default;

-- This is the initial owner-editable, fixed-rate rule card. It deliberately
-- contains component prices rather than estimated or precomputed package
-- totals. Any scenario outside these rules must be reviewed by the owner.
insert into public.luxor_proposal_pricing (version, is_default, config)
select
  1,
  true,
  $pricing$
  {
    "schema_version": 1,
    "currency": "USD",
    "pricing_mode": "fixed_rules_only",
    "manual_price_override": false,
    "undefined_scenario_action": "administrator_review_required",
    "guest_count": {
      "minimum": 1,
      "maximum": 200,
      "tables_per_guest": 0.1,
      "table_rounding": "ceil"
    },
    "rental_access": {
      "morning": { "start": "09:00", "end": "16:00", "hours": 7 },
      "evening": { "start": "18:00", "end": "01:00", "hours": 7 },
      "full_day": { "start": "11:00", "end": "23:00", "hours": 12 },
      "full_decor_or_all_inclusive": {
        "event_access_hours": 8,
        "setup_and_breakdown_hours": 4,
        "total_venue_access_hours": 12,
        "display_note": "8 hours of event access plus 4 hours for setup and breakdown"
      }
    },
    "rental_rates": {
      "monday_thursday": { "morning": 1000, "evening": 1200, "full_day": 1600 },
      "friday": { "morning": 1500, "evening": 1700, "full_day": 2500 },
      "saturday": { "morning": 1900, "evening": 2100, "full_day": 3000 },
      "sunday": { "morning": 1400, "evening": 1600, "full_day": 2200 }
    },
    "required_fees": {
      "cleaning": {
        "retail": [
          { "min_guests": 1, "max_guests": 75, "amount": 250 },
          { "min_guests": 76, "max_guests": 150, "amount": 325 },
          { "min_guests": 151, "max_guests": 200, "amount": 400 }
        ],
        "all_inclusive": [
          { "min_guests": 1, "max_guests": 75, "amount": 200 },
          { "min_guests": 76, "max_guests": 150, "amount": 260 },
          { "min_guests": 151, "max_guests": 200, "amount": 320 }
        ]
      },
      "security": {
        "retail": [
          { "min_guests": 1, "max_guests": 150, "officers": 1, "hours": 6, "amount": 250 },
          { "min_guests": 151, "max_guests": 200, "officers": 2, "hours": 6, "amount": 450 }
        ],
        "all_inclusive": [
          { "min_guests": 1, "max_guests": 150, "officers": 1, "hours": 6, "amount": 200 },
          { "min_guests": 151, "max_guests": 200, "officers": 2, "hours": 6, "amount": 400 }
        ]
      }
    },
    "tables": {
      "guests_per_table": 10,
      "rounding": "ceil",
      "included_tables": 10,
      "additional_table_rates": {
        "essential_decor": { "retail": 70, "all_inclusive": 40 },
        "full_decor_and_planning": { "retail": 160, "all_inclusive": 120 }
      },
      "double_charge_validation": true
    },
    "tables_and_chairs_setup": {
      "retail": 500,
      "all_inclusive": 0,
      "source": "Package Breakdown worksheet",
      "required_for_packages": ["rental_only", "bronze_essentials"]
    },
    "decor": {
      "essential": {
        "retail": 700,
        "all_inclusive": 700,
        "inclusions": [
          "Essential centerpieces",
          "Basic linens",
          "Basic sweetheart table",
          "Gift table with basic linen",
          "Cake table with basic decor"
        ]
      },
      "full_decor_and_planning": {
        "retail": 5250,
        "all_inclusive": 4350,
        "inclusions": [
          "Premium linens",
          "Silk floral centerpieces",
          "Premium sweetheart table",
          "Signing table with simple decor",
          "Gift table with premium linen",
          "Cake table with premium decor",
          "Full decor and planning service",
          "Tall and small centerpiece designs"
        ]
      }
    },
    "catering": {
      "buffet": { "retail_per_guest": 25.5, "all_inclusive_per_guest": 21.5 },
      "plated": { "retail_per_guest": 31.5, "all_inclusive_per_guest": 26.5 },
      "calculation": "guest_count_times_rate"
    },
    "dj": { "hours": 6, "retail": 1200, "all_inclusive": 1000 },
    "photo_booth": {
      "selection_limit": 1,
      "signature_experience": { "retail": 650, "all_inclusive": 550 },
      "celebration_experience": { "retail": 850, "all_inclusive": 750 },
      "forever_experience": { "retail": 1100, "all_inclusive": 999 }
    },
    "bartending": {
      "service_hours": 5,
      "retail": {
        "staffing": [
          { "min_guests": 1, "max_guests": 75, "amount": 550 },
          { "min_guests": 76, "max_guests": 150, "amount": 950 },
          { "min_guests": 151, "max_guests": 200, "amount": 1350 }
        ],
        "additional_hour_per_bartender": 90,
        "bars": {
          "signature_byob": { "per_guest": 12, "minimum": 750 },
          "premium_byob": { "per_guest": 17, "minimum": 1000 },
          "non_alcoholic": { "per_guest": 9, "minimum": 500 }
        }
      },
      "all_inclusive": {
        "staffing": [
          { "min_guests": 1, "max_guests": 75, "amount": 450 },
          { "min_guests": 76, "max_guests": 150, "amount": 800 },
          { "min_guests": 151, "max_guests": 200, "amount": 1150 }
        ],
        "additional_hour_per_bartender": 75,
        "bars": {
          "signature_byob": { "per_guest": 10, "minimum": 750 },
          "premium_byob": { "per_guest": 14, "minimum": 1000 },
          "non_alcoholic": { "per_guest": 7, "minimum": 500 }
        }
      },
      "bar_calculation": "max_guest_count_times_rate_or_minimum"
    },
    "packages": [
      { "id": "rental_only", "name": "Rental Only", "rate_tier": "retail", "price_basis": "calculated_components" },
      { "id": "bronze_essentials", "name": "Bronze - Essentials", "rate_tier": "retail", "price_basis": "calculated_components" },
      { "id": "silver_premier", "name": "Silver - Premier", "rate_tier": "retail", "price_basis": "calculated_components" },
      { "id": "gold_all_inclusive", "name": "Gold - All-Inclusive", "rate_tier": "all_inclusive", "price_basis": "calculated_components" }
    ],
    "discounts": {
      "allowed_types": ["percent", "fixed"],
      "automatic_discounts": false,
      "explicit_approval_required": true,
      "visible_to_client": true
    },
    "security_deposit": {
      "amount": 750,
      "refundable": true,
      "separate_from_event_price": true,
      "separate_from_discounts": true,
      "required": true
    },
    "taxes_and_processing_fees": {
      "configured_by_owner": true,
      "included_in_service_prices": false
    },
    "reconciliation": {
      "require_total_to_equal_line_items": true,
      "block_finalization_on_validation_error": true
    }
  }
  $pricing$::jsonb
where not exists (
  select 1
  from public.luxor_proposal_pricing
  where is_default
);

-- Keep all proposal-pricing and lead-event records server-authorized. There is
-- no public RLS policy and no database function exposed by this migration.
alter table public.luxor_proposal_pricing enable row level security;
alter table public.luxor_lead_events enable row level security;
alter table public.luxor_lead_event_preferences enable row level security;

revoke all on table public.luxor_proposal_pricing from public, anon, authenticated;
revoke all on table public.luxor_lead_events from public, anon, authenticated;
revoke all on table public.luxor_lead_event_preferences from public, anon, authenticated;

grant select, insert, update, delete on table public.luxor_proposal_pricing to service_role;
grant select, insert, update, delete on table public.luxor_lead_events to service_role;
grant select, insert, update, delete on table public.luxor_lead_event_preferences to service_role;

drop policy if exists "Service role can manage Luxor proposal pricing" on public.luxor_proposal_pricing;
create policy "Service role can manage Luxor proposal pricing"
  on public.luxor_proposal_pricing
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor lead events" on public.luxor_lead_events;
create policy "Service role can manage Luxor lead events"
  on public.luxor_lead_events
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor lead event preferences" on public.luxor_lead_event_preferences;
create policy "Service role can manage Luxor lead event preferences"
  on public.luxor_lead_event_preferences
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

-- If the previously checked-in multi-event migration has already run, harden
-- its trigger function too: it does not need SECURITY DEFINER privileges and
-- must never be callable through a public RPC endpoint.
do $$
begin
  if to_regprocedure('public.luxor_create_primary_lead_event()') is not null then
    execute 'alter function public.luxor_create_primary_lead_event() security invoker';
    execute 'revoke all on function public.luxor_create_primary_lead_event() from public, anon, authenticated';
    execute 'grant execute on function public.luxor_create_primary_lead_event() to service_role';
  end if;
end $$;

comment on column public.luxor_bookings.security_deposit_amount is
  'Refundable security deposit, tracked separately from the event price.';
comment on column public.luxor_invoices.proposal_context is
  'Immutable pricing and payment snapshot used by the proposal email, PDF, client page, and contract.';
comment on column public.luxor_invoices.price_locked_at is
  'Timestamp at which the proposal price became immutable for this invoice version.';
comment on column public.luxor_invoices.supersedes_invoice_id is
  'Previous proposal invoice replaced by this version; historical proposal records remain intact.';

notify pgrst, 'reload schema';
