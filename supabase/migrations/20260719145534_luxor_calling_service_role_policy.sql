create policy "Service role can manage Luxor calls"
  on public.luxor_calls
  for all
  to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);
