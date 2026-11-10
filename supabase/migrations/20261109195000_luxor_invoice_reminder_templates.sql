-- Copy only: invoice eligibility, due dates, consent and queued snapshots remain unchanged.
insert into public.luxor_system_message_templates (message_key, body_template) values
('invoice_due_reminder', 'Hi {{first_name}}, a friendly reminder that your {{amount}} invoice is due {{due_date}}. Please use your secure invoice link or contact us with questions.'),
('invoice_overdue_reminder', 'Hi {{first_name}}, our records show your {{amount}} invoice due {{due_date}} is still unpaid. Please use your secure invoice link or contact us for help.')
on conflict (message_key) do nothing;
