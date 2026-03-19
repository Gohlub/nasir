CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id text NOT NULL UNIQUE,
  external_lot_id text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  lot_payee text NOT NULL,
  status text NOT NULL,
  current_high_bid_amount text NULL,
  current_high_channel_id text NULL,
  min_next_bid text NOT NULL,
  bid_increment text NOT NULL,
  winner_channel_id text NULL,
  winning_bid_amount text NULL,
  create_tx_hash text NULL,
  close_tx_hash text NULL,
  execute_tx_hash text NULL,
  ends_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL UNIQUE,
  lot_id text NOT NULL,
  payer text NOT NULL,
  authorized_signer text NULL,
  deposit text NOT NULL,
  settled text NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  close_requested_at bigint NULL,
  latest_voucher_amount text NULL,
  latest_voucher_sig text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id text NOT NULL,
  channel_id text NOT NULL,
  payer text NOT NULL,
  bid_amount text NOT NULL,
  signature text NOT NULL,
  accepted boolean NOT NULL DEFAULT true,
  reject_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_headers jsonb NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route, idempotency_key)
);

CREATE TABLE IF NOT EXISTS onchain_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tx_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  tx_hash text NULL,
  status text NOT NULL,
  error text NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NULL
);
