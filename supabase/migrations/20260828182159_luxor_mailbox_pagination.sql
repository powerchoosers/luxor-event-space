set local lock_timeout='5s';

-- Same folder identity rules as luxorMailFolders.ts, enforced before paging.
create function public.luxor_mail_folder_key(p_direction text,p_metadata jsonb)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare f jsonb:=p_metadata->'zohoFolder';
begin
  if p_metadata->>'source' is distinct from 'zoho-history-import' then
    return case when p_direction='incoming' then 'inbox' else 'sent' end;
  end if;
  if coalesce(p_metadata->>'zohoAccountId','') !~ '^[0-9]+$' or coalesce(f->>'id','') !~ '^[0-9]+$' then
    raise exception 'Imported folder identity is incomplete'; end if;
  if p_metadata->>'historyMissingFromSource'='true' then return 'retained'; end if;
  if f->>'type' in ('Inbox','Sent','Drafts','Templates','Spam','Trash','Outbox') and f->>'path'='/'||(f->>'type') then
    return lower(f->>'type'); end if;
  return 'zoho-'||(p_metadata->>'zohoAccountId')||'-'||(f->>'id');
end; $$;

-- A single statement supplies a consistent count/page across every saved feed.
-- Only summaries cross the API boundary; bodies and attachments load on open.
create function public.luxor_mailbox_page(p_folder text default 'inbox',p_query text default '',p_page integer default 1,
  p_size integer default 25,p_snapshot timestamptz default null,p_starred text[] default '{}',p_email text default '')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; cutoff timestamptz:=coalesce(p_snapshot,statement_timestamp());
begin
  if p_folder is null or (p_folder not in ('all','inbox','sent','campaigns','starred','drafts','templates','spam','trash','outbox','retained')
    and p_folder !~ '^zoho-[0-9]+-[0-9]+$') or p_page is null or p_page<1 or p_size is null or p_size not between 1 and 100
    or p_query is null or length(p_query)>200 or p_email is null or length(p_email)>254
    or p_starred is null or cardinality(p_starred)>10000 or cutoff>statement_timestamp()+interval '1 minute' then
    raise exception 'Invalid mailbox page request'; end if;
  with native as materialized (
    select m.*,public.luxor_mail_folder_key(m.direction,m.metadata) as folder_key
    from public.luxor_mail_messages m where m.status<>'importing' and m.created_at<=cutoff and m.occurred_at<=cutoff
      and coalesce(m.metadata->>'historyStaged','false')='false'
      and coalesce(m.metadata->>'historySuperseded','false')='false'
  ), events as (
    select distinct on (coalesce(e.metadata->'cachedMessage'->>'id',e.message_id,'event-'||e.id))
      e.*,coalesce(e.metadata->'cachedMessage'->>'id',e.message_id,'event-'||e.id) as display_id
    from public.luxor_email_events e where e.created_at<=cutoff and e.received_at<=cutoff
    order by coalesce(e.metadata->'cachedMessage'->>'id',e.message_id,'event-'||e.id),e.received_at desc,e.id desc
  ), feeds as (
    select 'mail-'||m.id as id,m.occurred_at as sort_at,0 as precedence,m.folder_key as folder,
      array_prepend(m.from_address,m.to_addresses||m.cc_addresses) as addresses,
      concat_ws(' ',m.subject,m.from_address,array_to_string(m.to_addresses,' '),m.metadata->>'fromName',m.text_body) as search_text,
      jsonb_build_object('id','mail-'||m.id,'threadId',m.thread_key,'folder',m.folder_key,
        'folderId',case when m.metadata->>'source'='zoho-history-import' then 'zoho-'||(m.metadata->>'zohoAccountId')||'-'||(m.metadata->'zohoFolder'->>'id') else m.folder_key end,
        'folderName',coalesce(m.metadata->'zohoFolder'->>'path',m.folder_key),'folderPath',coalesce(m.metadata->'zohoFolder'->>'path',''),
        'subject',m.subject,'from',case when coalesce(m.metadata->>'fromName','')<>'' then regexp_replace(m.metadata->>'fromName','[\r\n"<>]','','g')||' <'||m.from_address||'>' else m.from_address end,
        'to',array_to_string(m.to_addresses,', '),'cc',array_to_string(m.cc_addresses,', '),'receivedAt',m.occurred_at,
        'summary',left(regexp_replace(m.text_body,'\s+',' ','g'),280),'hasAttachment',coalesce(m.metadata->>'hasAttachments','false')='true',
        'direction',m.direction,'isRead',m.read_at is not null or m.direction='outgoing','storedLocally',true,
        'deliveryStatus',case when m.direction='outgoing' then m.status end,'deliveryError',case when m.direction='outgoing' then m.last_error end,
        'legacyMessageId',case when m.provider='zoho' and m.metadata->>'importComplete'='true' then m.metadata->>'zohoMessageId' end) as item
    from native m where m.created_at<=cutoff and m.occurred_at<=cutoff
    union all
    select e.display_id,e.received_at,1,'inbox',array[e.sender_email,e.recipient_email],
      concat_ws(' ',e.subject,e.sender_name,e.sender_email,e.recipient_email,e.metadata->'cachedMessage'->>'summary'),
      jsonb_build_object('id',e.display_id,'threadId',e.metadata->'cachedMessage'->>'threadId','folderId',e.metadata->>'folderId',
        'subject',e.subject,'from',case when coalesce(e.sender_name,'')<>'' then e.sender_name||' <'||coalesce(e.sender_email,'')||'>' else coalesce(e.sender_email,'Unknown sender') end,
        'to',coalesce(e.recipient_email,''),'receivedAt',e.received_at,'summary',coalesce(e.metadata->'cachedMessage'->>'summary','Email body awaiting sync.'),
        'direction','incoming','folder','inbox','isRead',false,'hasAttachment',false,'storedLocally',true)
    from events e where e.display_id not like 'mail-%'
      and not exists(select 1 from native m where 'mail-'||m.id=e.display_id
        or (m.provider='zoho' and m.metadata->>'importComplete'='true' and m.metadata->>'zohoMessageId'=e.display_id))
    union all
    select 'job-'||j.id,coalesce(j.sent_at,j.scheduled_for),2,'sent',array['booking@luxoratlaspalmas.com',j.recipient_email],
      concat_ws(' ',j.subject,j.recipient_email,j.body),
      jsonb_build_object('id','job-'||j.id,'subject',j.subject,'from','booking@luxoratlaspalmas.com','to',j.recipient_email,
        'receivedAt',coalesce(j.sent_at,j.scheduled_for),'summary',left(regexp_replace(regexp_replace(regexp_replace(j.body,'<(style|script)[^>]*>.*?</\1>',' ','gis'),'<[^>]*>',' ','g'),'\s+',' ','g'),280),
        'direction','outgoing','folder','sent','isRead',true,'hasAttachment',false,'storedLocally',true)
    from public.luxor_email_jobs j where j.status in ('sent','sending') and j.created_at<=cutoff and coalesce(j.sent_at,j.scheduled_for)<=cutoff
      and not exists(select 1 from native m where m.metadata->>'emailJobId'=j.id::text)
    union all
    select 'campaign-'||c.id,coalesce(c.sent_at,c.created_at),3,'campaigns','{}'::text[],
      concat_ws(' ',c.subject,c.name,c.audience_label),
      jsonb_build_object('id','campaign-'||c.id,'subject',coalesce(nullif(c.subject,''),c.name),'from','booking@luxoratlaspalmas.com',
        'to',coalesce(c.audience_label,c.recipient_count||' Recipients'),'receivedAt',coalesce(c.sent_at,c.created_at),
        'summary','Marketing Campaign Blast: '||c.name||'. '||eng.sent||' sent, '||eng.opens||' opens, '||eng.clicks||' clicks.',
        'direction','campaign','folder','campaigns','isRead',true,'hasAttachment',false,'storedLocally',true,
        'engagement',jsonb_build_object('openCount',eng.opens,'clickCount',eng.clicks))
    from public.luxor_marketing_campaigns c cross join lateral (
      select count(*) filter(where r.status='sent') as sent,coalesce(sum(r.open_count),0) as opens,coalesce(sum(r.click_count),0) as clicks
      from public.luxor_marketing_recipients r where r.campaign_id=c.id
    ) eng where p_email='' and c.created_at<=cutoff and coalesce(c.sent_at,c.created_at)<=cutoff
  ), visible as materialized (
    select distinct on (id) * from feeds f where p_email='' or exists(select 1 from unnest(f.addresses) a where lower(a)=lower(p_email))
    order by id,precedence,sort_at desc
  ), filtered as materialized (
    select * from visible v where (p_folder='all' or v.folder=p_folder or (p_folder='sent' and v.folder in ('outbox','campaigns'))
      or (p_folder='starred' and v.id=any(p_starred)))
      and (btrim(p_query)='' or strpos(lower(v.search_text),lower(btrim(p_query)))>0
        or exists(select 1 from public.luxor_inquiries i where exists(select 1 from unnest(v.addresses) a where lower(a)=lower(i.email))
          and strpos(lower(i.full_name),lower(btrim(p_query)))>0))
  ), totals as (select count(*) as total from filtered), page_info as (
    select total,least(p_page::bigint,greatest(1,(total+p_size-1)/p_size)) as page from totals
  ), page_items as (
    select item,sort_at,id from filtered order by sort_at desc,id collate "C" desc
    limit p_size offset (select (page-1)*p_size from page_info)
  )
  select jsonb_build_object('snapshot',cutoff,'page',pi.page,'pageSize',p_size,'total',pi.total,
    'messages',coalesce((select jsonb_agg(item order by sort_at desc,id collate "C" desc) from page_items),'[]'::jsonb),
    'stats',(select jsonb_build_object('total',count(*),'inboxCount',count(*) filter(where folder='inbox'),
      'sentCount',count(*) filter(where folder in ('sent','outbox','campaigns')),'campaignCount',count(*) filter(where folder='campaigns'),
      'starredCount',count(*) filter(where id=any(p_starred))) from visible),
    'folderCounts',coalesce((select jsonb_object_agg(folder,n) from (select folder,count(*) n from visible group by folder) fc),'{}'::jsonb),
    'folders',coalesce((select jsonb_agg(jsonb_build_object('folder',folder,'folderId',item->>'folderId',
      'folderName',coalesce(item->>'folderName',folder),'folderPath',coalesce(item->>'folderPath','')))
      from (select distinct on (folder) folder,item from visible order by folder,id) names),'[]'::jsonb))
    into result from page_info pi;
  return result;
end; $$;
revoke all on function public.luxor_mail_folder_key(text,jsonb),public.luxor_mailbox_page(text,text,integer,integer,timestamptz,text[],text) from public,anon,authenticated;
grant execute on function public.luxor_mail_folder_key(text,jsonb),public.luxor_mailbox_page(text,text,integer,integer,timestamptz,text[],text) to service_role;
