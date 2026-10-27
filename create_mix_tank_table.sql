-- ==============================================================================
-- MIX TANK REQUESTS TABLE SETUP (FM-QC003)
-- Laboratory Request Management System (RMIS)
-- ==============================================================================

-- 1. Create Table
CREATE TABLE IF NOT EXISTS public.mix_tank_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no TEXT UNIQUE,
    request_date DATE,
    to_dept TEXT DEFAULT 'QC',
    tank_name TEXT,
    customer TEXT,
    product_name TEXT,
    batch_number TEXT,
    status TEXT DEFAULT 'Pending',
    top_up_items JSONB DEFAULT '[]'::jsonb,
    before_item JSONB DEFAULT '{}'::jsonb,
    after_item JSONB DEFAULT '{}'::jsonb,
    density_15 TEXT,
    density_30 TEXT,
    remark TEXT,
    prepared_by_name TEXT,
    prepared_by_id TEXT,
    prepared_signature_url TEXT,
    prepared_at TIMESTAMPTZ,
    tested_by_name TEXT,
    tested_by_id TEXT,
    tested_signature_url TEXT,
    tested_at TIMESTAMPTZ,
    approved_by_name TEXT,
    approved_by_id TEXT,
    approved_signature_url TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if table already created
ALTER TABLE public.mix_tank_requests ADD COLUMN IF NOT EXISTS customer TEXT;
ALTER TABLE public.mix_tank_requests ADD COLUMN IF NOT EXISTS batch_number TEXT;

-- 2. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_mix_tank_doc_no ON public.mix_tank_requests(doc_no);
CREATE INDEX IF NOT EXISTS idx_mix_tank_status ON public.mix_tank_requests(status);
CREATE INDEX IF NOT EXISTS idx_mix_tank_request_date ON public.mix_tank_requests(request_date);
CREATE INDEX IF NOT EXISTS idx_mix_tank_created_at ON public.mix_tank_requests(created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.mix_tank_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated and anon on mix_tank_requests" ON public.mix_tank_requests;
CREATE POLICY "Allow all for authenticated and anon on mix_tank_requests"
ON public.mix_tank_requests
FOR ALL
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- 4. Enable Supabase Realtime (Optional / Recommended)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mix_tank_requests;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- ignore if already added
END $$;
