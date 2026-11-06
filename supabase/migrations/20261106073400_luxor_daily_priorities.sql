-- Migration: 20261106073400_luxor_daily_priorities.sql
-- Table to store AI-generated daily priorities for Luxor Operations Hub

CREATE TABLE IF NOT EXISTS public.luxor_daily_priorities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority_date DATE NOT NULL,
    rank INT NOT NULL,
    title TEXT NOT NULL,
    meta TEXT,
    action_type TEXT,
    reasoning TEXT,
    href TEXT NOT NULL,
    is_overdue BOOLEAN NOT NULL DEFAULT false,
    completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    target_id TEXT,
    target_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    CONSTRAINT luxor_daily_priorities_date_rank_unique UNIQUE (priority_date, rank)
);

CREATE INDEX IF NOT EXISTS idx_luxor_daily_priorities_date ON public.luxor_daily_priorities (priority_date);

ALTER TABLE public.luxor_daily_priorities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'luxor_daily_priorities' AND policyname = 'Service role can manage Luxor daily priorities'
  ) THEN
    CREATE POLICY "Service role can manage Luxor daily priorities"
      ON public.luxor_daily_priorities
      FOR ALL
      TO service_role
      USING ((SELECT current_setting('role'::text, true)) = 'service_role'::text)
      WITH CHECK ((SELECT current_setting('role'::text, true)) = 'service_role'::text);
  END IF;
END $$;
