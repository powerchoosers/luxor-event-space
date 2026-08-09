do $$
begin
  if to_regclass('public.luxor_marketing_campaigns') is not null then
    update public.luxor_marketing_campaigns
    set status = 'cancelled', updated_at = timezone('utc', now())
    where metadata->>'campaign_key' = 'grand_opening_2026_07_25'
      and status in ('draft', 'scheduled', 'sending');
  end if;
  if to_regclass('public.luxor_marketing_recipients') is not null then
    update public.luxor_marketing_recipients
    set status = 'cancelled', updated_at = timezone('utc', now())
    where campaign_id in (
      select id from public.luxor_marketing_campaigns
      where metadata->>'campaign_key' = 'grand_opening_2026_07_25'
    ) and status = 'queued';
  end if;
end $$;

notify pgrst, 'reload schema';
