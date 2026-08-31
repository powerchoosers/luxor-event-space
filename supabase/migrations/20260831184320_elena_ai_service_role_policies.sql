drop policy if exists "Service role manages Elena settings" on public.luxor_elena_settings;
create policy "Service role manages Elena settings"
  on public.luxor_elena_settings for all to service_role
  using (true) with check (true);

drop policy if exists "Service role manages Elena knowledge" on public.luxor_elena_knowledge;
create policy "Service role manages Elena knowledge"
  on public.luxor_elena_knowledge for all to service_role
  using (true) with check (true);

drop policy if exists "Service role manages Elena flows" on public.luxor_elena_flows;
create policy "Service role manages Elena flows"
  on public.luxor_elena_flows for all to service_role
  using (true) with check (true);

drop policy if exists "Service role writes Elena audit" on public.luxor_elena_audit;
create policy "Service role writes Elena audit"
  on public.luxor_elena_audit for all to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';
