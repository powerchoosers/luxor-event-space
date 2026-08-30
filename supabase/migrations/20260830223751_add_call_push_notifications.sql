alter table public.luxor_push_subscriptions
  drop constraint if exists luxor_push_subscriptions_notification_types;

alter table public.luxor_push_subscriptions
  add constraint luxor_push_subscriptions_notification_types check (
    notification_types <@ array['email', 'booking', 'call']::text[]
    and cardinality(notification_types) > 0
  );

update public.luxor_push_subscriptions
set notification_types = array_append(notification_types, 'call'),
    updated_at = now()
where disabled_at is null
  and not ('call' = any(notification_types));
