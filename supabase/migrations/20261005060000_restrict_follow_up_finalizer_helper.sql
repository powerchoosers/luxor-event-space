-- The locked helper is callable only from the SECURITY DEFINER entrypoints.
-- Service role can invoke the validated finalizer/control/response RPCs, not
-- the internal helper with caller-selected timestamps or inquiry IDs.
revoke all on function public.luxor_finalize_brochure_follow_up_locked(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
