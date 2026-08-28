-- The portal's internal SQL helper must never be a public RLS bypass.
-- Existing server-only Elena calls use service_role and retain access.
revoke execute on function public.exec_sql(text) from public, anon, authenticated;
grant execute on function public.exec_sql(text) to service_role;
alter function public.exec_sql(text) set search_path = public, pg_temp;
