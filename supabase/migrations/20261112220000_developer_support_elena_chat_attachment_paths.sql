-- Allow developer-support tickets to reuse persisted Elena chat files in luxor-documents.
create or replace function public.luxor_elena_validate_developer_support_attachments(p_attachments jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
begin
  if p_attachments is null then
    raise exception 'Confirmation unavailable' using errcode = '22023';
  end if;
  if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) > 5 then
    raise exception 'Confirmation unavailable' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_attachments) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'Confirmation unavailable' using errcode = '22023';
    end if;
    if coalesce(item->>'kind', '') not in ('image', 'pdf', 'text') then
      raise exception 'Confirmation unavailable' using errcode = '22023';
    end if;
    if coalesce(item->>'file_name', '') = '' or char_length(item->>'file_name') > 200 then
      raise exception 'Confirmation unavailable' using errcode = '22023';
    end if;
    if item->>'kind' = 'text' then
      if item->>'text_excerpt' is null or char_length(item->>'text_excerpt') < 1 or char_length(item->>'text_excerpt') > 12000 then
        raise exception 'Confirmation unavailable' using errcode = '22023';
      end if;
      if item->>'storage_path' is not null then
        raise exception 'Confirmation unavailable' using errcode = '22023';
      end if;
    else
      if item->>'storage_path' is null
        or item->>'storage_path' !~ '^(developer-support|elena-chat)/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
        raise exception 'Confirmation unavailable' using errcode = '22023';
      end if;
      if item->>'text_excerpt' is not null then
        raise exception 'Confirmation unavailable' using errcode = '22023';
      end if;
    end if;
  end loop;
end;
$$;
