begin;
insert into public.luxor_bookings values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','confirmed','signed','{}');
insert into public.luxor_invoices(id,booking_id,parent_invoice_id,invoice_kind,status,total) values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','final_balance','paid',500);
insert into public.luxor_payment_installments values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',500,'paid',now(),'Zelle',null,'{"installment_allocation_legacy_baseline":0}',now());
insert into public.luxor_payments values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',500,'paid','manual','Zelle',now(),'{"manual_entry":true,"installment_entry_key":"key","installment_allocations":[{"installment_id":"40000000-0000-4000-8000-000000000001","amount":500}]}','2026-11-01 00:00:00+00');
insert into public.luxor_payment_installment_allocations values ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',500);
do $$ begin
  begin perform public.luxor_correct_manual_installment_payment('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-02 00:00:00+00','owner@example.invalid','mistake'); raise exception 'stale version accepted'; exception when serialization_failure then null; end;
  update public.luxor_payments set processor='stripe' where id='50000000-0000-4000-8000-000000000001';
  begin perform public.luxor_correct_manual_installment_payment('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-01 00:00:00+00','owner@example.invalid','mistake'); raise exception 'card accepted'; exception when serialization_failure then null; end;
  update public.luxor_payments set processor='manual' where id='50000000-0000-4000-8000-000000000001';
  update public.luxor_payment_installments set metadata='{"installment_allocation_legacy_baseline":10}' where id='40000000-0000-4000-8000-000000000001';
  begin perform public.luxor_correct_manual_installment_payment('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-01 00:00:00+00','owner@example.invalid','mistake'); raise exception 'legacy accepted'; exception when check_violation then null; end;
  update public.luxor_payment_installments set metadata='{"installment_allocation_legacy_baseline":0}' where id='40000000-0000-4000-8000-000000000001';
  if has_function_privilege('anon','public.luxor_correct_manual_installment_payment(uuid,uuid,timestamptz,text,text)','execute') or has_function_privilege('authenticated','public.luxor_correct_manual_installment_payment(uuid,uuid,timestamptz,text,text)','execute') or not has_function_privilege('service_role','public.luxor_correct_manual_installment_payment(uuid,uuid,timestamptz,text,text)','execute') then raise exception 'invalid RPC permissions'; end if;
  insert into public.luxor_email_jobs values ('60000000-0000-4000-8000-000000000001','transactional_notice','queued','{"transactionalNotice":{"kind":"payment_receipt","key":"payment_receipt/50000000-0000-4000-8000-000000000001"}}');
  begin perform public.luxor_correct_manual_installment_payment('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-01 00:00:00+00','owner@example.invalid','mistake'); raise exception 'receipt email accepted'; exception when check_violation then null; end;
  delete from public.luxor_email_jobs;
  insert into public.luxor_payment_refunds values ('50000000-0000-4000-8000-000000000001');
  begin perform public.luxor_correct_manual_installment_payment('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-01 00:00:00+00','owner@example.invalid','mistake'); raise exception 'refund accepted'; exception when check_violation then null; end;
  delete from public.luxor_payment_refunds;
  perform public.luxor_correct_manual_installment_payment('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-01 00:00:00+00','owner@example.invalid','mistake');
  if (select status from public.luxor_payments where id='50000000-0000-4000-8000-000000000001') <> 'void' or (select status from public.luxor_payment_installments where id='40000000-0000-4000-8000-000000000001') <> 'scheduled' or (select status from public.luxor_invoices where id='30000000-0000-4000-8000-000000000001') <> 'sent' or (select count(*) from public.luxor_manual_payment_corrections) <> 1 or (select count(*) from public.luxor_payment_installment_allocations) <> 1 then raise exception 'correction state invalid'; end if;
  begin insert into public.luxor_email_jobs values ('60000000-0000-4000-8000-000000000001','transactional_notice','queued','{"transactionalNotice":{"kind":"payment_receipt","key":"payment_receipt/50000000-0000-4000-8000-000000000001"}}'); raise exception 'corrected receipt queued'; exception when check_violation then null; end;
  begin perform public.luxor_correct_manual_installment_payment('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-01 00:00:00+00','owner@example.invalid','mistake'); raise exception 'repeat accepted'; exception when serialization_failure then null; end;
end $$;
rollback;

