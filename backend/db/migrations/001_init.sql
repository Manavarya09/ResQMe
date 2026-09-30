-- ResQMe initial schema
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  phone         text,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'responder')),
  country       text NOT NULL DEFAULT 'IN',
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Medical ID, AES-256-GCM encrypted at rest (base64 fields)
CREATE TABLE IF NOT EXISTS medical_ids (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  iv         text NOT NULL,
  tag        text NOT NULL,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  phone      text NOT NULL,
  relation   text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_user_idx ON contacts(user_id);

CREATE TABLE IF NOT EXISTS drones (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'en_route', 'on_scene', 'returning')),
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  base_lat     double precision NOT NULL,
  base_lng     double precision NOT NULL,
  battery_pct  double precision NOT NULL DEFAULT 100,
  incident_id  uuid,
  eta_seconds  integer,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger               text NOT NULL CHECK (trigger IN ('sos', 'impact', 'route_deviation', 'timer_expired', 'manual')),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'dispatched', 'resolved', 'cancelled')),
  severity              text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  lat                   double precision NOT NULL,
  lng                   double precision NOT NULL,
  accuracy              double precision,
  note                  text,
  triage                jsonb NOT NULL,
  impact_score          jsonb,
  medical_snapshot      jsonb,
  contacts_snapshot     jsonb NOT NULL DEFAULT '[]'::jsonb,
  drone_id              text REFERENCES drones(id) ON DELETE SET NULL,
  responder_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  responder_eta_minutes integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidents_user_idx ON incidents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status, created_at DESC);

CREATE TABLE IF NOT EXISTS incident_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type        text NOT NULL,
  message     text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS incident_events_incident_idx ON incident_events(incident_id, created_at);

CREATE TABLE IF NOT EXISTS hazards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('crime', 'weather', 'flood', 'heat', 'fog', 'storm', 'accident', 'other')),
  severity    text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  radius_m    integer NOT NULL DEFAULT 300,
  source      text NOT NULL CHECK (source IN ('open-meteo', 'seed', 'user')),
  seed_key    text UNIQUE,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);
CREATE INDEX IF NOT EXISTS hazards_latlng_idx ON hazards(lat, lng);

CREATE TABLE IF NOT EXISTS share_tokens (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
