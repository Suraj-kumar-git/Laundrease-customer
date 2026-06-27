-- ============================================================
-- 30-provider-doc-verification.sql
-- Adds proper document verification tracking for laundry providers
-- ============================================================

-- ── 1. Add registration_stage to laundry_profiles ────────────────────────────
ALTER TABLE laundry_profiles
  ADD COLUMN IF NOT EXISTS registration_stage VARCHAR(30) NOT NULL DEFAULT 'documents_pending'
    CHECK (registration_stage IN (
      'documents_pending',
      'documents_under_review',
      'verification_call',
      'call_completed',
      'activated',
      'rejected'
    ));

-- Back-fill existing active providers
UPDATE laundry_profiles SET registration_stage = 'activated'
  WHERE status = 'active';
UPDATE laundry_profiles SET registration_stage = 'activated'
  WHERE status IN ('inactive','suspended') AND registration_stage = 'documents_pending';

-- ── 2. provider_documents ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_documents (
  id                  SERIAL PRIMARY KEY,
  laundry_profile_id  BIGINT       NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  doc_key             VARCHAR(50)  NOT NULL,
  label               VARCHAR(100) NOT NULL,
  is_required         BOOLEAN      NOT NULL DEFAULT TRUE,
  s3_key              VARCHAR(500) NOT NULL,
  original_filename   VARCHAR(255),
  file_size_bytes     INTEGER      CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  content_type        VARCHAR(100),
  version             INTEGER      NOT NULL DEFAULT 1,
  review_status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','approved','rejected')),
  reviewed_by         BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  admin_comment       TEXT,
  uploaded_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (laundry_profile_id, doc_key, version)
);

ALTER TABLE provider_documents ALTER COLUMN reviewed_by SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_provider_documents_profile
  ON provider_documents (laundry_profile_id);
CREATE INDEX IF NOT EXISTS idx_provider_documents_status
  ON provider_documents (laundry_profile_id, review_status);

-- ── 3. provider_registration_events ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_registration_events (
  id                  SERIAL PRIMARY KEY,
  laundry_profile_id  BIGINT      NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  event_type          VARCHAR(50) NOT NULL,
  from_stage          VARCHAR(30),
  to_stage            VARCHAR(30),
  performed_by        BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  doc_key             VARCHAR(50),
  comment             TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE provider_registration_events ALTER COLUMN performed_by SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_reg_events_profile
  ON provider_registration_events (laundry_profile_id, created_at DESC);

-- ── 4. Migrate existing JSONB documents into provider_documents ──────────────
DO $$
DECLARE
  rec     RECORD;
  doc_map JSONB;
  d_key   TEXT;
  d_val   TEXT;
BEGIN
  FOR rec IN
    SELECT id, documents FROM laundry_profiles
    WHERE documents IS NOT NULL AND documents != '{}'::jsonb
  LOOP
    doc_map := rec.documents;
    FOR d_key IN SELECT jsonb_object_keys(doc_map) LOOP
      d_val := doc_map ->> d_key;
      IF d_val IS NOT NULL AND d_val <> '' THEN
        INSERT INTO provider_documents (
          laundry_profile_id, doc_key, label, is_required,
          s3_key, version, review_status, uploaded_at
        ) VALUES (
          rec.id, d_key,
          CASE d_key
            WHEN 'shop_photo'       THEN 'Shop / Facility Photo'
            WHEN 'equipment_photo'  THEN 'Equipment Photo'
            WHEN 'gst_certificate'  THEN 'GST Certificate'
            WHEN 'business_license' THEN 'Business License / Registration'
            ELSE INITCAP(REPLACE(d_key, '_', ' '))
          END,
          d_key IN ('shop_photo', 'equipment_photo'),
          d_val, 1, 'pending', NOW()
        )
        ON CONFLICT (laundry_profile_id, doc_key, version) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ── 5. Trigger: auto-advance stage when all required docs approved ────────────
CREATE OR REPLACE FUNCTION check_and_advance_registration_stage()
RETURNS TRIGGER AS $$
DECLARE
  v_total_req     INTEGER;
  v_approved_req  INTEGER;
  v_current_stage VARCHAR(30);
BEGIN
  IF NEW.review_status = 'approved' AND NEW.is_required = TRUE THEN
    SELECT registration_stage INTO v_current_stage
    FROM laundry_profiles WHERE id = NEW.laundry_profile_id;

    IF v_current_stage IN ('documents_pending', 'documents_under_review') THEN
      SELECT
        COUNT(*) FILTER (WHERE is_required = TRUE),
        COUNT(*) FILTER (WHERE is_required = TRUE AND review_status = 'approved')
      INTO v_total_req, v_approved_req
      FROM (
        SELECT DISTINCT ON (doc_key) is_required, review_status
        FROM provider_documents
        WHERE laundry_profile_id = NEW.laundry_profile_id
        ORDER BY doc_key, version DESC
      ) latest;

      IF v_total_req > 0 AND v_approved_req >= v_total_req THEN
        UPDATE laundry_profiles
        SET registration_stage = 'verification_call'
        WHERE id = NEW.laundry_profile_id;

        INSERT INTO provider_registration_events (
          laundry_profile_id, event_type, from_stage, to_stage,
          performed_by, comment, created_at
        ) VALUES (
          NEW.laundry_profile_id, 'stage_changed',
          v_current_stage, 'verification_call',
          NEW.reviewed_by,
          'All required documents approved — auto-advanced to verification call',
          NOW()
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_registration_stage ON provider_documents;
CREATE TRIGGER trg_check_registration_stage
AFTER UPDATE OF review_status ON provider_documents
FOR EACH ROW EXECUTE FUNCTION check_and_advance_registration_stage();

-- ── 6. Trigger: auto-activate provider when registration_stage = call_completed
CREATE OR REPLACE FUNCTION activate_provider_on_call_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.registration_stage = 'call_completed'
     AND OLD.registration_stage IS DISTINCT FROM 'call_completed' THEN

    UPDATE laundry_profiles
    SET status             = 'active',
        is_verified        = TRUE,
        verified_at        = NOW(),
        registration_stage = 'activated'
    WHERE id = NEW.id;

    UPDATE users
    SET status            = 'active',
        email_verified    = TRUE,
        email_verified_at = NOW()
    WHERE id = NEW.user_id;

    INSERT INTO provider_registration_events (
      laundry_profile_id, event_type, from_stage, to_stage, comment, created_at
    ) VALUES (
      NEW.id, 'activated', 'call_completed', 'activated',
      'Account auto-activated after verification call completed', NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activate_on_call_complete ON laundry_profiles;
CREATE TRIGGER trg_activate_on_call_complete
AFTER UPDATE OF registration_stage ON laundry_profiles
FOR EACH ROW EXECUTE FUNCTION activate_provider_on_call_complete();
