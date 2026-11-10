-- Only copy is configurable. Payment state, consent, deduplication, and queued snapshots stay in the existing sender.
insert into public.luxor_system_message_templates (message_key, body_template)
values ('payment_confirmation', 'Hi {{first_name}}, we received your payment of {{amount}}. Thank you. Reply with any questions.')
on conflict (message_key) do nothing;
