# CRM Legacy Database Import Summary

## Overview
Successfully created and populated `crm_legacy` schema in PostgreSQL database at `localhost:5432/crm`.

## Tables Created in `crm_legacy` Schema

| Table | Rows Imported | Source File | Notes |
|-------|---------------|-------------|-------|
| companies | 316 | crm_table_companies.csv | Some rows filtered (id=1 "Not Assigned") |
| users | 200 | crm_table_users.csv | |
| groups | 9 | crm_table_groups.csv | |
| statuses | 43 | crm_table_statuses.csv | |
| phone_types | 8 | crm_table_phone_types.csv | |
| countries | 224 | crm_table_countries.csv | |
| lists | 298 | crm_table_lists.csv | |
| positions | 49 | crm_table_positions.csv | Columns: id, name, company_type |
| stocks | 3,295 | crm_table_stocks.csv | |
| company_employees | 1,644 | crm_table_company_employees.csv | |
| client_audit | 81,099 | crm_table_client_audit.csv | |
| client_contacts | 20,458 | crm_table_client_contacts.csv | |
| client_notes | 54,680 | crm_table_client_notes.csv | Multi-line notes field |
| client_shares | 100,382 | crm_table_client_shares.csv | |
| clients | 47,836 | crm_table_clients.csv | Multi-line notes field |
| group_permissions | 64 | crm_table_group_permissions.csv | can_send_to_status stored as text |
| call_log | 3 | crm_table_call_log.csv | |
| refs | 34 | crm_table_refs.csv | Different column structure |
| trunks | 26 | crm_table_trunks.csv | |
| dnc_list | 0 | crm_table_dnc_list.csv | Only header row in source |
| call_campaigns | 0 | crm_table_call_campaigns.csv | Only header row in source |
| list_duplicates | 0 | crm_table_list_duplicates.csv | Complex multi-line format (not imported) |

## legacy_map Table (in public schema)

Tracks migration from legacy database with the following structure:
- `prismaContactId` text PRIMARY KEY
- `legacyDb` text NOT NULL
- `legacyTable` text NOT NULL
- `legacyId` text NOT NULL
- `linkedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
- `sourceFile` text
- `supersededAt` timestamp

**Constraints:**
- Primary key on prismaContactId
- Unique constraint on (legacyDb, legacyTable, legacyId)

**Indexes:**
- `legacy_map_pkey` - on prismaContactId
- `unique_legacy_constraint` - on (legacyDb, legacyTable, legacyId)
- `idx_legacy_map_legacy_table` - on legacyTable
- `idx_legacy_map_legacy_id` - on legacyId
- `idx_legacy_map_superseded` - on supersededAt

**Total entries:** 210,193

## Notes

1. **Multi-line CSV Fields**: Files `crm_table_clients.csv` and `crm_table_client_notes.csv` contain multi-line fields (notes). Standard COPY import handles these correctly.

2. **NULL Values**: `crm_table_call_log.csv` contains "NULL" string values that needed preprocessing. Fixed file: `crm_table_call_log_fixed.csv`

3. **Complex Format**: `crm_table_list_duplicates.csv` has a complex multi-line format that doesn't fit standard CSV parsing. Not imported.

4. **Empty Files**: `dnc_list` and `call_campaigns` contain only header rows in the source files.

5. **Column Type Changes**: `positions` table has `company_type` instead of `is_active`. `group_permissions.can_send_to_status` stored as text due to comma-separated values.

## Files

- `scripts/crm_legacy_schema.sql` - Schema definition (can be re-run idempotently)
- `scripts/import_final.sql` - Complete import script and verification

## Verification Commands

```sql
-- Check all tables
SELECT table_name, COUNT(*) as row_count 
FROM crm_legacy.** 
GROUP BY table_name 
ORDER BY table_name;

-- Verify legacy_map
SELECT COUNT(*) as legacy_map_count FROM public.legacy_map;

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'legacy_map' AND schemaname = 'public';
```