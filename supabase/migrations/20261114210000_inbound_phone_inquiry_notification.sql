-- Phone inquiries from Elena inbound should enqueue the same internal [New Lead] alert
-- as web forms, without backfilling historical rows.
drop trigger if exists luxor_inquiry_notification_enqueue on public.luxor_inquiries;
create trigger luxor_inquiry_notification_enqueue after insert on public.luxor_inquiries
  for each row when (
    coalesce(new.internal_notification_requested, false)
    or (
      new.source = 'inbound_phone'
      and new.flow = 'phone_inquiry'
      and not coalesce(new.is_test, false)
      and lower(coalesce(new.metadata->>'is_test_record', 'false')) <> 'true'
    )
  ) execute function public.luxor_enqueue_inquiry_notifications();