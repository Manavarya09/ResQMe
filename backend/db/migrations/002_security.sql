-- ResQMe security hardening: TOTP MFA, session revocation, audit trail, pagination index

-- MFA secrets are AES-256-GCM encrypted with MEDICAL_KEY; stored as jsonb { iv, tag, ciphertext } (base64)
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret         jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_secret jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled        boolean NOT NULL DEFAULT false;
-- last accepted TOTP time-step (RFC 6238 §5.2 replay protection)
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step      bigint;
-- bumped on logout-all / password change; access JWTs carry it as `tv`
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version      integer NOT NULL DEFAULT 0;

-- One-time recovery codes, stored as keyed HMAC-SHA256 hashes (never plaintext)
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_idx ON mfa_recovery_codes(user_id);

-- Audit trail. user_id = whose data/account the entry is about; actor_id = who did it (null = anonymous/public)
CREATE TABLE IF NOT EXISTS audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log(user_id, created_at DESC);

-- Responder queue pagination (unfiltered, newest first)
CREATE INDEX IF NOT EXISTS incidents_created_idx ON incidents(created_at DESC);
