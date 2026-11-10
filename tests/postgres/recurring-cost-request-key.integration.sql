begin;
insert into public.luxor_expense_templates(id, client_request_id, client_request_fingerprint) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sample-fingerprint');
do $$ begin
  begin
    insert into public.luxor_expense_templates(id, client_request_id, client_request_fingerprint) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sample-fingerprint');
    raise exception 'Duplicate key was accepted';
  exception when unique_violation then null; end;
  begin
    update public.luxor_expense_templates set client_request_fingerprint='changed' where id='11111111-1111-4111-8111-111111111111';
    raise exception 'Request identity was changed';
  exception when sqlstate '55000' then null; end;
  begin
    insert into public.luxor_expense_templates(id, client_request_id) values ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'Incomplete request identity was accepted';
  exception when check_violation then null; end;
end $$;
rollback;
