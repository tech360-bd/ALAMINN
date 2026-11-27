-- P0 completion sprint: CRM hygiene (custom fields, imports, merges),
-- automation (sequences, rules), public API platform (keys, webhooks,
-- usage logs) and the AEO engine. Additive only — no table dropped.
ALTER TABLE "Contact" ADD COLUMN "customFields" TEXT;

CREATE TABLE "CustomField" (
 "id" TEXT NOT NULL PRIMARY KEY, "entity" TEXT NOT NULL DEFAULT 'contact',
 "key" TEXT NOT NULL, "label" TEXT NOT NULL,
 "type" TEXT NOT NULL DEFAULT 'text', "options" TEXT,
 "required" BOOLEAN NOT NULL DEFAULT false, "sortOrder" INTEGER NOT NULL DEFAULT 0,
 "status" TEXT NOT NULL DEFAULT 'active',
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 UNIQUE ("entity", "key")
);
CREATE INDEX "CustomField_entity_status_idx" ON "CustomField"("entity", "status");

CREATE TABLE "ContactImportJob" (
 "id" TEXT NOT NULL PRIMARY KEY, "filename" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending',
 "totalRows" INTEGER NOT NULL DEFAULT 0, "createdRows" INTEGER NOT NULL DEFAULT 0,
 "updatedRows" INTEGER NOT NULL DEFAULT 0, "skippedRows" INTEGER NOT NULL DEFAULT 0,
 "duplicateRows" INTEGER NOT NULL DEFAULT 0, "mapping" TEXT, "report" TEXT, "errors" TEXT,
 "createdBy" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" DATETIME
);

CREATE TABLE "ContactMergeLog" (
 "id" TEXT NOT NULL PRIMARY KEY, "masterId" TEXT NOT NULL, "duplicateId" TEXT NOT NULL,
 "mergedFields" TEXT, "mergedBy" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AutomationSequence" (
 "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "trigger" TEXT NOT NULL DEFAULT 'manual', "status" TEXT NOT NULL DEFAULT 'draft',
 "steps" TEXT NOT NULL DEFAULT '[]', "enrollCount" INTEGER NOT NULL DEFAULT 0,
 "createdBy" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "SequenceEnrollment" (
 "id" TEXT NOT NULL PRIMARY KEY, "sequenceId" TEXT NOT NULL, "contactId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'active', "currentStep" INTEGER NOT NULL DEFAULT 0,
 "nextStepAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "variables" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 UNIQUE ("sequenceId", "contactId")
);
CREATE INDEX "SequenceEnrollment_status_nextStepAt_idx" ON "SequenceEnrollment"("status", "nextStepAt");

CREATE TABLE "AutomationRule" (
 "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "trigger" TEXT NOT NULL,
 "conditions" TEXT NOT NULL DEFAULT '[]', "actions" TEXT NOT NULL DEFAULT '[]',
 "status" TEXT NOT NULL DEFAULT 'draft', "runCount" INTEGER NOT NULL DEFAULT 0,
 "lastRunAt" DATETIME, "createdBy" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "AutomationRunLog" (
 "id" TEXT NOT NULL PRIMARY KEY, "ruleId" TEXT NOT NULL, "trigger" TEXT NOT NULL,
 "contactId" TEXT, "status" TEXT NOT NULL DEFAULT 'success', "detail" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AutomationRunLog_ruleId_createdAt_idx" ON "AutomationRunLog"("ruleId", "createdAt");

CREATE TABLE "ApiKey" (
 "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "prefix" TEXT NOT NULL,
 "hashedKey" TEXT NOT NULL UNIQUE, "scopes" TEXT NOT NULL DEFAULT '[]',
 "status" TEXT NOT NULL DEFAULT 'active', "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
 "lastUsedAt" DATETIME, "createdBy" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "WebhookEndpoint" (
 "id" TEXT NOT NULL PRIMARY KEY, "url" TEXT NOT NULL, "events" TEXT NOT NULL DEFAULT '[]',
 "secret" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active',
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "WebhookDelivery" (
 "id" TEXT NOT NULL PRIMARY KEY, "endpointId" TEXT NOT NULL, "event" TEXT NOT NULL,
 "payload" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
 "attempts" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "deliveredAt" DATETIME
);
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

CREATE TABLE "ApiUsageLog" (
 "id" TEXT NOT NULL PRIMARY KEY, "keyId" TEXT, "route" TEXT NOT NULL,
 "method" TEXT NOT NULL, "status" INTEGER NOT NULL, "durationMs" INTEGER NOT NULL DEFAULT 0,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ApiUsageLog_keyId_createdAt_idx" ON "ApiUsageLog"("keyId", "createdAt");
CREATE INDEX "ApiUsageLog_route_createdAt_idx" ON "ApiUsageLog"("route", "createdAt");

CREATE TABLE "AeoCheckRun" (
 "id" TEXT NOT NULL PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'pending',
 "engine" TEXT NOT NULL DEFAULT 'all', "queries" INTEGER NOT NULL DEFAULT 0,
 "citedCount" INTEGER NOT NULL DEFAULT 0, "score" INTEGER NOT NULL DEFAULT 0,
 "detail" TEXT, "startedBy" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" DATETIME
);

CREATE TABLE "AeoCitationCheck" (
 "id" TEXT NOT NULL PRIMARY KEY, "runId" TEXT NOT NULL, "engine" TEXT NOT NULL,
 "query" TEXT NOT NULL, "cited" BOOLEAN NOT NULL DEFAULT false, "url" TEXT, "position" INTEGER,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AeoCitationCheck_runId_idx" ON "AeoCitationCheck"("runId");

CREATE TABLE "AeoContentGap" (
 "id" TEXT NOT NULL PRIMARY KEY, "topic" TEXT NOT NULL, "intent" TEXT NOT NULL DEFAULT 'informational',
 "ourCoverage" TEXT NOT NULL DEFAULT 'none', "competitors" TEXT,
 "recommendation" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'open',
 "score" INTEGER NOT NULL DEFAULT 0,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 UNIQUE ("topic")
);
