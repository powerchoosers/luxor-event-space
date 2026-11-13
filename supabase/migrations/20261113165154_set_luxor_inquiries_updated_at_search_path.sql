-- Pin search_path on the inquiries updated_at trigger function (advisor 0011).
ALTER FUNCTION public.set_luxor_inquiries_updated_at() SET search_path = '';
