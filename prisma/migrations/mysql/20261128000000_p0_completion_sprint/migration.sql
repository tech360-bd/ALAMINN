-- P0 completion sprint: CRM hygiene (custom fields, imports, merges),
-- automation (sequences, rules), public API platform (keys, webhooks,
-- usage logs) and the AEO engine. Additive only — no table dropped.
ALTER TABLE `Contact` ADD COLUMN `customFields` TEXT NULL;

CREATE TABLE `CustomField` (
 `id` VARCHAR(191) NOT NULL, `entity` VARCHAR(191) NOT NULL DEFAULT 'contact',
 `key` VARCHAR(191) NOT NULL, `label` VARCHAR(500) NOT NULL,
 `type` VARCHAR(191) NOT NULL DEFAULT 'text', `options` TEXT NULL,
 `required` BOOLEAN NOT NULL DEFAULT false, `sortOrder` INTEGER NOT NULL DEFAULT 0,
 `status` VARCHAR(191) NOT NULL DEFAULT 'active',
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `CustomField_entity_key_key` (`entity`, `key`),
 KEY `CustomField_entity_status_idx` (`entity`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ContactImportJob` (
 `id` VARCHAR(191) NOT NULL, `filename` VARCHAR(500) NOT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
 `totalRows` INTEGER NOT NULL DEFAULT 0, `createdRows` INTEGER NOT NULL DEFAULT 0,
 `updatedRows` INTEGER NOT NULL DEFAULT 0, `skippedRows` INTEGER NOT NULL DEFAULT 0,
 `duplicateRows` INTEGER NOT NULL DEFAULT 0, `mapping` TEXT NULL, `report` TEXT NULL, `errors` TEXT NULL,
 `createdBy` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `finishedAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ContactMergeLog` (
 `id` VARCHAR(191) NOT NULL, `masterId` VARCHAR(191) NOT NULL, `duplicateId` VARCHAR(191) NOT NULL,
 `mergedFields` TEXT NULL, `mergedBy` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AutomationSequence` (
 `id` VARCHAR(191) NOT NULL, `name` VARCHAR(500) NOT NULL, `description` VARCHAR(2000) NOT NULL DEFAULT '',
 `trigger` VARCHAR(191) NOT NULL DEFAULT 'manual', `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
 `steps` TEXT NOT NULL, `enrollCount` INTEGER NOT NULL DEFAULT 0, `createdBy` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SequenceEnrollment` (
 `id` VARCHAR(191) NOT NULL, `sequenceId` VARCHAR(191) NOT NULL, `contactId` VARCHAR(191) NOT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'active', `currentStep` INTEGER NOT NULL DEFAULT 0,
 `nextStepAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `variables` TEXT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `SequenceEnrollment_sequenceId_contactId_key` (`sequenceId`, `contactId`),
 KEY `SequenceEnrollment_status_nextStepAt_idx` (`status`, `nextStepAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AutomationRule` (
 `id` VARCHAR(191) NOT NULL, `name` VARCHAR(500) NOT NULL, `trigger` VARCHAR(191) NOT NULL,
 `conditions` TEXT NOT NULL, `actions` TEXT NOT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'draft', `runCount` INTEGER NOT NULL DEFAULT 0,
 `lastRunAt` DATETIME(3) NULL, `createdBy` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AutomationRunLog` (
 `id` VARCHAR(191) NOT NULL, `ruleId` VARCHAR(191) NOT NULL, `trigger` VARCHAR(191) NOT NULL,
 `contactId` VARCHAR(191) NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'success', `detail` TEXT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), KEY `AutomationRunLog_ruleId_createdAt_idx` (`ruleId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ApiKey` (
 `id` VARCHAR(191) NOT NULL, `name` VARCHAR(500) NOT NULL, `prefix` VARCHAR(32) NOT NULL,
 `hashedKey` VARCHAR(191) NOT NULL, `scopes` TEXT NOT NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'active',
 `rateLimitPerMin` INTEGER NOT NULL DEFAULT 60, `lastUsedAt` DATETIME(3) NULL, `createdBy` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `ApiKey_hashedKey_key` (`hashedKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WebhookEndpoint` (
 `id` VARCHAR(191) NOT NULL, `url` VARCHAR(1000) NOT NULL, `events` TEXT NOT NULL,
 `secret` VARCHAR(500) NOT NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'active',
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WebhookDelivery` (
 `id` VARCHAR(191) NOT NULL, `endpointId` VARCHAR(191) NOT NULL, `event` VARCHAR(191) NOT NULL,
 `payload` TEXT NOT NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
 `attempts` INTEGER NOT NULL DEFAULT 0, `lastError` VARCHAR(500) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `deliveredAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`), KEY `WebhookDelivery_endpointId_createdAt_idx` (`endpointId`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ApiUsageLog` (
 `id` VARCHAR(191) NOT NULL, `keyId` VARCHAR(191) NULL, `route` VARCHAR(500) NOT NULL,
 `method` VARCHAR(16) NOT NULL, `status` INTEGER NOT NULL, `durationMs` INTEGER NOT NULL DEFAULT 0,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), KEY `ApiUsageLog_keyId_createdAt_idx` (`keyId`, `createdAt`),
 KEY `ApiUsageLog_route_createdAt_idx` (`route`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AeoCheckRun` (
 `id` VARCHAR(191) NOT NULL, `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
 `engine` VARCHAR(191) NOT NULL DEFAULT 'all', `queries` INTEGER NOT NULL DEFAULT 0,
 `citedCount` INTEGER NOT NULL DEFAULT 0, `score` INTEGER NOT NULL DEFAULT 0, `detail` TEXT NULL,
 `startedBy` VARCHAR(191) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `finishedAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AeoCitationCheck` (
 `id` VARCHAR(191) NOT NULL, `runId` VARCHAR(191) NOT NULL, `engine` VARCHAR(191) NOT NULL,
 `query` VARCHAR(500) NOT NULL, `cited` BOOLEAN NOT NULL DEFAULT false,
 `url` VARCHAR(1000) NULL, `position` INTEGER NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), KEY `AeoCitationCheck_runId_idx` (`runId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AeoContentGap` (
 `id` VARCHAR(191) NOT NULL, `topic` VARCHAR(500) NOT NULL,
 `intent` VARCHAR(191) NOT NULL DEFAULT 'informational', `ourCoverage` VARCHAR(191) NOT NULL DEFAULT 'none',
 `competitors` TEXT NULL, `recommendation` VARCHAR(2000) NOT NULL DEFAULT '',
 `status` VARCHAR(191) NOT NULL DEFAULT 'open', `score` INTEGER NOT NULL DEFAULT 0,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `AeoContentGap_topic_key` (`topic`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
