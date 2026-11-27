-- Add revocable executive sessions. Existing JWTs intentionally require login again.
CREATE TABLE "AdminSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AdminSession_userId_idx" ON "AdminSession"("userId");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
