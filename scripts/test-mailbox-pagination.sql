-- Entire test is rolled back; no real messages, deliveries or storage writes.
begin;
set local role service_role;
do $$
declare result jsonb; snap timestamptz:=now(); ids text[]:='{}'; page_number integer; message jsonb;
  prefix text:='pageqa-'||gen_random_uuid(); job_id uuid; mail_id uuid; campaign_id uuid;
  f jsonb:='{"id":"99002","name":"Empty","type":"Inbox","path":"/Clients/Empty"}';
begin
  insert into public.luxor_mail_messages(id,provider,provider_id,direction,thread_key,from_address,to_addresses,subject,text_body,status,occurred_at,created_at)
    select ('01990000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'resend',prefix||n,'incoming',prefix,
      'pagination@example.invalid','{booking@luxoratlaspalmas.com}',case when n=1 then 'Needle in old history' else 'Page test '||n end,
      repeat('Body not returned in full. ',100),'received',snap-interval '1 day',snap-interval '1 day'
    from generate_series(1,1105) n;
  for page_number in 1..12 loop
    result:=public.luxor_mailbox_page('all','',page_number,100,snap,'{}','pagination@example.invalid');
    if result->>'total'<>'1105' then raise exception 'History capped: %',result->>'total'; end if;
    for message in select value from jsonb_array_elements(result->'messages') loop
      if message->>'id'=any(ids) then raise exception 'Duplicate across pages'; end if;
      if message ? 'content' or message ? 'htmlContent' or length(message->>'summary')>280 then raise exception 'Full body leaked into list'; end if;
      ids:=array_append(ids,message->>'id');
    end loop;
  end loop;
  if cardinality(ids)<>1105 then raise exception 'History missing across page boundary'; end if;
  result:=public.luxor_mailbox_page('inbox','Needle in old history',1,25,snap,'{}','pagination@example.invalid');
  if result->>'total'<>'1' or result->'messages'->0->>'subject'<>'Needle in old history' then raise exception 'Search only examined current page'; end if;
  result:=public.luxor_mailbox_page('inbox','%',1,25,snap,'{}','pagination@example.invalid');
  if result->>'total'<>'0' then raise exception 'Search interpreted SQL wildcard'; end if;
  result:=public.luxor_mailbox_page('starred','',1,25,snap,array[ids[1105]],'pagination@example.invalid');
  if result->>'total'<>'1' or result->'messages'->0->>'id'<>ids[1105] then raise exception 'Off-page starred message missing'; end if;
  result:=public.luxor_mailbox_page('inbox','',2147483647,25,snap,'{}','pagination@example.invalid');
  if result->>'page'<>'45' or jsonb_array_length(result->'messages')<>5 then raise exception 'Out-of-range page not clamped'; end if;
  -- New arrivals cannot shift the existing browsing window until refresh.
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,status,occurred_at,created_at)
    values ('resend',prefix||'new','incoming',prefix,'pagination@example.invalid','{booking@luxoratlaspalmas.com}','New arrival','received',snap+interval '1 second',snap+interval '1 second');
  result:=public.luxor_mailbox_page('all','',1,25,snap,'{}','pagination@example.invalid');
  if result->>'total'<>'1105' then raise exception 'New arrival shifted snapshot'; end if;
  -- Staged and older versions never contribute to counts/search/pages.
  update public.luxor_mail_messages set metadata='{"historyStaged":true}' where id='01990000-0000-0000-0000-000000000001';
  update public.luxor_mail_messages set metadata='{"historySuperseded":true}' where id='01990000-0000-0000-0000-000000000002';
  result:=public.luxor_mailbox_page('all','',1,25,snap,'{}','pagination@example.invalid');
  if result->>'total'<>'1103' then raise exception 'Hidden versions counted'; end if;
  -- Imported custom folders remain separate even when Zoho calls them Inbox.
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,status,occurred_at,created_at,metadata)
    values ('zoho','99990001:99003','incoming',prefix,'pagination@example.invalid','{booking@luxoratlaspalmas.com}','Custom folder message','received',snap-interval '2 days',snap-interval '2 days',
      jsonb_build_object('source','zoho-history-import','zohoAccountId','99990001','zohoMessageId','99003','zohoFolder',f,'importComplete',true)) returning id into mail_id;
  insert into public.luxor_email_events(event_key,message_id,sender_email,recipient_email,subject,received_at,created_at)
    values(prefix||'legacy','99003','pagination@example.invalid','booking@luxoratlaspalmas.com','Duplicate preview',snap-interval '1 day',snap-interval '1 day');
  result:=public.luxor_mailbox_page('zoho-99990001-99002','',1,25,snap,'{}','pagination@example.invalid');
  if result->>'total'<>'1' or result->'messages'->0->>'id'<>'mail-'||mail_id then raise exception 'Custom folder mapping failed'; end if;
  result:=public.luxor_mailbox_page('inbox','Duplicate preview',1,25,snap,'{}','pagination@example.invalid');
  if result->>'total'<>'0' then raise exception 'Legacy preview resurfaced outside its canonical folder'; end if;
  update public.luxor_mail_messages set metadata=metadata||'{"historyMissingFromSource":true}' where id=mail_id;
  result:=public.luxor_mailbox_page('retained','',1,25,snap,'{}','pagination@example.invalid');
  if result->>'total'<>'1' then raise exception 'Retained folder unavailable'; end if;
  -- Only one entry for an archived outgoing job; legacy jobs remain pageable.
  insert into public.luxor_email_jobs(job_type,status,recipient_email,subject,body,scheduled_for,sent_at,created_at)
    values('tour_confirmation','sent','pagination@example.invalid','Saved job','Body',snap-interval '1 day',snap-interval '1 day',snap-interval '1 day') returning id into job_id;
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,status,occurred_at,created_at,metadata)
    values('resend',prefix||'job','outgoing',prefix,'booking@luxoratlaspalmas.com','{pagination@example.invalid}','Saved job','sent',snap-interval '1 day',snap-interval '1 day',jsonb_build_object('emailJobId',job_id));
  result:=public.luxor_mailbox_page('sent','Saved job',1,25,snap,'{}','pagination@example.invalid');
  if result->>'total'<>'1' then raise exception 'Outbox job duplicate'; end if;
  -- Aggregate all campaign recipients, not a PostgREST-limited first thousand.
  insert into public.luxor_marketing_campaigns(name,subject,html_body,status,created_at,sent_at)
    values(prefix,'Pagination campaign','<p>Test only</p>','sent',snap-interval '1 day',snap-interval '1 day') returning id into campaign_id;
  insert into public.luxor_marketing_recipients(campaign_id,email,status,tracking_token,open_count,click_count)
    select campaign_id,'recipient'||n||'@example.invalid','sent',prefix||n,1,1 from generate_series(1,1105) n;
  result:=public.luxor_mailbox_page('campaigns',prefix,1,25,snap);
  if result->'messages'->0->'engagement'->>'openCount'<>'1105' then raise exception 'Campaign recipient counts capped'; end if;
end; $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.luxor_mailbox_page(text,text,integer,integer,timestamptz,text[],text)','execute')
    or has_function_privilege('authenticated','public.luxor_mailbox_page(text,text,integer,integer,timestamptz,text[],text)','execute')
    or exists(select 1 from pg_proc where proname in ('luxor_mailbox_page','luxor_mail_folder_key') and prosecdef) then raise exception 'Mailbox page is not private/invoker'; end if;
end; $$;
select 'PASS uncapped paging, timestamp ties, full-history literal search, starred IDs, snapshot arrivals, hidden versions, folders, legacy/job dedup and uncapped campaign counts' as result;
rollback;
