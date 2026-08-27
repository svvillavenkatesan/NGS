CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE application_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'DISTRIBUTOR', 'SELLER');
CREATE TYPE ticket_status AS ENUM ('ACTIVE', 'SETTLED', 'VOID');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES users(id),
  role user_role NOT NULL,
  name text NOT NULL,
  phone text UNIQUE,
  commission_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_percentage BETWEEN 0 AND 50),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'SUPER_ADMIN' AND parent_id IS NULL) OR role <> 'SUPER_ADMIN')
);
CREATE INDEX users_parent_idx ON users(parent_id);

CREATE TABLE rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  child_id uuid NOT NULL REFERENCES users(id),
  scheme text NOT NULL,
  rate numeric(12,2) NOT NULL CHECK (rate >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  UNIQUE(owner_id, child_id, scheme, valid_from)
);

CREATE TABLE bonus_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  beneficiary_id uuid NOT NULL REFERENCES users(id),
  enabled boolean NOT NULL DEFAULT false,
  target_sales numeric(14,2) NOT NULL CHECK (target_sales >= 0),
  percentage numeric(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 50)
);

CREATE TABLE lot_codes (
  id text PRIMARY KEY,
  code varchar(8) NOT NULL UNIQUE,
  name text NOT NULL,
  schedules jsonb NOT NULL DEFAULT '[]',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scheme_catalog (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  pattern varchar(8) NOT NULL,
  minimum_rate numeric(12,2) NOT NULL CHECK (minimum_rate >= 0),
  mrp numeric(12,2) NOT NULL CHECK (mrp >= minimum_rate),
  four_digit_prize numeric(14,2) NOT NULL DEFAULT 0,
  three_digit_prize numeric(14,2) NOT NULL DEFAULT 0,
  two_digit_prize numeric(14,2) NOT NULL DEFAULT 0,
  single_digit_prize numeric(14,2) NOT NULL DEFAULT 0,
  is_universal boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account_lot_scheme_rates (
  account_id uuid NOT NULL REFERENCES users(id),
  lot_code_id text NOT NULL REFERENCES lot_codes(id),
  scheme_id text NOT NULL REFERENCES scheme_catalog(id),
  rate numeric(12,2) NOT NULL CHECK (rate >= 0),
  is_enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (account_id, lot_code_id, scheme_id)
);

CREATE TABLE draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_code_id text NOT NULL REFERENCES lot_codes(id),
  show_id text NOT NULL,
  result_date date NOT NULL,
  winning_number char(4) NOT NULL CHECK (winning_number ~ '^[0-9]{4}$'),
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  locked boolean NOT NULL DEFAULT true,
  override_reason text,
  UNIQUE(lot_code_id, show_id, result_date)
);

CREATE TABLE sale_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL UNIQUE,
  seller_id uuid NOT NULL REFERENCES users(id),
  distributor_id uuid REFERENCES users(id),
  lot_code_id text NOT NULL REFERENCES lot_codes(id),
  show_id text NOT NULL,
  business_date date NOT NULL,
  draw_id uuid REFERENCES draws(id),
  winning_number char(4) CHECK (winning_number IS NULL OR winning_number ~ '^[0-9]{4}$'),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FINALIZED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  updated_at timestamptz,
  updated_by uuid REFERENCES users(id),
  UNIQUE(seller_id, lot_code_id, show_id, business_date)
);
CREATE INDEX sale_reports_seller_idx ON sale_reports(seller_id, business_date DESC);
CREATE INDEX sale_reports_distributor_idx ON sale_reports(distributor_id, business_date DESC);

CREATE TABLE bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text NOT NULL UNIQUE,
  sequence integer NOT NULL CHECK (sequence > 0),
  seller_id uuid NOT NULL REFERENCES users(id),
  report_id uuid NOT NULL REFERENCES sale_reports(id),
  lot_code_id text NOT NULL REFERENCES lot_codes(id),
  show_id text NOT NULL,
  business_date date NOT NULL,
  total_quantity integer NOT NULL CHECK (total_quantity > 0),
  total numeric(14,2) NOT NULL CHECK (total >= 0),
  status text NOT NULL DEFAULT 'SAVED' CHECK (status = 'SAVED'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_date, sequence)
);
CREATE INDEX bills_seller_recent_idx ON bills(seller_id, created_at DESC);

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id),
  report_id uuid NOT NULL REFERENCES sale_reports(id),
  bill_id uuid NOT NULL REFERENCES bills(id),
  transaction_sequence integer NOT NULL CHECK (transaction_sequence > 0),
  draw_id uuid REFERENCES draws(id),
  lot_code_id text NOT NULL REFERENCES lot_codes(id),
  show_id text NOT NULL,
  business_date date NOT NULL,
  catalog_scheme_id text NOT NULL REFERENCES scheme_catalog(id),
  catalog_pattern varchar(8) NOT NULL,
  scheme text NOT NULL,
  number varchar(4) NOT NULL CHECK (number ~ '^[0-9]{1,4}$'),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  status ticket_status NOT NULL DEFAULT 'ACTIVE',
  prize numeric(14,2) NOT NULL DEFAULT 0 CHECK (prize >= 0),
  rate_snapshot jsonb NOT NULL,
  prize_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tickets_report_sequence_idx ON tickets(report_id, transaction_sequence);
CREATE INDEX tickets_seller_idx ON tickets(seller_id, created_at DESC);
CREATE INDEX tickets_draw_idx ON tickets(draw_id);
CREATE INDEX tickets_result_scope_idx ON tickets(lot_code_id, show_id, business_date);

CREATE TABLE weekly_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES users(id),
  owner_id uuid REFERENCES users(id),
  week_start date NOT NULL,
  week_end date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference text,
  received_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE daily_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  note text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES sale_reports(id),
  transaction_id uuid NOT NULL REFERENCES tickets(id),
  changed_field text NOT NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5)
);

CREATE OR REPLACE FUNCTION reject_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are immutable';
END $$;

CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION reject_audit_changes();

CREATE TRIGGER report_corrections_immutable BEFORE UPDATE OR DELETE ON report_corrections
FOR EACH ROW EXECUTE FUNCTION reject_audit_changes();

CREATE OR REPLACE FUNCTION reject_transaction_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Sale reports and transactions cannot be deleted';
END $$;

CREATE TRIGGER sale_reports_no_delete BEFORE DELETE ON sale_reports
FOR EACH ROW EXECUTE FUNCTION reject_transaction_delete();
CREATE TRIGGER tickets_no_delete BEFORE DELETE ON tickets
FOR EACH ROW EXECUTE FUNCTION reject_transaction_delete();
CREATE TRIGGER bills_no_delete BEFORE DELETE ON bills
FOR EACH ROW EXECUTE FUNCTION reject_transaction_delete();
