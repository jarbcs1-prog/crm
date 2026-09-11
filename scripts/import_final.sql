-- CRM Legacy Data Import Script
-- Run after schema creation

-- ============================================================================
-- Import tables with data
-- ============================================================================

-- Companies
\copy crm_legacy.companies FROM 'F:/crm/sql_dump/crm_extracted/crm_table_companies.csv' WITH (FORMAT csv, HEADER true);

-- Users
\copy crm_legacy.users FROM 'F:/crm/sql_dump/crm_extracted/crm_table_users.csv' WITH (FORMAT csv, HEADER true);

-- Groups
\copy crm_legacy.groups FROM 'F:/crm/sql_dump/crm_extracted/crm_table_groups.csv' WITH (FORMAT csv, HEADER true);

-- Statuses
\copy crm_legacy.statuses FROM 'F:/crm/sql_dump/crm_extracted/crm_table_statuses.csv' WITH (FORMAT csv, HEADER true);

-- Phone types
\copy crm_legacy.phone_types FROM 'F:/crm/sql_dump/crm_extracted/crm_table_phone_types.csv' WITH (FORMAT csv, HEADER true);

-- Countries
\copy crm_legacy.countries FROM 'F:/crm/sql_dump/crm_extracted/crm_table_countries.csv' WITH (FORMAT csv, HEADER true);

-- Lists
\copy crm_legacy.lists FROM 'F:/crm/sql_dump/crm_extracted/crm_table_lists.csv' WITH (FORMAT csv, HEADER true);

-- Positions
\copy crm_legacy.positions FROM 'F:/crm/sql_dump/crm_extracted/crm_table_positions.csv' WITH (FORMAT csv, HEADER true);

-- Stocks
\copy crm_legacy.stocks FROM 'F:/crm/sql_dump/crm_extracted/crm_table_stocks.csv' WITH (FORMAT csv, HEADER true);

-- Company employees
\copy crm_legacy.company_employees FROM 'F:/crm/sql_dump/crm_extracted/crm_table_company_employees.csv' WITH (FORMAT csv, HEADER true);

-- Group permissions (can_send_to_status is text due to comma-separated values)
\copy crm_legacy.group_permissions FROM 'F:/crm/sql_dump/crm_extracted/crm_table_group_permissions.csv' WITH (FORMAT csv, HEADER true);

-- Call campaigns (only header row in source file)
\copy crm_legacy.call_campaigns FROM 'F:/crm/sql_dump/crm_extracted/crm_table_call_campaigns.csv' WITH (FORMAT csv, HEADER true);

-- Call log
\copy crm_legacy.call_log FROM 'F:/crm/sql_dump/crm_extracted/crm_table_call_log_fixed.csv' WITH (FORMAT csv, HEADER true);

-- DNC list (only header row in source file)
\copy crm_legacy.dnc_list FROM 'F:/crm/sql_dump/crm_extracted/crm_table_dnc_list.csv' WITH (FORMAT csv, HEADER true);

-- Refs
\copy crm_legacy.refs FROM 'F:/crm/sql_dump/crm_extracted/crm_table_refs.csv' WITH (FORMAT csv, HEADER true);

-- Trunks
\copy crm_legacy.trunks FROM 'F:/crm/sql_dump/crm_extracted/crm_table_trunks.csv' WITH (FORMAT csv, HEADER true);

-- Client audit
\copy crm_legacy.client_audit FROM 'F:/crm/sql_dump/crm_extracted/crm_table_client_audit.csv' WITH (FORMAT csv, HEADER true);

-- Client contacts
\copy crm_legacy.client_contacts FROM 'F:/crm/sql_dump/crm_extracted/crm_table_client_contacts.csv' WITH (FORMAT csv, HEADER true);

-- Client notes
\copy crm_legacy.client_notes FROM 'F:/crm/sql_dump/crm_extracted/crm_table_client_notes.csv' WITH (FORMAT csv, HEADER true);

-- Client shares
\copy crm_legacy.client_shares FROM 'F:/crm/sql_dump/crm_extracted/crm_table_client_shares.csv' WITH (FORMAT csv, HEADER true);

-- Note: List duplicates has complex multi-line format - not imported via COPY

-- ============================================================================
-- Create legacy_map entries
-- ============================================================================

INSERT INTO public.legacy_map (prismaContactId, legacyDb, legacyTable, legacyId, linkedAt, sourceFile)
SELECT CONCAT('company_', id), 'crm', 'companies', id, CURRENT_TIMESTAMP, 'crm_table_companies.csv'
FROM crm_legacy.companies
ON CONFLICT (legacyDb, legacyTable, legacyId) DO NOTHING;

INSERT INTO public.legacy_map (prismaContactId, legacyDb, legacyTable, legacyId, linkedAt, sourceFile)
SELECT CONCAT('user_', id), 'crm', 'users', id, CURRENT_TIMESTAMP, 'crm_table_users.csv'
FROM crm_legacy.users
ON CONFLICT (legacyDb, legacyTable, legacyId) DO NOTHING;

INSERT INTO public.legacy_map (prismaContactId, legacyDb, legacyTable, legacyId, linkedAt, sourceFile)
SELECT CONCAT('client_', id), 'crm', 'clients', id, CURRENT_TIMESTAMP, 'crm_table_clients.csv'
FROM crm_legacy.clients
ON CONFLICT (legacyDb, legacyTable, legacyId) DO NOTHING;

INSERT INTO public.legacy_map (prismaContactId, legacyDb, legacyTable, legacyId, linkedAt, sourceFile)
SELECT CONCAT('note_', id), 'crm', 'client_notes', id, CURRENT_TIMESTAMP, 'crm_table_client_notes.csv'
FROM crm_legacy.client_notes
ON CONFLICT (legacyDb, legacyTable, legacyId) DO NOTHING;

INSERT INTO public.legacy_map (prismaContactId, legacyDb, legacyTable, legacyId, linkedAt, sourceFile)
SELECT CONCAT('contact_', id), 'crm', 'client_contacts', id, CURRENT_TIMESTAMP, 'crm_table_client_contacts.csv'
FROM crm_legacy.client_contacts
ON CONFLICT (legacyDb, legacyTable, legacyId) DO NOTHING;

INSERT INTO public.legacy_map (prismaContactId, legacyDb, legacyTable, legacyId, linkedAt, sourceFile)
SELECT CONCAT('audit_', id), 'crm', 'client_audit', id, CURRENT_TIMESTAMP, 'crm_table_client_audit.csv'
FROM crm_legacy.client_audit
ON CONFLICT (legacyDb, legacyTable, legacyId) DO NOTHING;

-- ============================================================================
-- Verification query
-- ============================================================================

SELECT 'VERIFICATION RESULTS' as report;

SELECT table_name, 
       row_count,
       CASE 
         WHEN expected = row_count THEN '✓ MATCH'
         WHEN expected IS NULL THEN '? UNKNOWN'
         ELSE '✗ MISMATCH'
       END as status
FROM (
  SELECT 'companies' as table_name, (SELECT COUNT(*) FROM crm_legacy.companies) as row_count, 424 as expected
  UNION ALL SELECT 'users', (SELECT COUNT(*) FROM crm_legacy.users), 200
  UNION ALL SELECT 'groups', (SELECT COUNT(*) FROM crm_legacy.groups), 9
  UNION ALL SELECT 'statuses', (SELECT COUNT(*) FROM crm_legacy.statuses), 43
  UNION ALL SELECT 'phone_types', (SELECT COUNT(*) FROM crm_legacy.phone_types), 8
  UNION ALL SELECT 'countries', (SELECT COUNT(*) FROM crm_legacy.countries), 224
  UNION ALL SELECT 'lists', (SELECT COUNT(*) FROM crm_legacy.lists), 298
  UNION ALL SELECT 'positions', (SELECT COUNT(*) FROM crm_legacy.positions), 49
  UNION ALL SELECT 'stocks', (SELECT COUNT(*) FROM crm_legacy.stocks), 3295
  UNION ALL SELECT 'company_employees', (SELECT COUNT(*) FROM crm_legacy.company_employees), 1644
  UNION ALL SELECT 'client_audit', (SELECT COUNT(*) FROM crm_legacy.client_audit), 270995
  UNION ALL SELECT 'client_contacts', (SELECT COUNT(*) FROM crm_legacy.client_contacts), 20458
  UNION ALL SELECT 'client_notes', (SELECT COUNT(*) FROM crm_legacy.client_notes), 203207
  UNION ALL SELECT 'client_shares', (SELECT COUNT(*) FROM crm_legacy.client_shares), 100382
  UNION ALL SELECT 'clients', (SELECT COUNT(*) FROM crm_legacy.clients), 882387
  UNION ALL SELECT 'group_permissions', (SELECT COUNT(*) FROM crm_legacy.group_permissions), 64
  UNION ALL SELECT 'call_log', (SELECT COUNT(*) FROM crm_legacy.call_log), 3
  UNION ALL SELECT 'refs', (SELECT COUNT(*) FROM crm_legacy.refs), 34
  UNION ALL SELECT 'trunks', (SELECT COUNT(*) FROM crm_legacy.trunks), 26
  UNION ALL SELECT 'dnc_list', (SELECT COUNT(*) FROM crm_legacy.dnc_list), 0
  UNION ALL SELECT 'call_campaigns', (SELECT COUNT(*) FROM crm_legacy.call_campaigns), 0
) v
ORDER BY table_name;

SELECT 'legacy_map entries: ' || COUNT(*) as count FROM public.legacy_map;