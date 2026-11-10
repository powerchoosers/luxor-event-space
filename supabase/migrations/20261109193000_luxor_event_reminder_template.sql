-- Event scheduling, opt-in and queued message snapshots remain in the text-job system.
insert into public.luxor_system_message_templates (message_key, body_template)
values ('event_reminder', 'Hi {{first_name}}, your {{event_type}} is {{time_until}} away on {{event_date}}. Reply with any final questions or updates.')
on conflict (message_key) do nothing;
