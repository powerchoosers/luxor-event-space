alter table public.luxor_call_transcript_segments
  drop constraint if exists luxor_call_transcript_segments_call_id_transcription_sid_sequence_id_key;

alter table public.luxor_call_transcript_segments
  add constraint luxor_call_transcript_segments_event_key
  unique (call_id, transcription_sid, sequence_id, track);
