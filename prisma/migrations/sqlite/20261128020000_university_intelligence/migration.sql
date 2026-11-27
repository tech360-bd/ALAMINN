-- University & course intelligence system: documented source registry
-- (Level 1/2/3), per-fact evidence with original wording + normalised
-- values, conflict preservation, duplicate flags, per-source collection
-- jobs and a unified human-review queue. Additive only — no existing
-- table altered or dropped.

CREATE TABLE "HigherStudySourceOrg" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "key" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "level" TEXT NOT NULL,
 "baseUrl" TEXT,
 "docsUrl" TEXT,
 "permissionState" TEXT NOT NULL DEFAULT 'unknown',
 "permissionNote" TEXT,
 "robotsCheckedAt" DATETIME,
 "apiAvailable" BOOLEAN NOT NULL DEFAULT false,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "notes" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 UNIQUE ("key")
);
CREATE INDEX "HigherStudySourceOrg_level_idx" ON "HigherStudySourceOrg"("level");
CREATE INDEX "HigherStudySourceOrg_active_idx" ON "HigherStudySourceOrg"("active");
CREATE INDEX "HigherStudySourceOrg_permissionState_idx" ON "HigherStudySourceOrg"("permissionState");

CREATE TABLE "HigherStudyEvidence" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "entityType" TEXT NOT NULL,
 "entityId" TEXT NOT NULL,
 "field" TEXT NOT NULL,
 "sourceOrgId" TEXT,
 "sourceOrgKey" TEXT,
 "sourceLevel" TEXT NOT NULL,
 "sourceType" TEXT NOT NULL DEFAULT 'university-course',
 "sourceUrl" TEXT NOT NULL,
 "academicYear" TEXT,
 "originalWording" TEXT,
 "normalisedValue" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
 "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastCheckedAt" DATETIME,
 "lastVerifiedAt" DATETIME,
 "verifiedById" TEXT,
 "changeHistory" TEXT,
 "notes" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 UNIQUE ("entityType", "entityId", "field", "sourceUrl")
);
CREATE INDEX "HigherStudyEvidence_entityType_entityId_field_idx" ON "HigherStudyEvidence"("entityType", "entityId", "field");
CREATE INDEX "HigherStudyEvidence_status_idx" ON "HigherStudyEvidence"("status");
CREATE INDEX "HigherStudyEvidence_sourceOrgKey_idx" ON "HigherStudyEvidence"("sourceOrgKey");
CREATE INDEX "HigherStudyEvidence_lastCheckedAt_idx" ON "HigherStudyEvidence"("lastCheckedAt");

CREATE TABLE "HigherStudyConflict" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "entityType" TEXT NOT NULL,
 "entityId" TEXT NOT NULL,
 "field" TEXT NOT NULL,
 "candidates" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'open',
 "resolution" TEXT,
 "resolvedValue" TEXT,
 "resolvedById" TEXT,
 "resolvedAt" DATETIME,
 "reviewNotes" TEXT,
 "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "HigherStudyConflict_status_idx" ON "HigherStudyConflict"("status");
CREATE INDEX "HigherStudyConflict_entityType_entityId_field_idx" ON "HigherStudyConflict"("entityType", "entityId", "field");
CREATE INDEX "HigherStudyConflict_detectedAt_idx" ON "HigherStudyConflict"("detectedAt");

CREATE TABLE "HigherStudyDuplicateFlag" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "entityType" TEXT NOT NULL,
 "entityIds" TEXT NOT NULL,
 "similarityScore" REAL NOT NULL DEFAULT 0,
 "matchReason" TEXT,
 "status" TEXT NOT NULL DEFAULT 'open',
 "decidedById" TEXT,
 "decidedAt" DATETIME,
 "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "HigherStudyDuplicateFlag_status_idx" ON "HigherStudyDuplicateFlag"("status");
CREATE INDEX "HigherStudyDuplicateFlag_entityType_idx" ON "HigherStudyDuplicateFlag"("entityType");
CREATE INDEX "HigherStudyDuplicateFlag_detectedAt_idx" ON "HigherStudyDuplicateFlag"("detectedAt");

CREATE TABLE "HigherStudyCollectionJob" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "runId" TEXT,
 "sourceOrgId" TEXT,
 "sourceUrl" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'queued',
 "robotsAllowed" BOOLEAN NOT NULL DEFAULT false,
 "httpStatus" INTEGER,
 "itemsSeen" INTEGER NOT NULL DEFAULT 0,
 "evidenceCreated" INTEGER NOT NULL DEFAULT 0,
 "evidenceUpdated" INTEGER NOT NULL DEFAULT 0,
 "conflictsDetected" INTEGER NOT NULL DEFAULT 0,
 "error" TEXT,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "nextRetryAt" DATETIME,
 "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" DATETIME
);
CREATE INDEX "HigherStudyCollectionJob_status_idx" ON "HigherStudyCollectionJob"("status");
CREATE INDEX "HigherStudyCollectionJob_sourceUrl_idx" ON "HigherStudyCollectionJob"("sourceUrl");
CREATE INDEX "HigherStudyCollectionJob_nextRetryAt_idx" ON "HigherStudyCollectionJob"("nextRetryAt");
CREATE INDEX "HigherStudyCollectionJob_startedAt_idx" ON "HigherStudyCollectionJob"("startedAt");

CREATE TABLE "HigherStudyReviewTask" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "type" TEXT NOT NULL,
 "refType" TEXT NOT NULL,
 "refId" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "detail" TEXT,
 "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
 "status" TEXT NOT NULL DEFAULT 'pending',
 "assignedTo" TEXT,
 "resolution" TEXT,
 "decidedById" TEXT,
 "decidedAt" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 UNIQUE ("type", "refType", "refId")
);
CREATE INDEX "HigherStudyReviewTask_status_idx" ON "HigherStudyReviewTask"("status");
CREATE INDEX "HigherStudyReviewTask_type_idx" ON "HigherStudyReviewTask"("type");
CREATE INDEX "HigherStudyReviewTask_priority_idx" ON "HigherStudyReviewTask"("priority");
