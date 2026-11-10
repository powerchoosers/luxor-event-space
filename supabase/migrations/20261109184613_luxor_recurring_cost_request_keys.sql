begin;
alter table public.luxor_expense_templates
  add column client_request_id uuid,
  add column client_request_fingerprint text;
alter table public.luxor_expense_templates
  add constraint luxor_template_request_pair_check check ((client_request_id is null) = (client_request_fingerprint is null));
create unique index luxor_template_client_request_idx on public.luxor_expense_templates(client_request_id) where client_request_id is not null;

create function public.luxor_prevent_template_request_key_mutation() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.client_request_id is distinct from old.client_request_id or new.client_request_fingerprint is distinct from old.client_request_fingerprint then
    raise exception 'Recurring cost request identity cannot be changed.' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.luxor_prevent_template_request_key_mutation() from public, anon, authenticated;
create trigger luxor_template_request_key_immutable before update of client_request_id, client_request_fingerprint on public.luxor_expense_templates
  for each row execute function public.luxor_prevent_template_request_key_mutation();
notify pgrst, 'reload schema';
commit;
