alter table public.luxor_phone_numbers
  add column if not exists is_public boolean not null default false;

create unique index if not exists luxor_phone_numbers_one_public_idx
  on public.luxor_phone_numbers (is_public)
  where is_public = true;

update public.luxor_phone_numbers
set is_public = true,
    updated_at = timezone('utc'::text, now())
where id = (
  select id
  from public.luxor_phone_numbers
  where is_active = true
  order by updated_at desc
  limit 1
)
and not exists (
  select 1
  from public.luxor_phone_numbers
  where is_public = true
);
