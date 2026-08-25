create table if not exists public.luxor_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  notification_types text[] not null default array['email', 'booking']::text[],
  user_agent text,
  failure_count integer not null default 0,
  last_error text,
  last_success_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint luxor_push_subscriptions_email_normalized check (user_email = lower(trim(user_email))),
  constraint luxor_push_subscriptions_endpoint_length check (char_length(endpoint) between 1 and 4096),
  constraint luxor_push_subscriptions_p256dh_length check (char_length(p256dh) between 1 and 512),
  constraint luxor_push_subscriptions_auth_length check (char_length(auth) between 1 and 256),
  constraint luxor_push_subscriptions_failure_count check (failure_count >= 0),
  constraint luxor_push_subscriptions_notification_types check (
    notification_types <@ array['email', 'booking']::text[]
    and cardinality(notification_types) > 0
  )
);

create index if not exists luxor_push_subscriptions_active_user_idx
  on public.luxor_push_subscriptions (user_email, updated_at desc)
  where disabled_at is null;

alter table public.luxor_push_subscriptions enable row level security;

revoke all on table public.luxor_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.luxor_push_subscriptions to service_role;

comment on table public.luxor_push_subscriptions is
  'Server-only Web Push subscriptions for approved Luxor portal users. Endpoint and encryption keys are never exposed through the browser Data API.';
