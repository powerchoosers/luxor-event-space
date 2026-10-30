alter table public.luxor_calls
  add column if not exists recording_storage_path text,
  add column if not exists recording_consent_status text not null default 'not_requested',
  add column if not exists recording_consent_at timestamptz,
  add column if not exists transcription_status text not null default 'not_requested',
  add column if not exists transcript_segments jsonb not null default '[]'::jsonb,
  add column if not exists summary_status text not null default 'not_generated',
  add column if not exists summary_text text,
  add column if not exists summary_generated_at timestamptz,
  add column if not exists summary_model text;

alter table public.luxor_calls
  add constraint luxor_calls_recording_consent_status_check
    check (recording_consent_status in ('not_requested', 'consented', 'declined')),
  add constraint luxor_calls_transcription_status_check
    check (transcription_status in ('not_requested', 'pending', 'processing', 'completed', 'failed')),
  add constraint luxor_calls_summary_status_check
    check (summary_status in ('not_generated', 'generating', 'completed', 'failed')),
  add constraint luxor_calls_transcript_segments_array_check
    check (jsonb_typeof(transcript_segments) = 'array');

create index if not exists luxor_calls_consent_status_idx
  on public.luxor_calls (recording_consent_status, transcription_status);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('luxor-call-recordings', 'luxor-call-recordings', false, 524288000, array['audio/mpeg', 'audio/wav', 'audio/mp4']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  lifecycle_configuration = null;
