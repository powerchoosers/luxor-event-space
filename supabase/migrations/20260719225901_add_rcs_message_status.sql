alter table public.luxor_messages
  drop constraint if exists luxor_messages_status_check;

alter table public.luxor_messages
  add constraint luxor_messages_status_check
  check (status in ('accepted', 'queued', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed', 'received'));
