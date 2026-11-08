begin;

-- Historical paid records remain intact. New paid states require a linked
-- expense covered by explicit payment rows; legacy status alone is not cash.
create or replace function public.luxor_guard_linked_bill_paid_status()
returns trigger language plpgsql set search_path = public as $$
declare
  v_expense public.luxor_booking_expenses%rowtype;
  v_net_paid numeric(12,2);
begin
  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      raise exception 'Create the bill unpaid and record payment against its linked expense.' using errcode = '55000';
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status <> 'paid' and old.status <> 'paid' then return new; end if;
  select * into v_expense from public.luxor_booking_expenses where source_bill_id = new.id limit 1;
  if not found then
    raise exception 'A bill payment status requires a linked expense and recorded payment history.' using errcode = '55000';
  end if;
  select coalesce(sum(case when transaction_type = 'payment' then amount else -amount end), 0)::numeric(12,2)
    into v_net_paid from public.luxor_expense_payments where expense_id = v_expense.id;
  if new.status = 'paid' and (v_expense.status <> 'paid' or v_expense.amount <= 0 or v_net_paid < v_expense.amount) then
    raise exception 'A bill cannot be marked paid before its linked expense has fully recorded payment.' using errcode = '55000';
  end if;
  if old.status = 'paid' and new.status <> 'paid' and (v_expense.status = 'paid' or v_net_paid >= v_expense.amount) then
    raise exception 'Record a refund or reversal against the linked expense before reopening this bill.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_bills_require_paid_expense on public.luxor_bills;
create trigger luxor_bills_require_paid_expense before insert or update of status on public.luxor_bills
  for each row execute function public.luxor_guard_linked_bill_paid_status();

create or replace function public.luxor_prevent_financial_source_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Bill and vendor records retain their history and cannot be deleted.' using errcode = '55000';
end;
$$;
create trigger luxor_bills_no_delete before delete on public.luxor_bills
  for each row execute function public.luxor_prevent_financial_source_delete();
create trigger luxor_vendors_no_delete before delete on public.luxor_vendors
  for each row execute function public.luxor_prevent_financial_source_delete();
revoke delete, truncate on public.luxor_bills, public.luxor_vendors from service_role;
revoke all on function public.luxor_prevent_financial_source_delete() from public, anon, authenticated;

commit;
