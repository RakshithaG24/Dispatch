CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id   text UNIQUE NOT NULL,
  email       text NOT NULL,
  name        text NOT NULL,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Ethereal (fake SMTP) accounts that emails are sent from.
CREATE TABLE IF NOT EXISTS senders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  smtp_host     text NOT NULL,
  smtp_port     integer NOT NULL,
  smtp_user     text NOT NULL,
  smtp_pass     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per Schedule click. idempotency_key makes a retried request a no-op.
CREATE TABLE IF NOT EXISTS batches (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key  text,
  subject          text NOT NULL,
  body             text NOT NULL,
  start_at         timestamptz NOT NULL,
  delay_seconds    integer NOT NULL,
  hourly_limit     integer NOT NULL,
  total            integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

-- One row per recipient. This table is the source of truth; Redis only holds timing.
CREATE TABLE IF NOT EXISTS emails (
  id            uuid PRIMARY KEY,
  seq           bigserial NOT NULL,
  batch_id      uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id     uuid NOT NULL REFERENCES senders(id),
  recipient     text NOT NULL,
  subject       text NOT NULL,
  body          text NOT NULL,
  status        text NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'processing', 'sent', 'failed')),
  scheduled_at  timestamptz NOT NULL,
  processed_at  timestamptz,
  attempts      integer NOT NULL DEFAULT 0,
  error         text,
  message_id    text,
  preview_url   text,
  defer_reason  text,
  claimed_at    timestamptz,
  hourly_limit  integer NOT NULL,
  min_delay_ms  integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, recipient)
);

CREATE INDEX IF NOT EXISTS emails_user_status_scheduled_idx ON emails (user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS emails_user_status_processed_idx ON emails (user_id, status, processed_at DESC);
CREATE INDEX IF NOT EXISTS emails_status_seq_idx ON emails (status, seq);

CREATE TABLE IF NOT EXISTS slack_connections (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_name    text,
  channel      text,
  webhook_url  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
