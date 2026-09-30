-- Live location sharing links (/t/<token>). Only a SHA-256 hash of the token is stored.
CREATE TABLE IF NOT EXISTS location_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  incident_id   uuid REFERENCES incidents(id) ON DELETE SET NULL,
  last_lat      double precision,
  last_lng      double precision,
  last_accuracy double precision,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS location_shares_user_idx ON location_shares(user_id, created_at DESC);
