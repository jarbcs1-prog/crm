-- CRM Legacy Schema Setup
-- Creates crm_legacy schema and tables from CSV dump files
-- Idempotent: DROP IF EXISTS pattern used

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS crm_legacy;

-- ============================================================================
-- Table: companies
-- Source: crm_table_companies.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.companies CASCADE;
CREATE TABLE crm_legacy.companies (
  id text PRIMARY KEY,
  name text,
  short_name text,
  email text,
  address text,
  phone text,
  site_url text,
  is_active integer,
  id_country integer,
  id_registry integer,
  company_type text,
  old_registry_id text,
  director text,
  compliance_manager text,
  old_id_company integer
);

-- ============================================================================
-- Table: clients
-- Source: crm_table_clients.csv
-- Note: Multi-line fields (notes) require special handling during import
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.clients CASCADE;
CREATE TABLE crm_legacy.clients (
  id text PRIMARY KEY,
  name text,
  title text,
  address text,
  notes text,
  notes_registry text,
  id_company text,
  id_registry text,
  id_status text,
  id_user_agent text,
  id_user_registry text,
  id_reference text,
  id_employee text,
  id_employee_registry text,
  id_user_loader text,
  id_list text,
  id_country text,
  is_active integer
);

-- ============================================================================
-- Table: client_notes
-- Source: crm_table_client_notes.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.client_notes CASCADE;
CREATE TABLE crm_legacy.client_notes (
  id text PRIMARY KEY,
  note text,
  id_client text,
  id_user text,
  archived integer,
  creation_date timestamp,
  updated_at timestamp
);

-- ============================================================================
-- Table: client_contacts
-- Source: crm_table_client_contacts.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.client_contacts CASCADE;
CREATE TABLE crm_legacy.client_contacts (
  id text PRIMARY KEY,
  contact text,
  contact_type text,
  is_active integer,
  id_client text,
  id_phone_type text
);

-- ============================================================================
-- Table: client_audit
-- Source: crm_table_client_audit.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.client_audit CASCADE;
CREATE TABLE crm_legacy.client_audit (
  id integer PRIMARY KEY,
  event text,
  field text,
  old_value text,
  new_value text,
  id_client text,
  id_user text,
  id_employee integer
);

-- ============================================================================
-- Table: client_shares
-- Source: crm_table_client_shares.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.client_shares CASCADE;
CREATE TABLE crm_legacy.client_shares (
  id integer PRIMARY KEY,
  id_client text,
  name text,
  shares integer,
  price numeric,
  total_value numeric,
  id_stock integer,
  recert_amount numeric,
  warrants numeric,
  warrant_price numeric,
  addshares_amount numeric,
  addshares_clients text,
  addshares_price numeric,
  is_active integer,
  is_selected integer
);

-- ============================================================================
-- Table: users
-- Source: crm_table_users.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.users CASCADE;
CREATE TABLE crm_legacy.users (
  id text PRIMARY KEY,
  username text,
  userpass text,
  salt text,
  sipPassword text,
  id_group text,
  is_active integer,
  status text,
  old_id_user text,
  avatar text,
  voipstudio_apikey text
);

-- ============================================================================
-- Table: groups
-- Source: crm_table_groups.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.groups CASCADE;
CREATE TABLE crm_legacy.groups (
  id text PRIMARY KEY,
  name text,
  is_active integer
);

-- ============================================================================
-- Table: group_permissions
-- Source: crm_table_group_permissions.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.group_permissions CASCADE;
CREATE TABLE crm_legacy.group_permissions (
  id integer PRIMARY KEY,
  id_group text,
  id_status text,
  can_send_to_status text
);

-- ============================================================================
-- Table: lists
-- Source: crm_table_lists.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.lists CASCADE;
CREATE TABLE crm_legacy.lists (
  id integer PRIMARY KEY,
  name text,
  origin text,
  comment text,
  is_active integer,
  status text,
  total_new integer,
  total_duplicates integer
);

-- ============================================================================
-- Table: statuses
-- Source: crm_table_statuses.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.statuses CASCADE;
CREATE TABLE crm_legacy.statuses (
  id integer PRIMARY KEY,
  name text,
  is_active integer
);

-- ============================================================================
-- Table: stocks
-- Source: crm_table_stocks.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.stocks CASCADE;
CREATE TABLE crm_legacy.stocks (
  id integer PRIMARY KEY,
  name text,
  is_active integer,
  old_id_stock integer
);

-- ============================================================================
-- Table: company_employees
-- Source: crm_table_company_employees.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.company_employees CASCADE;
CREATE TABLE crm_legacy.company_employees (
  id integer PRIMARY KEY,
  name text,
  email text,
  is_active integer,
  id_company integer,
  id_user integer,
  id_position integer,
  old_id_company_employees text
);

-- ============================================================================
-- Table: positions
-- Source: crm_table_positions.csv
-- Columns: id, name, company_type
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.positions CASCADE;
CREATE TABLE crm_legacy.positions (
  id integer PRIMARY KEY,
  name text,
  company_type text
);

-- ============================================================================
-- Table: dnc_list
-- Source: crm_table_dnc_list.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.dnc_list CASCADE;
CREATE TABLE crm_legacy.dnc_list (
  id integer PRIMARY KEY,
  number text,
  reason text,
  added_at timestamp
);

-- ============================================================================
-- Table: phone_types
-- Source: crm_table_phone_types.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.phone_types CASCADE;
CREATE TABLE crm_legacy.phone_types (
  id integer PRIMARY KEY,
  name text,
  is_active integer
);

-- ============================================================================
-- Table: call_log
-- Source: crm_table_call_log.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.call_log CASCADE;
CREATE TABLE crm_legacy.call_log (
  id integer PRIMARY KEY,
  client_id text,
  phone_number text,
  agent_mode text,
  call_outcome text,
  disposition text,
  call_summary text,
  appointment_time timestamp,
  call_sid text,
  voip_call_id text,
  direction text,
  duration_seconds integer,
  created_by text,
  created_at timestamp
);

-- ============================================================================
-- Table: call_campaigns
-- Source: crm_table_call_campaigns.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.call_campaigns CASCADE;
CREATE TABLE crm_legacy.call_campaigns (
  id integer PRIMARY KEY,
  name text,
  status_filter text,
  created_at timestamp
);

-- ============================================================================
-- Table: list_duplicates
-- Source: crm_table_list_duplicates.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.list_duplicates CASCADE;
CREATE TABLE crm_legacy.list_duplicates (
  id integer PRIMARY KEY,
  list_name text,
  list_info text,
  possible_duplicates integer,
  id_list integer
);

-- ============================================================================
-- Table: countries
-- Source: crm_table_countries.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.countries CASCADE;
CREATE TABLE crm_legacy.countries (
  id integer PRIMARY KEY,
  name text,
  calling_code text,
  is_active integer,
  iso3166 text
);

-- ============================================================================
-- Table: refs
-- Source: crm_table_refs.csv (note: different structure than file name suggests)
-- Columns: id, name, email, address, phone, fax, is_active, id_user
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.refs CASCADE;
CREATE TABLE crm_legacy.refs (
  id integer PRIMARY KEY,
  name text,
  email text,
  address text,
  phone text,
  fax text,
  is_active integer,
  id_user integer
);

-- ============================================================================
-- Table: trunks
-- Source: crm_table_trunks.csv
-- ============================================================================
DROP TABLE IF EXISTS crm_legacy.trunks CASCADE;
CREATE TABLE crm_legacy.trunks (
  id integer PRIMARY KEY,
  username text,
  password text,
  host text,
  old_id_trunk text
);

-- ============================================================================
-- Table: legacy_map (in public schema)
-- Tracks migration from legacy database to Prisma schema
-- ============================================================================
DROP TABLE IF EXISTS public.legacy_map CASCADE;
CREATE TABLE public.legacy_map (
  prismaContactId text PRIMARY KEY,
  legacyDb text NOT NULL,
  legacyTable text NOT NULL,
  legacyId text NOT NULL,
  linkedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sourceFile text,
  supersededAt timestamp,
  CONSTRAINT unique_legacy_constraint UNIQUE (legacyDb, legacyTable, legacyId)
);

-- Create index for faster lookups
CREATE INDEX idx_legacy_map_legacy_table ON public.legacy_map (legacyTable);
CREATE INDEX idx_legacy_map_legacy_id ON public.legacy_map (legacyId);
CREATE INDEX idx_legacy_map_superseded ON public.legacy_map (supersededAt);