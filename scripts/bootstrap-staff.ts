import { z } from "zod";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";

// Fixed primary key makes simultaneous bootstraps mutually exclusive even when
// they use different email addresses. This command is never invoked over HTTP.
const BOOTSTRAP_ID = "staff-bootstrap-admin";

async function main() {
  const email = z.email().max(191).parse(process.env.STAFF_BOOTSTRAP_EMAIL?.trim().toLowerCase());
  const password = z.string().min(14).max(200).parse(process.env.STAFF_BOOTSTRAP_PASSWORD);
  const name = z.string().min(2).max(100).parse(process.env.STAFF_BOOTSTRAP_NAME?.trim());
  const passwordHash = await hashPassword(password);
  // First statement is a conditional write, not a read transaction upgraded
  // to a writer. A fixed primary key arbitrates competing inserts on both DBs.
  for (let attempt = 0; ; attempt++) {
    try {
      await db.$transaction(async (tx) => {
        const inserted = await tx.$executeRaw`
          INSERT INTO StaffAccount (id, email, passwordHash, name, role, createdAt, updatedAt)
          SELECT ${BOOTSTRAP_ID}, ${email}, ${passwordHash}, ${name}, 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          WHERE NOT EXISTS (SELECT 1 FROM StaffAccount)
        `;
        if (inserted !== 1) throw new Error("Staff already provisioned");
        await tx.uciAuditLog.create({ data: { actor: "operator", action: "auth.bootstrap_admin", entity: "StaffAccount", entityId: BOOTSTRAP_ID } });
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const alreadyProvisioned = /Staff already provisioned/i.test(message);
      if (alreadyProvisioned) throw error;
      const transient = /database is locked|SQLITE_BUSY|SQLITE_LOCKED|SQLITE_BUSY_SNAPSHOT|deadlock|write conflict|cannot start a transaction/i.test(message);
      if (!transient || attempt >= 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  console.log("Initial staff administrator provisioned.");
}

main().catch(() => {
  console.error("Staff bootstrap refused: check provisioning state, database connectivity and bootstrap configuration.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
