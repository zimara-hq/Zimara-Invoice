-- Zimara e-invoicing: initial schema
-- Legal basis notes:
--   * E-Invoicing Regulation & ZATCA detailed guideline §5.4/5.6: issued e-invoices, notes and
--     system logs must not be editable or deletable; counters must not reset.
--   * VAT Implementing Regulation: invoices retained at least 6 years.
--   * PDPL: personal data minimised, access logged, purpose-bound.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- identity ----------
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext NOT NULL UNIQUE,
  name            text NOT NULL,
  phone           text,
  password_hash   text NOT NULL,
  email_verified_at timestamptz,
  failed_logins   integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  terms_version   text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          text PRIMARY KEY,              -- SHA-256 of the cookie token; the token itself is never stored
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          text,
  user_agent  text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('verify_email','reset_password')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL
);

-- ---------- tenants ----------
CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar       text NOT NULL,
  name_en       text,
  vat           text CHECK (vat IS NULL OR vat ~ '^3[0-9]{13}3$'),
  crn           text CHECK (crn IS NULL OR crn ~ '^[0-9]{10}$'),
  street        text,
  building      text CHECK (building IS NULL OR building ~ '^[0-9]{4}$'),
  district      text,
  city          text,
  postal        text CHECK (postal IS NULL OR postal ~ '^[0-9]{5}$'),
  phone         text,
  email         text,
  industry      text NOT NULL DEFAULT 'Technology',
  plan          text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','starter','growth','pro','enterprise')),
  plan_status   text NOT NULL DEFAULT 'trialing' CHECK (plan_status IN ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz NOT NULL,
  current_period_end timestamptz,
  zatca_mode    text NOT NULL DEFAULT 'local' CHECK (zatca_mode IN ('local','developer-portal','simulation','production')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','admin','accountant','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  kind       text NOT NULL DEFAULT 'business' CHECK (kind IN ('business','individual')),
  name       text NOT NULL,
  vat        text CHECK (vat IS NULL OR vat ~ '^3[0-9]{13}3$'),
  crn        text,
  phone      text,
  email      text,
  street     text, building text, district text, city text, postal text,
  country    text NOT NULL DEFAULT 'SA',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_org_idx ON customers(org_id);

CREATE TABLE products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name       text NOT NULL,
  price      numeric(14,2) NOT NULL CHECK (price >= 0),
  vat_cat    text NOT NULL DEFAULT 'S' CHECK (vat_cat IN ('S','Z','E','O')),
  exemption  text,
  unit       text NOT NULL DEFAULT 'PCE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vat_cat = 'S' OR exemption IS NOT NULL)
);
CREATE INDEX products_org_idx ON products(org_id);

-- ---------- ZATCA e-invoice generation solution units ----------
CREATE TABLE egs_units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  env             text NOT NULL CHECK (env IN ('local','developer-portal','simulation','production')),
  serial          text NOT NULL,
  common_name     text NOT NULL,
  private_key_enc text NOT NULL,                -- AES-256-GCM, never shown in the UI
  certificate     text NOT NULL,                -- base64 DER of the production CSID certificate
  csid_token_enc  text,                         -- Fatoora binarySecurityToken (encrypted)
  csid_secret_enc text,                         -- Fatoora secret (encrypted)
  cert_expires_at timestamptz,
  icv             bigint NOT NULL DEFAULT 0,    -- invoice counter: only ever increases
  last_hash       text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  compliance_report jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX egs_one_active_per_org ON egs_units(org_id) WHERE active;

CREATE OR REPLACE FUNCTION zimara_guard_egs() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EGS units cannot be deleted (ZATCA: counter and chain must be preserved)';
  END IF;
  IF NEW.icv < OLD.icv THEN
    RAISE EXCEPTION 'Invoice counter cannot be reset or decreased';
  END IF;
  IF NEW.org_id <> OLD.org_id OR NEW.serial <> OLD.serial OR NEW.private_key_enc <> OLD.private_key_enc OR NEW.certificate <> OLD.certificate THEN
    RAISE EXCEPTION 'EGS identity is immutable; register a new unit instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER egs_guard BEFORE UPDATE OR DELETE ON egs_units FOR EACH ROW EXECUTE FUNCTION zimara_guard_egs();

-- ---------- documents (invoices, credit and debit notes) ----------
CREATE TABLE documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  egs_id        uuid NOT NULL REFERENCES egs_units(id) ON DELETE RESTRICT,
  number        text NOT NULL,
  uuid          uuid NOT NULL UNIQUE,
  kind          text NOT NULL CHECK (kind IN ('standard','simplified')),
  doc_type      text NOT NULL CHECK (doc_type IN ('invoice','credit','debit')),
  icv           bigint NOT NULL,
  pih           text NOT NULL,
  hash          text NOT NULL,
  signature     text NOT NULL,
  qr            text NOT NULL,
  xml           text NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  issue_date    date NOT NULL,
  issue_time    text NOT NULL,
  supply_date   date,
  due_date      date,
  pay_means     text NOT NULL DEFAULT '10',
  notes         text,
  reason        text,
  ref_document_id uuid REFERENCES documents(id),
  customer_id   uuid REFERENCES customers(id),
  seller_snapshot jsonb NOT NULL,
  buyer_snapshot  jsonb,
  lines         jsonb NOT NULL,
  totals        jsonb NOT NULL,
  net_total     numeric(14,2) NOT NULL,
  vat_total     numeric(14,2) NOT NULL,
  gross_total   numeric(14,2) NOT NULL,
  issued_by     uuid NOT NULL REFERENCES users(id),
  -- submission state: the only columns that may change after issue
  zatca_status  text NOT NULL CHECK (zatca_status IN ('pending','cleared','reported','rejected','failed')),
  zatca_mode    text NOT NULL,
  zatca_response jsonb,
  zatca_at      timestamptz,
  cleared_xml   text,
  submit_attempts integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, number),
  UNIQUE (egs_id, icv)
);
CREATE INDEX documents_org_issued_idx ON documents(org_id, issued_at DESC);
CREATE INDEX documents_pending_idx ON documents(zatca_status) WHERE zatca_status IN ('pending','failed');

CREATE OR REPLACE FUNCTION zimara_guard_documents() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Issued e-invoices cannot be deleted. Issue a credit note instead.';
  END IF;
  IF (NEW.id, NEW.org_id, NEW.egs_id, NEW.number, NEW.uuid, NEW.kind, NEW.doc_type, NEW.icv, NEW.pih, NEW.hash, NEW.signature,
      NEW.qr, NEW.xml, NEW.issued_at, NEW.issue_date, NEW.issue_time, NEW.supply_date, NEW.due_date, NEW.pay_means, NEW.notes,
      NEW.reason, NEW.ref_document_id, NEW.customer_id, NEW.seller_snapshot, NEW.buyer_snapshot, NEW.lines, NEW.totals,
      NEW.net_total, NEW.vat_total, NEW.gross_total, NEW.issued_by, NEW.zatca_mode)
     IS DISTINCT FROM
     (OLD.id, OLD.org_id, OLD.egs_id, OLD.number, OLD.uuid, OLD.kind, OLD.doc_type, OLD.icv, OLD.pih, OLD.hash, OLD.signature,
      OLD.qr, OLD.xml, OLD.issued_at, OLD.issue_date, OLD.issue_time, OLD.supply_date, OLD.due_date, OLD.pay_means, OLD.notes,
      OLD.reason, OLD.ref_document_id, OLD.customer_id, OLD.seller_snapshot, OLD.buyer_snapshot, OLD.lines, OLD.totals,
      OLD.net_total, OLD.vat_total, OLD.gross_total, OLD.issued_by, OLD.zatca_mode) THEN
    RAISE EXCEPTION 'Issued e-invoices cannot be modified. Issue a credit or debit note instead.';
  END IF;
  IF OLD.cleared_xml IS NOT NULL AND NEW.cleared_xml IS DISTINCT FROM OLD.cleared_xml THEN
    RAISE EXCEPTION 'Cleared XML is final';
  END IF;
  IF OLD.zatca_status IN ('cleared','reported') AND NEW.zatca_status <> OLD.zatca_status THEN
    RAISE EXCEPTION 'A cleared or reported document cannot change status';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER documents_guard BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION zimara_guard_documents();

CREATE OR REPLACE FUNCTION zimara_block_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE is not allowed on %', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER documents_no_truncate BEFORE TRUNCATE ON documents EXECUTE FUNCTION zimara_block_truncate();

-- ---------- payments (append-only; a reversal is a negative entry) ----------
CREATE TABLE payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  amount      numeric(14,2) NOT NULL CHECK (amount <> 0),
  method      text NOT NULL,
  paid_at     timestamptz NOT NULL DEFAULT now(),
  created_by  uuid NOT NULL REFERENCES users(id),
  note        text
);
CREATE INDEX payments_doc_idx ON payments(document_id);

-- ---------- audit log (append-only) ----------
CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id     uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  detail     text,
  ip         text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_org_at_idx ON audit_log(org_id, at DESC);

CREATE OR REPLACE FUNCTION zimara_append_only() RETURNS trigger AS $$
BEGIN
  -- allow the FK action "SET NULL" on user deletion, nothing else
  IF TG_OP = 'UPDATE' AND NEW.user_id IS NULL AND OLD.user_id IS NOT NULL
     AND (NEW.id, NEW.org_id, NEW.action, NEW.detail, NEW.ip, NEW.at) IS NOT DISTINCT FROM (OLD.id, OLD.org_id, OLD.action, OLD.detail, OLD.ip, OLD.at) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION zimara_append_only();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_log EXECUTE FUNCTION zimara_block_truncate();
CREATE OR REPLACE FUNCTION zimara_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payments_append_only BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION zimara_block_mutation();

