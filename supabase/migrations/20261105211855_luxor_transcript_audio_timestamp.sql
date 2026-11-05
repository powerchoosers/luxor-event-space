-- Keep provider audio timing separate from callback arrival time. Legacy rows
-- remain null because their original timestamp does not establish provenance.
alter table public.luxor_call_transcript_segments
  add column if not exists segment_audio_timestamp timestamptz;
