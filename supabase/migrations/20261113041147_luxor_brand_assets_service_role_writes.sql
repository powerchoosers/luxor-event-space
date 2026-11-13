-- Tighten luxor_brand_assets so only service_role can write.
-- Keep public SELECT for anon and authenticated.

DROP POLICY IF EXISTS "Allow full access to service_role" ON public.luxor_brand_assets;

DROP POLICY IF EXISTS "Service role manages brand assets" ON public.luxor_brand_assets;
CREATE POLICY "Service role manages brand assets"
  ON public.luxor_brand_assets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.luxor_brand_assets
  FROM anon, authenticated;

GRANT SELECT ON public.luxor_brand_assets TO anon, authenticated;
GRANT ALL ON public.luxor_brand_assets TO service_role;

NOTIFY pgrst, 'reload schema';
