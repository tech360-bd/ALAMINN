/**
 * LinkedIn endorsements — database access (server only).
 * -----------------------------------------------
 * Stored as JSON in the existing Setting table so no schema migration is
 * needed and the data is backed up with the rest of the configuration.
 *
 *   endorsements.linkedin → {"version":1,"items":[…]}   (all drafts)
 *   social.linkedin_url   → https://www.linkedin.com/in/…
 *
 * The public loader returns ONLY consented items (see publicEndorsements).
 */
import { db } from "@/lib/db";
import {
  ENDORSEMENTS_SETTING_KEY,
  LINKEDIN_PROFILE_SETTING_KEY,
  normalizeProfileUrl,
  parseStoredEndorsements,
  publicEndorsements,
  serializeEndorsements,
  type EndorsementsPayload,
  type LinkedInEndorsement,
} from "@/lib/endorsements";

function envProfileUrl(): string {
  return normalizeProfileUrl(process.env.NEXT_PUBLIC_LINKEDIN_URL ?? "");
}

async function readSettings(): Promise<{ items: LinkedInEndorsement[]; profileUrl: string }> {
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: [ENDORSEMENTS_SETTING_KEY, LINKEDIN_PROFILE_SETTING_KEY] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      items: parseStoredEndorsements(map.get(ENDORSEMENTS_SETTING_KEY)),
      profileUrl:
        normalizeProfileUrl(map.get(LINKEDIN_PROFILE_SETTING_KEY)) || envProfileUrl(),
    };
  } catch (err) {
    // A missing Setting table or a transient DB error must never break the
    // homepage — the section simply renders nothing.
    console.error("[endorsements] read failed:", err);
    return { items: [], profileUrl: envProfileUrl() };
  }
}

/**
 * Public payload: consented recommendations only, capped and sorted.
 * `profileUrl` is "" when no valid LinkedIn URL is configured.
 */
export async function getPublicEndorsements(): Promise<EndorsementsPayload> {
  const { items, profileUrl } = await readSettings();
  return { items: publicEndorsements(items), profileUrl };
}

/** Admin payload: every draft (consented flag tells the editor what publishes). */
export async function getAdminEndorsements(): Promise<EndorsementsPayload> {
  return readSettings();
}

/** Persist the full list + profile URL in one transaction. */
export async function saveEndorsements(payload: EndorsementsPayload): Promise<void> {
  const profileUrl = normalizeProfileUrl(payload.profileUrl);
  const items = payload.items.slice(0, 24);
  await db.$transaction([
    db.setting.upsert({
      where: { key: ENDORSEMENTS_SETTING_KEY },
      update: { value: serializeEndorsements(items) },
      create: { key: ENDORSEMENTS_SETTING_KEY, value: serializeEndorsements(items) },
    }),
    db.setting.upsert({
      where: { key: LINKEDIN_PROFILE_SETTING_KEY },
      update: { value: profileUrl },
      create: { key: LINKEDIN_PROFILE_SETTING_KEY, value: profileUrl },
    }),
  ]);
}
