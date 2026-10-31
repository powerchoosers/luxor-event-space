-- Preserve the calendar's existing tour notification behavior while giving
-- portal operators a durable global on/off control.
insert into public.luxor_follow_up_automations
  (automation_key, name, enabled, send_approved, timing_configured, timezone)
values
  ('tour_notifications', 'Tour confirmations & reminders', true, true, true, 'America/Chicago')
on conflict (automation_key) do nothing;
