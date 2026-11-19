import { NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  try {
    const release = await readFile(join(process.cwd(), "RELEASE-INFO"), "utf8");
    const id = /^release_id=([a-zA-Z0-9-]{1,100})$/m.exec(release)?.[1];
    if (id) headers["x-alaminn-release"] = id;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return NextResponse.json({ ready: false }, { status: 503, headers });
    }
  }

  const testKey = process.env.ALAMINN_TEST_INSTANCE;
  const presented = Buffer.from(req.headers.get("x-alaminn-test-instance") ?? "");
  const expected = Buffer.from(testKey ?? "");
  if (process.env.NODE_ENV !== "production" && expected.length >= 32 && presented.length === expected.length && timingSafeEqual(presented, expected) &&
      /^file:.*\/alaminn-test-[^/]+\/test\.sqlite$/.test(process.env.DATABASE_URL ?? "")) {
    headers["x-alaminn-test-instance"] = "verified";
  }
  try {
    await Promise.all([
      db.inquiry.findFirst({ select: { id: true } }),
      db.staffSession.findFirst({ select: { id: true } }),
      db.uciRequirementRecord.findFirst({ select: { version: true } }),
      db.message.findFirst({ select: { id: true } }),
    ]);
    return NextResponse.json({ ready: true }, { headers });
  } catch {
    return NextResponse.json({ ready: false }, { status: 503, headers });
  }
}

/** Release-only write probe: verify persistence and rollback without keeping test rows. */
export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const key = Buffer.from(process.env.CRON_SECRET ?? "");
  const presented = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.concat([Buffer.from("Bearer "), key]);
  if (key.length < 32 || presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return NextResponse.json({ ready: false }, { status: 401, headers });
  }
  const id = `release-probe-${randomUUID()}`;
  const rollback = new Error("release probe rollback");
  try {
    try {
      await db.$transaction(async (tx) => {
        await tx.staffAccount.create({ data: { id, email: `${id}@example.invalid`, name: "Release readiness", passwordHash: "disabled", isActive: false } });
        await tx.staffSession.create({ data: { accountId: id, tokenHash: id, expiresAt: new Date(0) } });
        if (await tx.staffSession.count({ where: { accountId: id } }) !== 1) throw new Error("write not readable");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    if (await db.staffAccount.count({ where: { id } }) !== 0) throw new Error("rollback failed");
    return NextResponse.json({ ready: true }, { headers });
  } catch {
    return NextResponse.json({ ready: false }, { status: 503, headers });
  }
}
