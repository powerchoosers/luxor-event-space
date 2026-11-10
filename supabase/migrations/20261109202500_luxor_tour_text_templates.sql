-- Calendar revision, cancellation, consent and queue behavior remain unchanged.
insert into public.luxor_system_message_templates (message_key, body_template) values
('tour_confirmation', 'Hi {{first_name}}, your private venue tour is confirmed for {{tour_date}}{{tour_time_suffix}}. Reply with any questions.'),
('tour_reminder', 'Reminder for your private venue tour tomorrow{{tour_time_suffix}}. We look forward to meeting you.')
on conflict (message_key) do nothing;
