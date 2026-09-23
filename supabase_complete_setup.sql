-- ==============================================================================
-- LABORATORY REQUEST MANAGEMENT SYSTEM (RMIS)
-- MASTER SUPABASE DATABASE SETUP & SCHEMA DEFINITION
-- Consolidated single SQL script containing all schemas, views, indexes,
-- security functions, RLS policies, triggers, and configuration.
-- ==============================================================================
-- Instructions:
-- 1. Open Supabase Dashboard -> SQL Editor
-- 2. Paste the entire content of this script and click "Run"
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLES
-- ==============================================================================

-- 2.1 Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'requester' CHECK (role IN ('requester', 'admin', 'lab', 'base_oil')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.2 User Signatures Table
CREATE TABLE IF NOT EXISTS public.user_signatures (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  signature_url TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 2.3 Requests Table (Laboratory inspection requests)
CREATE TABLE IF NOT EXISTS public.requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_no INT,
  request_year INT,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_time TIME NOT NULL DEFAULT CURRENT_TIME,
  customer_name TEXT NOT NULL,
  requester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  car_plate TEXT,
  seal_no TEXT,
  container_no TEXT,
  notes TEXT,
  lab_comments TEXT,
  po_number TEXT DEFAULT '',
  need_base_oil_view BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Draft', 'Pending', 'In Process', 'Complete', 'Approved', 'Rejected')),
  
  -- Admin Approval Fields
  approved BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_name TEXT,
  approved_role TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_signature_snapshot TEXT,

  -- Lab Approval Fields
  lab_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  lab_approved_at TIMESTAMP WITH TIME ZONE,
  lab_signature_snapshot TEXT,

  -- Rejection Fields
  rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_name TEXT,
  rejected_role TEXT,
  rejected_at TIMESTAMP WITH TIME ZONE,
  reject_reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_request_no_year UNIQUE (request_no, request_year)
);

-- 2.4 Request Items Table (Materials/products tested per request)
CREATE TABLE IF NOT EXISTS public.request_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.requests(id) ON DELETE CASCADE NOT NULL,
  product_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  quantity TEXT NOT NULL,
  rm_no TEXT,
  test_result TEXT NOT NULL DEFAULT 'In Process' CHECK (test_result IN ('In Process', 'Pass', 'Fail', 'Hold')),
  inspection_date DATE,
  item_comment TEXT,
  density_15c TEXT,
  density_30c TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.5 Edit Requests Table (Workflow audit trail for editing locked requests)
CREATE TABLE IF NOT EXISTS public.edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.profiles(id),
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Completed', 'Rejected')),
  actioned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actioned_at TIMESTAMP WITH TIME ZONE,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.6 Historical Material Records Table (Legacy material test archive)
CREATE TABLE IF NOT EXISTS public.historical_material_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receive_date DATE,
  product_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  quantity TEXT,
  rm_no TEXT,
  density_15c TEXT,
  density_30c TEXT,
  test_result TEXT DEFAULT 'Pass',
  item_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.7 System Settings Table (LINE Notify, Webhooks & global configs)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2.8 Push Subscriptions Table (Web Push Notifications)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- 3. VIEWS
-- ==============================================================================

-- 3.1 Material History View (Union of active requests and historical archive)
DROP VIEW IF EXISTS public.vw_material_history CASCADE;
CREATE VIEW public.vw_material_history WITH (security_invoker = true) AS
SELECT 
  ri.id AS id,
  ri.id AS item_id,
  ri.request_id AS request_id,
  r.request_no::text AS request_no,
  r.request_year::text AS request_year,
  r.request_date::text AS request_date,
  r.request_time::text AS request_time,
  r.customer_name::text AS customer_name,
  r.status::text AS status,
  r.status::text AS request_status,
  COALESCE(p.display_name, 'ไม่ระบุ') AS requester_name,
  ri.product_name::text AS product_name,
  ri.batch_number::text AS batch_number,
  ri.quantity::text AS quantity,
  ri.rm_no::text AS rm_no,
  ri.test_result::text AS test_result,
  COALESCE(ri.inspection_date::text, '') AS inspection_date,
  COALESCE(ri.item_comment::text, '') AS item_comment,
  COALESCE(ri.density_15c::text, '') AS density_15c,
  COALESCE(ri.density_30c::text, '') AS density_30c,
  false AS is_historical
FROM public.request_items ri
JOIN public.requests r ON ri.request_id = r.id
LEFT JOIN public.profiles p ON r.requester_id = p.id
WHERE r.status != 'Draft'

UNION ALL

SELECT 
  h.id AS id,
  h.id AS item_id,
  NULL::uuid AS request_id,
  'HISTORICAL'::text AS request_no,
  ''::text AS request_year,
  COALESCE(h.receive_date::text, h.created_at::date::text) AS request_date,
  ''::text AS request_time,
  'นำเข้าย้อนหลัง (Historical)'::text AS customer_name,
  'Complete'::text AS status,
  'Complete'::text AS request_status,
  'System Import'::text AS requester_name,
  COALESCE(h.product_name::text, '') AS product_name,
  COALESCE(h.batch_number::text, '') AS batch_number,
  COALESCE(h.quantity::text, '') AS quantity,
  COALESCE(h.rm_no::text, '') AS rm_no,
  COALESCE(h.test_result::text, 'Pass') AS test_result,
  COALESCE(h.receive_date::text, '') AS inspection_date,
  COALESCE(h.item_comment::text, '') AS item_comment,
  COALESCE(h.density_15c::text, '') AS density_15c,
  COALESCE(h.density_30c::text, '') AS density_30c,
  true AS is_historical
FROM public.historical_material_records h;

REVOKE ALL ON public.vw_material_history FROM anon;
GRANT SELECT ON public.vw_material_history TO authenticated;

-- ==============================================================================
-- 4. PERFORMANCE & SEARCH INDEXES
-- ==============================================================================

-- Requests Indexes
CREATE INDEX IF NOT EXISTS idx_requests_year_no ON public.requests (request_year DESC, request_no DESC);
CREATE INDEX IF NOT EXISTS idx_requests_date ON public.requests (request_date DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_requester ON public.requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_customer ON public.requests (customer_name);
CREATE INDEX IF NOT EXISTS idx_requests_base_oil ON public.requests (need_base_oil_view) WHERE need_base_oil_view = true;

-- Request Items Indexes
CREATE INDEX IF NOT EXISTS idx_request_items_request_id ON public.request_items (request_id);
CREATE INDEX IF NOT EXISTS idx_request_items_test_result ON public.request_items (test_result);
CREATE INDEX IF NOT EXISTS idx_request_items_product ON public.request_items (product_name);
CREATE INDEX IF NOT EXISTS idx_request_items_batch ON public.request_items (batch_number);
CREATE INDEX IF NOT EXISTS idx_request_items_rm_no ON public.request_items (rm_no);
CREATE INDEX IF NOT EXISTS idx_request_items_inspection_date ON public.request_items (inspection_date DESC);

-- Edit Requests Indexes
CREATE INDEX IF NOT EXISTS idx_edit_requests_req_status ON public.edit_requests (request_id, status);
CREATE INDEX IF NOT EXISTS idx_edit_requests_requester_id ON public.edit_requests (requester_id);

-- Push Subscriptions Indexes
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_role ON public.push_subscriptions (role);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions (user_id);

-- Historical Material Records Indexes
CREATE INDEX IF NOT EXISTS idx_hist_mat_product ON public.historical_material_records (product_name);
CREATE INDEX IF NOT EXISTS idx_hist_mat_batch ON public.historical_material_records (batch_number);

-- ==============================================================================
-- 5. FUNCTIONS & TRIGGERS
-- ==============================================================================

-- 5.1 Auto-generate request_no and request_year (Drafts are skipped)
CREATE OR REPLACE FUNCTION public.set_request_no()
RETURNS TRIGGER AS $$
DECLARE
  v_current_year INT;
  v_next_no INT;
BEGIN
  -- If it is a draft, do not assign a request_no yet
  IF NEW.status = 'Draft' THEN
     IF NEW.request_year IS NULL THEN
         SELECT EXTRACT(YEAR FROM CURRENT_DATE) INTO v_current_year;
         NEW.request_year := v_current_year;
     END IF;
     RETURN NEW;
  END IF;

  -- Generate request_no if not already set
  IF NEW.request_no IS NULL THEN
      SELECT EXTRACT(YEAR FROM CURRENT_DATE) INTO v_current_year;
      NEW.request_year := v_current_year;
      
      SELECT COALESCE(MAX(request_no), 0) + 1
      INTO v_next_no
      FROM public.requests
      WHERE request_year = v_current_year AND request_no IS NOT NULL;
      
      NEW.request_no := v_next_no;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_request_no ON public.requests;
CREATE TRIGGER trg_set_request_no
BEFORE INSERT OR UPDATE ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.set_request_no();


-- 5.2 Auto-calculate request status from item test results
CREATE OR REPLACE FUNCTION public.update_request_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total_count INT;
  v_progress_count INT;
  v_has_data_count INT;
  v_request_id UUID;
  v_current_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_request_id := OLD.request_id;
  ELSE
    v_request_id := NEW.request_id;
  END IF;

  -- Do not auto-change status if request is in Terminal/Approved/Rejected/Draft status
  SELECT status INTO v_current_status FROM public.requests WHERE id = v_request_id;
  IF v_current_status IN ('Draft', 'Rejected', 'Approved') THEN
    RETURN NULL;
  END IF;

  -- Count items
  SELECT 
    COUNT(id),
    COUNT(CASE WHEN test_result = 'In Process' OR rm_no IS NULL OR TRIM(rm_no) = '' THEN 1 END),
    COUNT(CASE WHEN test_result != 'In Process' OR (rm_no IS NOT NULL AND TRIM(rm_no) != '') THEN 1 END)
  INTO v_total_count, v_progress_count, v_has_data_count
  FROM public.request_items
  WHERE request_id = v_request_id;

  IF v_total_count = 0 THEN
    UPDATE public.requests SET status = 'Pending' WHERE id = v_request_id;
  ELSIF v_progress_count = 0 THEN
    UPDATE public.requests SET status = 'Complete' WHERE id = v_request_id;
  ELSIF v_has_data_count > 0 AND v_progress_count > 0 THEN
    UPDATE public.requests SET status = 'In Process' WHERE id = v_request_id;
  ELSE
    UPDATE public.requests SET status = 'Pending' WHERE id = v_request_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_request_status ON public.request_items;
CREATE TRIGGER trg_update_request_status
AFTER INSERT OR UPDATE OR DELETE ON public.request_items
FOR EACH ROW
EXECUTE FUNCTION public.update_request_status();


-- 5.3 Enforce Lab edit restrictions (Lab cannot change requester fields without approved Edit Request)
CREATE OR REPLACE FUNCTION public.check_lab_request_update()
RETURNS TRIGGER AS $$
DECLARE
    is_lab BOOLEAN;
    has_active_edit BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT (role = 'lab') INTO is_lab FROM public.profiles WHERE id = auth.uid();
    
    IF is_lab THEN
        SELECT EXISTS (
            SELECT 1 FROM public.edit_requests 
            WHERE request_id = NEW.id AND status = 'Pending'
        ) INTO has_active_edit;
        
        IF NOT has_active_edit THEN
            -- Lab can only change lab-specific fields (status, lab_comments, approvals)
            IF (NEW.request_no IS DISTINCT FROM OLD.request_no) OR 
               (NEW.request_year IS DISTINCT FROM OLD.request_year) OR
               (NEW.request_date IS DISTINCT FROM OLD.request_date) OR
               (NEW.request_time IS DISTINCT FROM OLD.request_time) OR
               (NEW.customer_name IS DISTINCT FROM OLD.customer_name) OR
               (NEW.po_number IS DISTINCT FROM OLD.po_number) OR
               (NEW.car_plate IS DISTINCT FROM OLD.car_plate) OR
               (NEW.seal_no IS DISTINCT FROM OLD.seal_no) OR
               (NEW.container_no IS DISTINCT FROM OLD.container_no) OR
               (NEW.notes IS DISTINCT FROM OLD.notes) OR
               (NEW.requester_id IS DISTINCT FROM OLD.requester_id) THEN
                RAISE EXCEPTION 'Lab role cannot edit request main data without an active Edit Request.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_lab_request_update ON public.requests;
CREATE TRIGGER trg_check_lab_request_update
BEFORE UPDATE ON public.requests
FOR EACH ROW
EXECUTE FUNCTION public.check_lab_request_update();


-- 5.4 Secure User Creation Trigger (Prevents Privilege Escalation)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, role)
  VALUES (
    NEW.id,
    SPLIT_PART(NEW.email, '@', 1),
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    'requester' -- Always default to requester; elevated roles must be granted by Admin
  )
  ON CONFLICT (id) DO UPDATE 
  SET display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();


-- 5.5 Admin Security Procedures
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id UUID, p_role TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only administrators can modify roles.';
  END IF;

  IF p_role NOT IN ('requester', 'admin', 'lab', 'base_oil') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  UPDATE public.profiles
  SET role = p_role
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_update_user_password(p_user_id UUID, p_new_password TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can update user passwords.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators can delete users.';
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;


-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_material_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 6.1 PROFILES POLICIES
DROP POLICY IF EXISTS "Allow authenticated users to read profiles" ON public.profiles;
CREATE POLICY "Allow authenticated users to read profiles"
ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admins to do everything on profiles" ON public.profiles;
CREATE POLICY "Allow admins to do everything on profiles"
ON public.profiles FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- 6.2 USER SIGNATURES POLICIES
DROP POLICY IF EXISTS "Authenticated users can read signatures" ON public.user_signatures;
CREATE POLICY "Authenticated users can read signatures"
ON public.user_signatures FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage signatures" ON public.user_signatures;
CREATE POLICY "Admins can manage signatures"
ON public.user_signatures FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- 6.3 REQUESTS POLICIES
DROP POLICY IF EXISTS "Admins can do everything on requests" ON public.requests;
CREATE POLICY "Admins can do everything on requests"
ON public.requests FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "Select policy: role and draft isolation" ON public.requests;
CREATE POLICY "Select policy: role and draft isolation"
ON public.requests FOR SELECT TO authenticated
USING (
  CASE
    -- Admin can see everything
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN true
    -- Requester sees non-drafts OR own drafts
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'requester') THEN (status <> 'Draft' OR requester_id = auth.uid())
    -- Lab sees all non-drafts
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'lab') THEN status <> 'Draft'
    -- Base Oil sees only non-drafts with need_base_oil_view = true
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'base_oil') THEN (status <> 'Draft' AND need_base_oil_view = true)
    ELSE false
  END
);

DROP POLICY IF EXISTS "Requesters can create their own requests" ON public.requests;
CREATE POLICY "Requesters can create their own requests"
ON public.requests FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('requester', 'admin', 'lab'))
);

DROP POLICY IF EXISTS "Requesters can update their own drafts" ON public.requests;
CREATE POLICY "Requesters can update their own drafts"
ON public.requests FOR UPDATE TO authenticated
USING (
  requester_id = auth.uid() AND status = 'Draft'
)
WITH CHECK (
  requester_id = auth.uid() AND (status = 'Draft' OR status = 'Pending')
);

DROP POLICY IF EXISTS "Lab can update requests" ON public.requests;
CREATE POLICY "Lab can update requests"
ON public.requests FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('lab', 'admin'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('lab', 'admin'))
);

-- 6.4 REQUEST ITEMS POLICIES
DROP POLICY IF EXISTS "Admins can do everything on request_items" ON public.request_items;
CREATE POLICY "Admins can do everything on request_items"
ON public.request_items FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "items_select_strict" ON public.request_items;
CREATE POLICY "items_select_strict"
ON public.request_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_items.request_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'requester') AND (r.status <> 'Draft' OR r.requester_id = auth.uid()))
      OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'lab') AND r.status <> 'Draft')
      OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'base_oil') AND r.status <> 'Draft' AND r.need_base_oil_view = true)
    )
  )
);

DROP POLICY IF EXISTS "Requesters can insert items for their own requests" ON public.request_items;
CREATE POLICY "Requesters can insert items for their own requests"
ON public.request_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.requests WHERE requests.id = request_items.request_id AND requests.requester_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'requester')
);

DROP POLICY IF EXISTS "Requesters can update items for their own drafts" ON public.request_items;
CREATE POLICY "Requesters can update items for their own drafts"
ON public.request_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_items.request_id AND r.requester_id = auth.uid() AND r.status = 'Draft'
  )
);

DROP POLICY IF EXISTS "Requesters can delete items for their own drafts" ON public.request_items;
CREATE POLICY "Requesters can delete items for their own drafts"
ON public.request_items FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.requests r
    WHERE r.id = request_items.request_id AND r.requester_id = auth.uid() AND r.status = 'Draft'
  )
);

DROP POLICY IF EXISTS "Lab can insert request_items" ON public.request_items;
CREATE POLICY "Lab can insert request_items"
ON public.request_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('lab', 'admin'))
);

DROP POLICY IF EXISTS "Lab can update request_items" ON public.request_items;
CREATE POLICY "Lab can update request_items"
ON public.request_items FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('lab', 'admin'))
);

DROP POLICY IF EXISTS "Lab can delete request_items" ON public.request_items;
CREATE POLICY "Lab can delete request_items"
ON public.request_items FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('lab', 'admin'))
);

-- 6.5 EDIT REQUESTS POLICIES
DROP POLICY IF EXISTS "Admins can do everything on edit_requests" ON public.edit_requests;
CREATE POLICY "Admins can do everything on edit_requests"
ON public.edit_requests FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "Lab can view all edit_requests" ON public.edit_requests;
CREATE POLICY "Lab can view all edit_requests"
ON public.edit_requests FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'lab')
);

DROP POLICY IF EXISTS "Requesters can view their own edit_requests" ON public.edit_requests;
CREATE POLICY "Requesters can view their own edit_requests"
ON public.edit_requests FOR SELECT TO authenticated
USING (requester_id = auth.uid());

DROP POLICY IF EXISTS "Requesters can create their own edit_requests" ON public.edit_requests;
CREATE POLICY "Requesters can create their own edit_requests"
ON public.edit_requests FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "Lab can update edit_requests" ON public.edit_requests;
CREATE POLICY "Lab can update edit_requests"
ON public.edit_requests FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('lab', 'admin'))
);

-- 6.6 HISTORICAL MATERIAL RECORDS POLICIES
DROP POLICY IF EXISTS "historical_records_select" ON public.historical_material_records;
CREATE POLICY "historical_records_select"
ON public.historical_material_records FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "historical_records_admin_manage" ON public.historical_material_records;
CREATE POLICY "historical_records_admin_manage"
ON public.historical_material_records FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- 6.7 SYSTEM SETTINGS POLICIES
DROP POLICY IF EXISTS "Authenticated users can read system settings" ON public.system_settings;
CREATE POLICY "Authenticated users can read system settings"
ON public.system_settings FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
CREATE POLICY "Admins can manage system settings"
ON public.system_settings FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- 6.8 PUSH SUBSCRIPTIONS POLICIES
DROP POLICY IF EXISTS "push_subscriptions_user_manage" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_user_manage"
ON public.push_subscriptions FOR ALL TO authenticated
USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ==============================================================================
-- 7. REALTIME NOTIFICATIONS PUBLICATION
-- ==============================================================================
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;
  ALTER TABLE public.requests REPLICA IDENTITY FULL;
COMMIT;

-- ==============================================================================
-- 8. STORAGE BUCKET CONFIGURATION (Signatures)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can upload signatures" ON storage.objects;
CREATE POLICY "Admins can upload signatures"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'signatures' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Admins can update signatures" ON storage.objects;
CREATE POLICY "Admins can update signatures"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'signatures' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Authenticated users can read signatures" ON storage.objects;
CREATE POLICY "Authenticated users can read signatures"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'signatures');

-- ==============================================================================
-- 9. INITIAL SEED DATA
-- ==============================================================================
INSERT INTO public.system_settings (key, value)
VALUES (
  'line_notify_config',
  '{"enabled": false, "token": "", "group_id": "", "relay_url": ""}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
