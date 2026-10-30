create table if not exists public.luxor_call_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.luxor_calls(id) on delete cascade,
  transcription_sid text not null,
  sequence_id integer not null,
  track text not null,
  segment_start_seconds numeric,
  segment_text text not null,
  is_final boolean not null default true,
  event_timestamp timestamptz,
  created_at timestamptz not null default now(),
  unique (call_id, transcription_sid, sequence_id, track)
);

alter table public.luxor_call_transcript_segments enable row level security;
create index if not exists luxor_call_transcript_segments_order_idx
  on public.luxor_call_transcript_segments (call_id, segment_start_seconds, sequence_id);
