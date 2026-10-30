alter table public.luxor_calls
  add column if not exists recording_started_at timestamptz;
