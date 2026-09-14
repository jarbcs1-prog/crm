-- M-05: backfill sweeps unbounded NOT IN lists
CREATE INDEX IF NOT EXISTS "agentTask_kind_finishedAt_idx" ON "agentTask" ("kind", "finishedAt");
CREATE INDEX IF NOT EXISTS "agentTask_kind_finishedAt_company_idx" ON "agentTask" ("kind", "finishedAt", "companyId");
CREATE INDEX IF NOT EXISTS "agentTask_kind_finishedAt_contact_idx" ON "agentTask" ("kind", "finishedAt", "contactId");

-- L-06: claimDue ORDER BY not index-aligned
CREATE INDEX IF NOT EXISTS "agentTask_claimDue_idx" ON "agentTask" ("finishedAt", "dueAt", "priority", "kind");

-- L-07: activities timeline composite
CREATE INDEX IF NOT EXISTS "activity_company_occurredAt_idx" ON "activity" ("companyId", "occurredAt");
CREATE INDEX IF NOT EXISTS "activity_company_createdAt_idx" ON "activity" ("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_contact_createdAt_idx" ON "activity" ("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_deal_createdAt_idx" ON "activity" ("dealId", "createdAt");

-- M-06: dashboard 6-month deal read
CREATE INDEX IF NOT EXISTS "deal_createdAt_closedAt_idx" ON "deal" ("createdAt", "closedAt");
CREATE INDEX IF NOT EXISTS "deal_expectedCloseDate_stage_idx" ON "deal" ("expectedCloseDate", "stage");

-- M-07/L-08: workspace/company counts
CREATE INDEX IF NOT EXISTS "contact_companyId_idx" ON "contact" ("companyId");
CREATE INDEX IF NOT EXISTS "deal_companyId_stage_idx" ON "deal" ("companyId", "stage");

-- Dashboard overdue tasks
CREATE INDEX IF NOT EXISTS "activity_dueAt_completedAt_createdBy_idx" ON "activity" ("dueAt", "completedAt", "createdById");
