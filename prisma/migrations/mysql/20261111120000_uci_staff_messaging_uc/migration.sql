-- Delta migration: ALO Education UCI + staff auth/RBAC + UMC subsystems
-- Adds the 24 tables of the merged 109-model schema that the earlier
-- MySQL migrations (initial, integrated_feature_kits, agentos_foundation)
-- do not cover, plus their foreign keys.
-- Source: prisma migrate diff --from-empty
--         --to-schema-datamodel prisma/schema.mysql.prisma --script

-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `timezone` TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    `messagingStart` INTEGER NOT NULL DEFAULT 9,
    `messagingEnd` INTEGER NOT NULL DEFAULT 21,
    `languages` TEXT NOT NULL DEFAULT 'bn,en,banglish',
    `aiAutoReply` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Tenant_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `MessagingUser` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `externalRef` VARCHAR(191) NULL,
    `displayName` TEXT NOT NULL,
    `role` TEXT NOT NULL DEFAULT 'customer',
    `locale` TEXT NOT NULL DEFAULT 'bn',
    `lastSeenAt` DATETIME(3) NULL,
    `isBanned` BOOLEAN NOT NULL DEFAULT false,
    `isVerifiedBusiness` BOOLEAN NOT NULL DEFAULT false,
    `blockedIds` TEXT NOT NULL DEFAULT '[]',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MessagingUser_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `MessagingUser_tenantId_externalRef_key`(`tenantId`, `externalRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `type` TEXT NOT NULL,
    `title` TEXT NULL,
    `mode` TEXT NOT NULL DEFAULT 'two_way',
    `visibility` TEXT NOT NULL DEFAULT 'private',
    `aiMode` BOOLEAN NOT NULL DEFAULT true,
    `status` TEXT NOT NULL DEFAULT 'active',
    `burnoutAfter` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Conversation_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `ConversationParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` TEXT NOT NULL DEFAULT 'member',
    `lastReadMessageId` VARCHAR(191) NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ConversationParticipant_userId_idx`(`userId`),
    UNIQUE INDEX `ConversationParticipant_conversationId_userId_key`(`conversationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NULL,
    `type` TEXT NOT NULL DEFAULT 'text',
    `body` TEXT NOT NULL DEFAULT '',
    `payload` TEXT NULL,
    `mentions` TEXT NOT NULL DEFAULT '[]',
    `language` TEXT NULL,
    `translation` TEXT NULL,
    `scheduledFor` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `hidden` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Message_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `Message_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Receipt` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deliveredAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,

    INDEX `Receipt_userId_idx`(`userId`),
    UNIQUE INDEX `Receipt_messageId_userId_key`(`messageId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Star` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Star_messageId_userId_key`(`messageId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Tag` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Tag_conversationId_label_key`(`conversationId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Consent` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `subjectRef` VARCHAR(191) NOT NULL,
    `channel` TEXT NOT NULL,
    `purpose` TEXT NOT NULL,
    `grantedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `proofRef` TEXT NULL,

    INDEX `Consent_tenantId_subjectRef_idx`(`tenantId`, `subjectRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `SuppressEntry` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SuppressEntry_tenantId_channel_value_key`(`tenantId`, `channel`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `ModerationWord` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `word` VARCHAR(191) NOT NULL,
    `severity` TEXT NOT NULL DEFAULT 'block',

    UNIQUE INDEX `ModerationWord_tenantId_word_key`(`tenantId`, `word`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `Report` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `reporterId` VARCHAR(191) NOT NULL,
    `targetUserId` VARCHAR(191) NULL,
    `messageId` VARCHAR(191) NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Report_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `type` TEXT NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `subjectType` TEXT NULL,
    `subjectId` VARCHAR(191) NULL,
    `detail` TEXT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_tenantId_at_idx`(`tenantId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `HandoffEvent` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `trigger` TEXT NOT NULL,
    `detail` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `claimedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,

    INDEX `HandoffEvent_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `UciSource` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `url` TEXT NULL,
    `level` TEXT NOT NULL,
    `identityStatus` TEXT NOT NULL DEFAULT 'CONFIRMED',
    `permissionNotes` TEXT NULL,
    `robotsAllowed` BOOLEAN NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UciSource_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `UciInstitution` (
    `id` VARCHAR(191) NOT NULL,
    `canonicalName` VARCHAR(191) NOT NULL,
    `asWritten` TEXT NOT NULL DEFAULT '[]',
    `country` TEXT NOT NULL,
    `cityNotes` TEXT NOT NULL DEFAULT '[]',
    `institutionType` TEXT NOT NULL DEFAULT 'UNKNOWN',
    `priorityCohort` BOOLEAN NOT NULL DEFAULT false,
    `officialWebsite` TEXT NULL,
    `status` TEXT NOT NULL DEFAULT 'DISCOVERED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UciInstitution_canonicalName_key`(`canonicalName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `UciRequirementRecord` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `context` TEXT NULL,
    `fieldsJson` TEXT NOT NULL,
    `sourceFile` TEXT NOT NULL,
    `sheet` TEXT NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `sourceUrl` TEXT NULL,
    `academicYear` TEXT NULL,
    `verificationStatus` VARCHAR(191) NOT NULL DEFAULT 'SOURCE_CHECK_REQUIRED',
    `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastCheckedAt` DATETIME(3) NULL,
    `lastVerifiedAt` DATETIME(3) NULL,
    `reviewedBy` TEXT NULL,
    `retiredReason` TEXT NULL,

    INDEX `UciRequirementRecord_institutionId_verificationStatus_idx`(`institutionId`, `verificationStatus`),
    INDEX `UciRequirementRecord_verificationStatus_idx`(`verificationStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `UciProgramme` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NULL,
    `institutionName` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NULL,
    `programName` TEXT NOT NULL,
    `duration` TEXT NULL,
    `tuition` TEXT NULL,
    `extraJson` TEXT NOT NULL DEFAULT '{}',
    `sourceFile` TEXT NOT NULL,
    `sheet` TEXT NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `sourceUrl` TEXT NULL,
    `verificationStatus` TEXT NOT NULL DEFAULT 'SOURCE_CHECK_REQUIRED',
    `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastCheckedAt` DATETIME(3) NULL,
    `lastVerifiedAt` DATETIME(3) NULL,
    `reviewedBy` TEXT NULL,

    INDEX `UciProgramme_institutionName_idx`(`institutionName`),
    INDEX `UciProgramme_level_idx`(`level`),
    INDEX `UciProgramme_country_idx`(`country`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `UciVerificationEvent` (
    `id` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL,
    `action` TEXT NOT NULL,
    `fromStatus` TEXT NULL,
    `toStatus` TEXT NULL,
    `actor` TEXT NOT NULL DEFAULT 'admin',
    `note` TEXT NULL,
    `fieldPatch` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UciVerificationEvent_recordId_idx`(`recordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `UciCollectionJob` (
    `id` VARCHAR(191) NOT NULL,
    `sourceKey` VARCHAR(191) NOT NULL,
    `targetUrl` TEXT NOT NULL,
    `type` TEXT NOT NULL DEFAULT 'SOURCE_CHECK',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `httpStatus` INTEGER NULL,
    `contentHash` TEXT NULL,
    `bytes` INTEGER NULL,
    `findings` TEXT NULL,
    `lastError` TEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `scheduledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,

    INDEX `UciCollectionJob_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `UciAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actor` TEXT NOT NULL DEFAULT 'admin',
    `action` TEXT NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UciAuditLog_entity_entityId_idx`(`entity`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `StaffAccount` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` TEXT NOT NULL,
    `name` TEXT NOT NULL,
    `role` TEXT NOT NULL DEFAULT 'VIEWER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffAccount_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `StaffSession` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `ip` TEXT NULL,
    `userAgent` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StaffSession_tokenHash_key`(`tokenHash`),
    INDEX `StaffSession_accountId_idx`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CreateTable
CREATE TABLE `PasswordResetCode` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `codeHash` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PasswordResetCode_accountId_idx`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MessagingUser` ADD CONSTRAINT `MessagingUser_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ConversationParticipant` ADD CONSTRAINT `ConversationParticipant_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ConversationParticipant` ADD CONSTRAINT `ConversationParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `MessagingUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `MessagingUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Receipt` ADD CONSTRAINT `Receipt_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Receipt` ADD CONSTRAINT `Receipt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `MessagingUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Star` ADD CONSTRAINT `Star_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Star` ADD CONSTRAINT `Star_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `MessagingUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Tag` ADD CONSTRAINT `Tag_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Tag` ADD CONSTRAINT `Tag_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Consent` ADD CONSTRAINT `Consent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `SuppressEntry` ADD CONSTRAINT `SuppressEntry_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ModerationWord` ADD CONSTRAINT `ModerationWord_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Report` ADD CONSTRAINT `Report_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `Report` ADD CONSTRAINT `Report_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `MessagingUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `HandoffEvent` ADD CONSTRAINT `HandoffEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `HandoffEvent` ADD CONSTRAINT `HandoffEvent_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `HandoffEvent` ADD CONSTRAINT `HandoffEvent_claimedById_fkey` FOREIGN KEY (`claimedById`) REFERENCES `MessagingUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `UciRequirementRecord` ADD CONSTRAINT `UciRequirementRecord_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `UciInstitution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `UciProgramme` ADD CONSTRAINT `UciProgramme_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `UciInstitution`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `UciVerificationEvent` ADD CONSTRAINT `UciVerificationEvent_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `UciRequirementRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `UciCollectionJob` ADD CONSTRAINT `UciCollectionJob_sourceKey_fkey` FOREIGN KEY (`sourceKey`) REFERENCES `UciSource`(`key`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `StaffSession` ADD CONSTRAINT `StaffSession_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `StaffAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `PasswordResetCode` ADD CONSTRAINT `PasswordResetCode_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `StaffAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
