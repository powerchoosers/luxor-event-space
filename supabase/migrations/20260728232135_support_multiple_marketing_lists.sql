-- A contact can belong to more than one saved marketing list. Previously the
-- email-only unique constraint made a second list assignment overwrite the
-- first membership.
update public.luxor_marketing_list
set
  email = lower(trim(email)),
  source = coalesce(nullif(trim(source), ''), 'Uncategorized');

alter table public.luxor_marketing_list
  alter column email set not null,
  alter column source set not null;

alter table public.luxor_marketing_list
  drop constraint if exists luxor_marketing_list_email_key;

alter table public.luxor_marketing_list
  add constraint luxor_marketing_list_email_source_key unique (email, source),
  add constraint luxor_marketing_list_email_normalized_check
    check (email = lower(trim(email))),
  add constraint luxor_marketing_list_source_length_check
    check (char_length(source) between 1 and 120);

create index if not exists luxor_marketing_list_source_idx
  on public.luxor_marketing_list (source, created_at desc);

notify pgrst, 'reload schema';
