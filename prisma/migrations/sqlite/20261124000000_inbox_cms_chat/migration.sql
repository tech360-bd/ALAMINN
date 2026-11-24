-- Additive stage tables: unified inbox, website CMS, persistent AI chat.
-- No existing table is modified, dropped or truncated.
CREATE TABLE "InboxContact" (
 "id" TEXT NOT NULL PRIMARY KEY, "displayName" TEXT NOT NULL,
 "email" TEXT, "phone" TEXT, "externalRef" TEXT UNIQUE, "avatarUrl" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "InboxContact_email_idx" ON "InboxContact"("email");
CREATE INDEX "InboxContact_phone_idx" ON "InboxContact"("phone");

CREATE TABLE "InboxConversation" (
 "id" TEXT NOT NULL PRIMARY KEY, "channel" TEXT NOT NULL, "accountId" TEXT NOT NULL,
 "externalThreadId" TEXT NOT NULL, "contactId" TEXT, "subject" TEXT,
 "status" TEXT NOT NULL DEFAULT 'unread', "priority" TEXT NOT NULL DEFAULT 'normal',
 "assignedUserId" TEXT, "unreadCount" INTEGER NOT NULL DEFAULT 0,
 "tags" TEXT NOT NULL DEFAULT '[]', "lastMessageAt" DATETIME NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 UNIQUE ("channel", "accountId", "externalThreadId")
);
CREATE INDEX "InboxConversation_status_lastMessageAt_idx" ON "InboxConversation"("status", "lastMessageAt");
CREATE INDEX "InboxConversation_assignedUserId_idx" ON "InboxConversation"("assignedUserId");
CREATE INDEX "InboxConversation_contactId_idx" ON "InboxConversation"("contactId");

CREATE TABLE "InboxMessage" (
 "id" TEXT NOT NULL PRIMARY KEY, "conversationId" TEXT NOT NULL,
 "providerMessageId" TEXT, "idempotencyKey" TEXT UNIQUE,
 "direction" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'text',
 "body" TEXT NOT NULL DEFAULT '', "attachments" TEXT NOT NULL DEFAULT '[]',
 "senderType" TEXT NOT NULL DEFAULT 'contact',
 "deliveryStatus" TEXT NOT NULL DEFAULT 'received', "error" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InboxMessage_conversationId_createdAt_idx" ON "InboxMessage"("conversationId", "createdAt");
CREATE INDEX "InboxMessage_deliveryStatus_idx" ON "InboxMessage"("deliveryStatus");

CREATE TABLE "InboxAudit" (
 "id" TEXT NOT NULL PRIMARY KEY, "conversationId" TEXT, "action" TEXT NOT NULL,
 "actorId" TEXT, "meta" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InboxAudit_conversationId_createdAt_idx" ON "InboxAudit"("conversationId", "createdAt");

CREATE TABLE "CmsEntry" (
 "id" TEXT NOT NULL PRIMARY KEY, "slug" TEXT NOT NULL UNIQUE,
 "type" TEXT NOT NULL DEFAULT 'page', "title" TEXT NOT NULL,
 "summary" TEXT NOT NULL DEFAULT '', "body" TEXT NOT NULL DEFAULT '',
 "category" TEXT NOT NULL DEFAULT '', "tags" TEXT NOT NULL DEFAULT '[]',
 "seoTitle" TEXT, "seoDescription" TEXT, "status" TEXT NOT NULL DEFAULT 'draft',
 "authorId" TEXT, "reviewerId" TEXT, "publishedAt" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "CmsEntry_status_type_idx" ON "CmsEntry"("status", "type");
CREATE INDEX "CmsEntry_category_idx" ON "CmsEntry"("category");

CREATE TABLE "CmsRevision" (
 "id" TEXT NOT NULL PRIMARY KEY, "entryId" TEXT NOT NULL, "revisionNumber" INTEGER NOT NULL,
 "title" TEXT NOT NULL, "summary" TEXT NOT NULL DEFAULT '', "body" TEXT NOT NULL DEFAULT '',
 "seoTitle" TEXT, "seoDescription" TEXT, "status" TEXT NOT NULL,
 "authorId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("entryId", "revisionNumber")
);
CREATE INDEX "CmsRevision_entryId_createdAt_idx" ON "CmsRevision"("entryId", "createdAt");

CREATE TABLE "AiChatConversation" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
 "title" TEXT NOT NULL DEFAULT 'New conversation', "provider" TEXT NOT NULL DEFAULT 'auto',
 "model" TEXT NOT NULL DEFAULT '', "archived" INTEGER NOT NULL DEFAULT 0,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "AiChatConversation_userId_updatedAt_idx" ON "AiChatConversation"("userId", "updatedAt");

CREATE TABLE "AiChatMessage" (
 "id" TEXT NOT NULL PRIMARY KEY, "conversationId" TEXT NOT NULL,
 "role" TEXT NOT NULL, "content" TEXT NOT NULL, "provider" TEXT, "model" TEXT,
 "error" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AiChatMessage_conversationId_createdAt_idx" ON "AiChatMessage"("conversationId", "createdAt");

CREATE TABLE "InboxAttachment" (
 "id" TEXT NOT NULL PRIMARY KEY, "conversationId" TEXT NOT NULL,
 "filename" TEXT NOT NULL, "storageKey" TEXT NOT NULL UNIQUE,
 "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InboxAttachment_conversationId_createdAt_idx" ON "InboxAttachment"("conversationId", "createdAt");
