DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CallDirection') THEN
    CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CallStatus') THEN
    CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CallOutcome') THEN
    CREATE TYPE "CallOutcome" AS ENUM ('CONNECTED', 'VOICEMAIL', 'NO_ANSWER', 'WRONG_NUMBER', 'DO_NOT_CALL', 'INTERESTED', 'FOLLOW_UP', 'NOT_INTERESTED', 'MEETING_BOOKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CallEventType') THEN
    CREATE TYPE "CallEventType" AS ENUM ('RING', 'ANSWER', 'HANGUP', 'TRANSFER', 'VOICEMAIL', 'RECORDING_START', 'RECORDING_STOP', 'SIP_ERROR', 'AGENT_JOIN', 'AGENT_LEAVE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OsintStatus') THEN
    CREATE TYPE "OsintStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'ENRICHED', 'FAILED', 'SKIPPED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "call" (
  "id" TEXT NOT NULL,
  "contactId" TEXT,
  "companyId" TEXT,
  "userId" TEXT NOT NULL,
  "direction" "CallDirection" NOT NULL,
  "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
  "outcome" "CallOutcome",
  "sipCallId" TEXT,
  "callerId" TEXT,
  "calleeNumber" TEXT,
  "startedAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "durationSecs" INTEGER,
  "transcript" TEXT,
  "recordingPath" TEXT,
  "summary" TEXT,
  "clidControlScore" DOUBLE PRECISION,
  "clidLiquidityScore" DOUBLE PRECISION,
  "clidInterestScore" DOUBLE PRECISION,
  "clidDecisionMakerScore" DOUBLE PRECISION,
  "clidMotivationScore" DOUBLE PRECISION,
  "clidUrgencyScore" DOUBLE PRECISION,
  "clidExperienceScore" DOUBLE PRECISION,
  "clidBudgetScore" DOUBLE PRECISION,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "call_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "call"
  ADD COLUMN IF NOT EXISTS "sipCallId" TEXT,
  ADD COLUMN IF NOT EXISTS "callerId" TEXT,
  ADD COLUMN IF NOT EXISTS "calleeNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "answeredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "durationSecs" INTEGER,
  ADD COLUMN IF NOT EXISTS "transcript" TEXT,
  ADD COLUMN IF NOT EXISTS "recordingPath" TEXT,
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "clidControlScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clidLiquidityScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clidInterestScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clidDecisionMakerScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clidMotivationScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clidUrgencyScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clidExperienceScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clidBudgetScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "meta" JSONB;

CREATE TABLE IF NOT EXISTS "callEvent" (
  "id" TEXT NOT NULL,
  "callId" TEXT NOT NULL,
  "type" "CallEventType" NOT NULL,
  "payload" JSONB,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "callEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "callEvent"
  ADD COLUMN IF NOT EXISTS "payload" JSONB,
  ADD COLUMN IF NOT EXISTS "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "osintTarget" (
  "id" TEXT NOT NULL,
  "contactId" TEXT,
  "status" "OsintStatus" NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "actions" JSONB,
  "findings" JSONB,
  "correctedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "osintTarget_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "osintTarget"
  ADD COLUMN IF NOT EXISTS "status" "OsintStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS "actions" JSONB,
  ADD COLUMN IF NOT EXISTS "findings" JSONB,
  ADD COLUMN IF NOT EXISTS "correctedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "error" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "call_contactId_createdAt_idx" ON "call"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "call_companyId_createdAt_idx" ON "call"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "call_userId_createdAt_idx" ON "call"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "call_status_idx" ON "call"("status");
CREATE INDEX IF NOT EXISTS "callEvent_callId_ts_idx" ON "callEvent"("callId", "ts");
CREATE INDEX IF NOT EXISTS "osintTarget_status_priority_idx" ON "osintTarget"("status", "priority");
CREATE INDEX IF NOT EXISTS "osintTarget_contactId_idx" ON "osintTarget"("contactId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"call"'::regclass AND conname = 'call_contactId_fkey') THEN
    ALTER TABLE "call" ADD CONSTRAINT "call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"call"'::regclass AND conname = 'call_companyId_fkey') THEN
    ALTER TABLE "call" ADD CONSTRAINT "call_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"call"'::regclass AND conname = 'call_userId_fkey') THEN
    ALTER TABLE "call" ADD CONSTRAINT "call_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"callEvent"'::regclass AND conname = 'callEvent_callId_fkey') THEN
    ALTER TABLE "callEvent" ADD CONSTRAINT "callEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"osintTarget"'::regclass AND conname = 'osintTarget_contactId_fkey') THEN
    ALTER TABLE "osintTarget" ADD CONSTRAINT "osintTarget_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
