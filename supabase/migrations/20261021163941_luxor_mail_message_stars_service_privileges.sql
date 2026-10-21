-- Supabase defaults may grant broad table rights to service_role. Keep the
-- star mapping limited to the operations used by the server implementation.
revoke all on table public.luxor_mail_message_stars from public, anon, authenticated, service_role;
grant select, insert, delete on table public.luxor_mail_message_stars to service_role;
