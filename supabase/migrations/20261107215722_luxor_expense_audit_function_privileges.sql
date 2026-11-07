begin;

revoke all on function public.luxor_audit_expense_change()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
