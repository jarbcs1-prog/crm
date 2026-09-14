-- Enable trigram similarity for LIKE '%term%' searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Company search: name, domain
CREATE INDEX IF NOT EXISTS "company_name_trgm_idx" ON "company" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "company_domain_trgm_idx" ON "company" USING GIN ("domain" gin_trgm_ops);

-- Contact search: firstName, lastName, email
CREATE INDEX IF NOT EXISTS "contact_firstName_trgm_idx" ON "contact" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "contact_lastName_trgm_idx" ON "contact" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "contact_email_trgm_idx" ON "contact" USING GIN ("email" gin_trgm_ops);

-- Deal search: name
CREATE INDEX IF NOT EXISTS "deal_name_trgm_idx" ON "deal" USING GIN ("name" gin_trgm_ops);