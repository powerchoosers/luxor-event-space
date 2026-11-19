alter table public.luxor_call_transcript_segments
  add column if not exists agent_turn_key text;

create unique index if not exists luxor_call_transcript_segments_agent_turn_key_idx
  on public.luxor_call_transcript_segments (call_id, transcription_sid, agent_turn_key)
  where agent_turn_key is not null;