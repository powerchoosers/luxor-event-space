-- Private, revocable snapshots for client-facing layout reviews. Tokens are
-- never stored in plaintext: the app keeps an HMAC lookup value plus an
-- encrypted recovery value that can only be revealed to an authenticated
-- portal session.
create table public.luxor_layout_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  lead_event_id uuid references public.luxor_lead_events(id) on delete set null,
  layout_name text not null check (char_length(layout_name) between 1 and 180),
  layout_snapshot jsonb not null check (jsonb_typeof(layout_snapshot) = 'object'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_ciphertext text not null check (char_length(token_ciphertext) between 32 and 2048),
  status text not null default 'open' check (status in ('open', 'approved', 'feedback', 'revoked', 'expired')),
  created_by text not null check (char_length(created_by) between 1 and 320),
  expires_at timestamptz not null,
  responded_at timestamptz,
  revoked_at timestamptz
);

create index luxor_layout_reviews_scope_created_idx
  on public.luxor_layout_reviews (inquiry_id, lead_event_id, created_at desc);

create index luxor_layout_reviews_expires_at_idx
  on public.luxor_layout_reviews (expires_at);

create table public.luxor_layout_review_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  review_id uuid not null unique references public.luxor_layout_reviews(id) on delete cascade,
  action text not null check (action in ('approved', 'feedback')),
  note text check (note is null or char_length(note) <= 2000),
  submission_key uuid not null,
  ip_hash text check (ip_hash is null or char_length(ip_hash) <= 128),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  constraint luxor_layout_review_feedback_note_required
    check (action <> 'feedback' or (note is not null and char_length(btrim(note)) > 0))
);

create unique index luxor_layout_review_feedback_submission_key_idx
  on public.luxor_layout_review_feedback (review_id, submission_key);

create index luxor_layout_review_feedback_created_idx
  on public.luxor_layout_review_feedback (created_at desc);

create index luxor_layout_review_feedback_ip_created_idx
  on public.luxor_layout_review_feedback (ip_hash, created_at desc)
  where ip_hash is not null;

alter table public.luxor_layout_reviews enable row level security;
alter table public.luxor_layout_review_feedback enable row level security;

create policy "Service role can manage Luxor layout reviews"
  on public.luxor_layout_reviews
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

create policy "Service role can manage Luxor layout review feedback"
  on public.luxor_layout_review_feedback
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

revoke all on table public.luxor_layout_reviews from anon, authenticated;
revoke all on table public.luxor_layout_review_feedback from anon, authenticated;
grant select, insert, update, delete on table public.luxor_layout_reviews to service_role;
grant select, insert, update, delete on table public.luxor_layout_review_feedback to service_role;
