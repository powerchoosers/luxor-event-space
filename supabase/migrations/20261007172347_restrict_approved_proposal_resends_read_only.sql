-- The resend route only reads its private approval record. Keep the table
-- read-only for the application service role; inserts are made by a trusted
-- database operator after reviewing the approved source message.
revoke all on table public.luxor_approved_proposal_resends
  from public, anon, authenticated, service_role;
grant select on table public.luxor_approved_proposal_resends to service_role;

drop policy if exists "Service role manages approved proposal resends"
  on public.luxor_approved_proposal_resends;

create policy "Service role reads approved proposal resends"
  on public.luxor_approved_proposal_resends
  for select
  to service_role
  using (true);
