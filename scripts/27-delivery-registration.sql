-- ============================================================
-- 31-delivery-registration.sql
-- Adds all missing columns and tables for the full delivery
-- partner registration + document verification flow.
-- ============================================================

-- ── 1. Add missing columns to delivery_profiles ──────────────────────────────

ALTER TABLE delivery_profiles
  -- Age verification (calculated server-side, never sent to client)
  ADD COLUMN IF NOT EXISTS date_of_birth          DATE,

  -- Primary service area
  ADD COLUMN IF NOT EXISTS city                   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode                VARCHAR(20),

  -- Registration funnel tracking (mirrors laundry registration_stage)
  ADD COLUMN IF NOT EXISTS registration_stage     VARCHAR(30)  NOT NULL DEFAULT 'incomplete'
    CHECK (registration_stage IN (
      'incomplete',             -- token sent, profile not yet filled
      'documents_pending',      -- profile + docs submitted, awaiting review
      'documents_under_review', -- admin opened doc review page
      'training_pending',       -- all required docs approved, must complete training
      'training_completed',     -- training done, awaiting final activation
      'activated',              -- fully live
      'rejected'                -- rejected at any stage
    )),

  -- Onboarding source
  ADD COLUMN IF NOT EXISTS onboarding_type        VARCHAR(20)  NOT NULL DEFAULT 'platform'
    CHECK (onboarding_type IN ('platform', 'third_party')),
  ADD COLUMN IF NOT EXISTS third_party_provider_id INTEGER,    -- FK added below after table creation

  -- Training
  ADD COLUMN IF NOT EXISTS training_completed     BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS training_completed_at  TIMESTAMPTZ,

  -- Admin approval tracking
  ADD COLUMN IF NOT EXISTS approved_by            BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason       TEXT;

ALTER TABLE delivery_profiles ALTER COLUMN approved_by SET DEFAULT NULL;

-- Back-fill existing active delivery profiles
UPDATE delivery_profiles SET registration_stage = 'activated'
  WHERE status = 'active' AND is_verified = TRUE;
UPDATE delivery_profiles SET registration_stage = 'activated'
  WHERE status IN ('inactive','suspended') AND registration_stage = 'incomplete';

-- ── 2. Third-party delivery provider companies ───────────────────────────────

CREATE TABLE IF NOT EXISTS third_party_delivery_providers (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  contact_name   VARCHAR(100),
  contact_email  VARCHAR(255),
  contact_phone  VARCHAR(20),
  -- Webhook endpoint they POST partner data to
  webhook_url    TEXT,
  -- API key for authenticating their webhook calls (stored as-is; encrypt in prod)
  api_key_hash   VARCHAR(255),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Now add the FK from delivery_profiles
ALTER TABLE delivery_profiles
  ADD CONSTRAINT fk_delivery_third_party
  FOREIGN KEY (third_party_provider_id)
  REFERENCES third_party_delivery_providers(id)
  ON DELETE SET NULL;

-- ── 3. delivery_documents ────────────────────────────────────────────────────
-- One row per document per delivery partner.
-- Required docs: license_front, license_back, vehicle_rc, vehicle_insurance, aadhar_card
-- Optional docs: pan_card, bank_document, passport_photo, police_verification

CREATE TABLE IF NOT EXISTS delivery_documents (
  id                  SERIAL PRIMARY KEY,
  delivery_profile_id BIGINT       NOT NULL REFERENCES delivery_profiles(id) ON DELETE CASCADE,
  doc_key             VARCHAR(50)  NOT NULL,
  label               VARCHAR(100) NOT NULL,
  is_required         BOOLEAN      NOT NULL DEFAULT TRUE,
  s3_key              VARCHAR(500) NOT NULL,
  original_filename   VARCHAR(255),
  file_size_bytes     INTEGER      CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  content_type        VARCHAR(100),
  version             INTEGER      NOT NULL DEFAULT 1,
  review_status       VARCHAR(20)  NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by         BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  admin_comment       TEXT,
  uploaded_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_profile_id, doc_key, version)
);

ALTER TABLE delivery_documents ALTER COLUMN reviewed_by SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_documents_profile
  ON delivery_documents (delivery_profile_id);
CREATE INDEX IF NOT EXISTS idx_delivery_documents_status
  ON delivery_documents (delivery_profile_id, review_status);

-- ── 4. delivery_registration_events ─────────────────────────────────────────
-- Full audit log for every stage change and doc action

CREATE TABLE IF NOT EXISTS delivery_registration_events (
  id                  SERIAL PRIMARY KEY,
  delivery_profile_id BIGINT      NOT NULL REFERENCES delivery_profiles(id) ON DELETE CASCADE,
  event_type          VARCHAR(50) NOT NULL,
  -- 'profile_submitted' | 'doc_uploaded' | 'doc_approved' | 'doc_rejected'
  -- | 'doc_reuploaded' | 'stage_changed' | 'training_completed'
  -- | 'activated' | 'rejected' | 'token_extended'
  from_stage          VARCHAR(30),
  to_stage            VARCHAR(30),
  performed_by        BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  doc_key             VARCHAR(50),
  comment             TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE delivery_registration_events ALTER COLUMN performed_by SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_reg_events_profile
  ON delivery_registration_events (delivery_profile_id, created_at DESC);

-- ── 5. Trigger: auto-advance stage when all required docs approved ────────────

CREATE OR REPLACE FUNCTION check_and_advance_delivery_stage()
RETURNS TRIGGER AS $$
DECLARE
  v_total_req    INTEGER;
  v_approved_req INTEGER;
  v_cur_stage    VARCHAR(30);
BEGIN
  IF NEW.review_status = 'approved' AND NEW.is_required = TRUE THEN

    SELECT registration_stage INTO v_cur_stage
    FROM delivery_profiles WHERE id = NEW.delivery_profile_id;

    IF v_cur_stage IN ('documents_pending', 'documents_under_review') THEN

      SELECT
        COUNT(*) FILTER (WHERE is_required = TRUE),
        COUNT(*) FILTER (WHERE is_required = TRUE AND review_status = 'approved')
      INTO v_total_req, v_approved_req
      FROM (
        SELECT DISTINCT ON (doc_key) is_required, review_status
        FROM delivery_documents
        WHERE delivery_profile_id = NEW.delivery_profile_id
        ORDER BY doc_key, version DESC
      ) latest;

      IF v_total_req > 0 AND v_approved_req >= v_total_req THEN
        UPDATE delivery_profiles
        SET registration_stage = 'training_pending'
        WHERE id = NEW.delivery_profile_id;

        INSERT INTO delivery_registration_events (
          delivery_profile_id, event_type, from_stage, to_stage,
          performed_by, comment, created_at
        ) VALUES (
          NEW.delivery_profile_id, 'stage_changed',
          v_cur_stage, 'training_pending',
          NEW.reviewed_by,
          'All required documents approved — auto-advanced to training',
          NOW()
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_delivery_stage ON delivery_documents;
CREATE TRIGGER trg_check_delivery_stage
AFTER UPDATE OF review_status ON delivery_documents
FOR EACH ROW EXECUTE FUNCTION check_and_advance_delivery_stage();

-- ── 6. Trigger: auto-activate when training_completed → activated ─────────────

CREATE OR REPLACE FUNCTION activate_delivery_on_training_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.registration_stage = 'training_completed'
     AND OLD.registration_stage IS DISTINCT FROM 'training_completed' THEN

    UPDATE delivery_profiles
    SET status             = 'active',
        is_verified        = TRUE,
        verified_at        = NOW(),
        registration_stage = 'activated'
    WHERE id = NEW.id;

    UPDATE users
    SET status = 'active'
    WHERE id = NEW.user_id;

    INSERT INTO delivery_registration_events (
      delivery_profile_id, event_type, from_stage, to_stage, comment, created_at
    ) VALUES (
      NEW.id, 'activated', 'training_completed', 'activated',
      'Account auto-activated after training completed', NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activate_delivery_on_training ON delivery_profiles;
CREATE TRIGGER trg_activate_delivery_on_training
AFTER UPDATE OF registration_stage ON delivery_profiles
FOR EACH ROW EXECUTE FUNCTION activate_delivery_on_training_complete();

-- ── 7. updated_at trigger for third_party_delivery_providers ─────────────────

DROP TRIGGER IF EXISTS trg_third_party_providers_updated_at ON third_party_delivery_providers;
CREATE TRIGGER trg_third_party_providers_updated_at
BEFORE UPDATE ON third_party_delivery_providers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS otp_sessions (
  id         SERIAL PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_code   VARCHAR(10) NOT NULL,      -- plain 6-digit OTP (short-lived, no need to hash)
  purpose    VARCHAR(30) NOT NULL
               CHECK (purpose IN ('phone_verification', 'login')),
  expires_at TIMESTAMPTZ NOT NULL,      -- 10 minutes from creation
  attempts   SMALLINT    NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One active OTP per user per purpose at a time
  UNIQUE (user_id, purpose)
);
 
CREATE INDEX IF NOT EXISTS idx_otp_sessions_user_id
  ON otp_sessions (user_id, purpose);
 
CREATE INDEX IF NOT EXISTS idx_otp_sessions_expires_at
  ON otp_sessions (expires_at);
 
-- Cleanup function — call via cron or Vercel Cron
CREATE OR REPLACE FUNCTION cleanup_expired_otp_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM otp_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
