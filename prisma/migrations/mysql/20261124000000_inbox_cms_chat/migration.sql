-- Additive stage tables: unified inbox, website CMS, persistent AI chat.
-- Reviewed before any production use; no existing table is modified or dropped.
CREATE TABLE `InboxContact` (
 `id` VARCHAR(191) NOT NULL, `displayName` VARCHAR(191) NOT NULL,
 `email` VARCHAR(191) NULL, `phone` VARCHAR(191) NULL, `externalRef` VARCHAR(191) NULL,
 `avatarUrl` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updatedAt` DATETIME(3) NOT NULL, PRIMARY KEY (`id`), UNIQUE KEY `InboxContact_externalRef_key` (`externalRef`),
 KEY `InboxContact_email_idx` (`email`), KEY `InboxContact_phone_idx` (`phone`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InboxConversation` (
 `id` VARCHAR(191) NOT NULL, `channel` VARCHAR(191) NOT NULL, `accountId` VARCHAR(191) NOT NULL,
 `externalThreadId` VARCHAR(191) NOT NULL, `contactId` VARCHAR(191) NULL, `subject` VARCHAR(191) NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'unread', `priority` VARCHAR(191) NOT NULL DEFAULT 'normal',
 `assignedUserId` VARCHAR(191) NULL, `unreadCount` INTEGER NOT NULL DEFAULT 0,
 `tags` TEXT NOT NULL, `lastMessageAt` DATETIME(3) NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `InboxConversation_channel_accountId_externalThreadId_key` (`channel`,`accountId`,`externalThreadId`),
 KEY `InboxConversation_status_lastMessageAt_idx` (`status`,`lastMessageAt`),
 KEY `InboxConversation_assignedUserId_idx` (`assignedUserId`), KEY `InboxConversation_contactId_idx` (`contactId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InboxMessage` (
 `id` VARCHAR(191) NOT NULL, `conversationId` VARCHAR(191) NOT NULL,
 `providerMessageId` VARCHAR(191) NULL, `idempotencyKey` VARCHAR(191) NULL,
 `direction` VARCHAR(191) NOT NULL, `kind` VARCHAR(191) NOT NULL DEFAULT 'text',
 `body` LONGTEXT NOT NULL, `attachments` TEXT NOT NULL,
 `senderType` VARCHAR(191) NOT NULL DEFAULT 'contact',
 `deliveryStatus` VARCHAR(191) NOT NULL DEFAULT 'received', `error` TEXT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), UNIQUE KEY `InboxMessage_idempotencyKey_key` (`idempotencyKey`),
 KEY `InboxMessage_conversationId_createdAt_idx` (`conversationId`,`createdAt`),
 KEY `InboxMessage_deliveryStatus_idx` (`deliveryStatus`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InboxAudit` (
 `id` VARCHAR(191) NOT NULL, `conversationId` VARCHAR(191) NULL, `action` VARCHAR(191) NOT NULL,
 `actorId` VARCHAR(191) NULL, `meta` TEXT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), KEY `InboxAudit_conversationId_createdAt_idx` (`conversationId`,`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CmsEntry` (
 `id` VARCHAR(191) NOT NULL, `slug` VARCHAR(191) NOT NULL, `type` VARCHAR(191) NOT NULL DEFAULT 'page',
 `title` VARCHAR(191) NOT NULL, `summary` TEXT NOT NULL, `body` LONGTEXT NOT NULL,
 `category` VARCHAR(191) NOT NULL DEFAULT '', `tags` TEXT NOT NULL,
 `seoTitle` VARCHAR(191) NULL, `seoDescription` TEXT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'draft', `authorId` VARCHAR(191) NULL,
 `reviewerId` VARCHAR(191) NULL, `publishedAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), UNIQUE KEY `CmsEntry_slug_key` (`slug`),
 KEY `CmsEntry_status_type_idx` (`status`,`type`), KEY `CmsEntry_category_idx` (`category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CmsRevision` (
 `id` VARCHAR(191) NOT NULL, `entryId` VARCHAR(191) NOT NULL, `revisionNumber` INTEGER NOT NULL,
 `title` VARCHAR(191) NOT NULL, `summary` TEXT NOT NULL, `body` LONGTEXT NOT NULL,
 `seoTitle` VARCHAR(191) NULL, `seoDescription` TEXT NULL, `status` VARCHAR(191) NOT NULL,
 `authorId` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), UNIQUE KEY `CmsRevision_entryId_revisionNumber_key` (`entryId`,`revisionNumber`),
 KEY `CmsRevision_entryId_createdAt_idx` (`entryId`,`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiChatConversation` (
 `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL,
 `title` VARCHAR(191) NOT NULL DEFAULT 'New conversation', `provider` VARCHAR(191) NOT NULL DEFAULT 'auto',
 `model` VARCHAR(191) NOT NULL DEFAULT '', `archived` BOOLEAN NOT NULL DEFAULT false,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), KEY `AiChatConversation_userId_updatedAt_idx` (`userId`,`updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiChatMessage` (
 `id` VARCHAR(191) NOT NULL, `conversationId` VARCHAR(191) NOT NULL,
 `role` VARCHAR(191) NOT NULL, `content` LONGTEXT NOT NULL,
 `provider` VARCHAR(191) NULL, `model` VARCHAR(191) NULL, `error` TEXT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), KEY `AiChatMessage_conversationId_createdAt_idx` (`conversationId`,`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InboxAttachment` (
 `id` VARCHAR(191) NOT NULL PRIMARY KEY, `conversationId` VARCHAR(191) NOT NULL,
 `filename` VARCHAR(191) NOT NULL, `storageKey` VARCHAR(191) NOT NULL UNIQUE,
 `mimeType` VARCHAR(191) NOT NULL, `size` INTEGER NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX `InboxAttachment_conversationId_createdAt_idx` ON `InboxAttachment`(`conversationId`, `createdAt`);
