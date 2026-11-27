-- University & course intelligence system: documented source registry
-- (Level 1/2/3), per-fact evidence with original wording + normalised
-- values, conflict preservation, duplicate flags, per-source collection
-- jobs and a unified human-review queue. Additive only — no existing
-- table altered or dropped.

CREATE TABLE `HigherStudySourceOrg` (
 `id` VARCHAR(191) NOT NULL,
 `key` VARCHAR(191) NOT NULL,
 `name` VARCHAR(500) NOT NULL,
 `level` VARCHAR(191) NOT NULL,
 `baseUrl` VARCHAR(500) NULL,
 `docsUrl` VARCHAR(500) NULL,
 `permissionState` VARCHAR(191) NOT NULL DEFAULT 'unknown',
 `permissionNote` TEXT NULL,
 `robotsCheckedAt` DATETIME(3) NULL,
 `apiAvailable` BOOLEAN NOT NULL DEFAULT false,
 `active` BOOLEAN NOT NULL DEFAULT true,
 `notes` TEXT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `HigherStudySourceOrg_key_key` (`key`),
 KEY `HigherStudySourceOrg_level_idx` (`level`),
 KEY `HigherStudySourceOrg_active_idx` (`active`),
 KEY `HigherStudySourceOrg_permissionState_idx` (`permissionState`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HigherStudyEvidence` (
 `id` VARCHAR(191) NOT NULL,
 `entityType` VARCHAR(191) NOT NULL,
 `entityId` VARCHAR(191) NOT NULL,
 `field` VARCHAR(191) NOT NULL,
 `sourceOrgId` VARCHAR(191) NULL,
 `sourceOrgKey` VARCHAR(191) NULL,
 `sourceLevel` VARCHAR(191) NOT NULL,
 `sourceType` VARCHAR(191) NOT NULL DEFAULT 'university-course',
 `sourceUrl` VARCHAR(500) NOT NULL,
 `academicYear` VARCHAR(191) NULL,
 `originalWording` TEXT NULL,
 `normalisedValue` TEXT NOT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'DISCOVERED',
 `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `lastCheckedAt` DATETIME(3) NULL,
 `lastVerifiedAt` DATETIME(3) NULL,
 `verifiedById` VARCHAR(191) NULL,
 `changeHistory` TEXT NULL,
 `notes` TEXT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `HigherStudyEvidence_entityType_entityId_field_sourceUrl_key` (`entityType`, `entityId`, `field`, `sourceUrl`),
 KEY `HigherStudyEvidence_entityType_entityId_field_idx` (`entityType`, `entityId`, `field`),
 KEY `HigherStudyEvidence_status_idx` (`status`),
 KEY `HigherStudyEvidence_sourceOrgKey_idx` (`sourceOrgKey`),
 KEY `HigherStudyEvidence_lastCheckedAt_idx` (`lastCheckedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HigherStudyConflict` (
 `id` VARCHAR(191) NOT NULL,
 `entityType` VARCHAR(191) NOT NULL,
 `entityId` VARCHAR(191) NOT NULL,
 `field` VARCHAR(191) NOT NULL,
 `candidates` TEXT NOT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'open',
 `resolution` TEXT NULL,
 `resolvedValue` TEXT NULL,
 `resolvedById` VARCHAR(191) NULL,
 `resolvedAt` DATETIME(3) NULL,
 `reviewNotes` TEXT NULL,
 `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 KEY `HigherStudyConflict_status_idx` (`status`),
 KEY `HigherStudyConflict_entityType_entityId_field_idx` (`entityType`, `entityId`, `field`),
 KEY `HigherStudyConflict_detectedAt_idx` (`detectedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HigherStudyDuplicateFlag` (
 `id` VARCHAR(191) NOT NULL,
 `entityType` VARCHAR(191) NOT NULL,
 `entityIds` TEXT NOT NULL,
 `similarityScore` DOUBLE NOT NULL DEFAULT 0,
 `matchReason` VARCHAR(191) NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'open',
 `decidedById` VARCHAR(191) NULL,
 `decidedAt` DATETIME(3) NULL,
 `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 KEY `HigherStudyDuplicateFlag_status_idx` (`status`),
 KEY `HigherStudyDuplicateFlag_entityType_idx` (`entityType`),
 KEY `HigherStudyDuplicateFlag_detectedAt_idx` (`detectedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HigherStudyCollectionJob` (
 `id` VARCHAR(191) NOT NULL,
 `runId` VARCHAR(191) NULL,
 `sourceOrgId` VARCHAR(191) NULL,
 `sourceUrl` VARCHAR(500) NOT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
 `robotsAllowed` BOOLEAN NOT NULL DEFAULT false,
 `httpStatus` INTEGER NULL,
 `itemsSeen` INTEGER NOT NULL DEFAULT 0,
 `evidenceCreated` INTEGER NOT NULL DEFAULT 0,
 `evidenceUpdated` INTEGER NOT NULL DEFAULT 0,
 `conflictsDetected` INTEGER NOT NULL DEFAULT 0,
 `error` TEXT NULL,
 `attempts` INTEGER NOT NULL DEFAULT 0,
 `nextRetryAt` DATETIME(3) NULL,
 `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `completedAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`),
 KEY `HigherStudyCollectionJob_status_idx` (`status`),
 KEY `HigherStudyCollectionJob_sourceUrl_idx` (`sourceUrl`),
 KEY `HigherStudyCollectionJob_nextRetryAt_idx` (`nextRetryAt`),
 KEY `HigherStudyCollectionJob_startedAt_idx` (`startedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HigherStudyReviewTask` (
 `id` VARCHAR(191) NOT NULL,
 `type` VARCHAR(191) NOT NULL,
 `refType` VARCHAR(191) NOT NULL,
 `refId` VARCHAR(191) NOT NULL,
 `title` VARCHAR(500) NOT NULL,
 `detail` TEXT NULL,
 `priority` VARCHAR(191) NOT NULL DEFAULT 'MEDIUM',
 `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
 `assignedTo` VARCHAR(191) NULL,
 `resolution` TEXT NULL,
 `decidedById` VARCHAR(191) NULL,
 `decidedAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `HigherStudyReviewTask_type_refType_refId_key` (`type`, `refType`, `refId`),
 KEY `HigherStudyReviewTask_status_idx` (`status`),
 KEY `HigherStudyReviewTask_type_idx` (`type`),
 KEY `HigherStudyReviewTask_priority_idx` (`priority`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
