-- Additive only: originals and existing access policies remain unchanged.
alter table public.luxor_call_transcript_segments
  add column if not exists english_text text,
  add column if not exists spoken_languages text[] not null default '{}',
  add column if not exists translation_status text not null default 'not_requested',
  add column if not exists translation_attempts integer not null default 0,
  add column if not exists translation_updated_at timestamptz;
alter table public.luxor_call_transcript_segments add constraint luxor_transcript_translation_status_check
  check (translation_status in ('not_requested','pending','processing','completed','failed'));
create index if not exists luxor_transcript_translation_pending_idx on public.luxor_call_transcript_segments(created_at)
  where translation_status in ('pending','processing');
