-- Cover the foreign-key lookup path when a lead event is removed.
create index luxor_layout_reviews_lead_event_id_idx
  on public.luxor_layout_reviews (lead_event_id)
  where lead_event_id is not null;
