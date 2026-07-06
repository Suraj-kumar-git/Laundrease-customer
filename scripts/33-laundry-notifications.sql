-- ============================================================
-- Migration 34: Laundry provider in-app notifications
-- ============================================================
-- Creates the notifications table and DB triggers so that
-- notifications are written atomically with the event that
-- caused them (order assignment, quick-pickup request).
-- ============================================================

-- ── Table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS laundry_notifications (
  id            BIGSERIAL PRIMARY KEY,
  provider_id   INTEGER      NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  type          TEXT         NOT NULL,           -- 'new_order' | 'quick_pickup'
  title         TEXT         NOT NULL,
  body          TEXT         NOT NULL,
  order_id      BIGINT       REFERENCES orders(id) ON DELETE SET NULL,
  quick_pickup_request_id BIGINT REFERENCES quick_pickup_requests(id) ON DELETE SET NULL,
  is_read       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_laundry_notifications_provider_unread
  ON laundry_notifications (provider_id, is_read, created_at DESC);

-- ── Trigger: new order assigned to provider ────────────────

CREATE OR REPLACE FUNCTION notify_laundry_new_order()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Fire only when laundry_profile_id is first set (INSERT or UPDATE from NULL)
  IF (TG_OP = 'INSERT' AND NEW.laundry_profile_id IS NOT NULL)
     OR
     (TG_OP = 'UPDATE' AND NEW.laundry_profile_id IS NOT NULL
      AND (OLD.laundry_profile_id IS NULL OR OLD.laundry_profile_id <> NEW.laundry_profile_id))
  THEN
    INSERT INTO laundry_notifications (provider_id, type, title, body, order_id)
    VALUES (
      NEW.laundry_profile_id,
      'new_order',
      'New order received',
      'Order #' || NEW.id || ' has been assigned to you.',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_laundry_new_order ON orders;
CREATE TRIGGER trg_laundry_new_order
  AFTER INSERT OR UPDATE OF laundry_profile_id ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_laundry_new_order();

-- ── Trigger: quick-pickup request assigned to provider ─────

CREATE OR REPLACE FUNCTION notify_laundry_quick_pickup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.laundry_profile_id IS NOT NULL)
     OR
     (TG_OP = 'UPDATE' AND NEW.laundry_profile_id IS NOT NULL
      AND (OLD.laundry_profile_id IS NULL OR OLD.laundry_profile_id <> NEW.laundry_profile_id))
  THEN
    INSERT INTO laundry_notifications (provider_id, type, title, body, quick_pickup_request_id)
    VALUES (
      NEW.laundry_profile_id,
      'quick_pickup',
      'Quick pickup request',
      'A customer has requested a quick pickup. Review and contact them.',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_laundry_quick_pickup ON quick_pickup_requests;
CREATE TRIGGER trg_laundry_quick_pickup
  AFTER INSERT OR UPDATE OF laundry_profile_id ON quick_pickup_requests
  FOR EACH ROW EXECUTE FUNCTION notify_laundry_quick_pickup();
