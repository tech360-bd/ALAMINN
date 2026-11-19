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
  await db.$transaction(async (tx) => {
    if (await tx.staffAccount.count()) throw new Error("Staff already provisioned");
    await tx.staffAccount.create({ data: { id: BOOTSTRAP_ID, email, name, passwordHash, role: "ADMIN" } });
    await tx.uciAuditLog.create({ data: { actor: "operator", action: "auth.bootstrap_admin", entity: "StaffAccount", entityId: BOOTSTRAP_ID } });
  });
  console.log("Initial staff administrator provisioned.");
}

main().catch(() => {
  console.error("Staff bootstrap refused: check provisioning state, database connectivity and bootstrap configuration.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
