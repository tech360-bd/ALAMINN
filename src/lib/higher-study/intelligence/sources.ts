/**
 * Documented source registry for the university & course intelligence
 * system (module spec §1, §3). All configured sources are documented here
 * and seeded into HigherStudySourceOrg.
 *
 * Source levels:
 *  - L1_OFFICIAL  : official university / government pages (verification authority)
 *  - L2_DISCOVERY : education platform discovery sources (ApplyBoard Assist,
 *                   Edvoy, AHZ Associates, IDP Education, MARGE)
 *  - L3_CREDIBLE  : government education bodies, recognised research databases,
 *                   credible public academic directories
 *
 * Level 2 sources are used to DISCOVER universities, programmes and
 * advertised requirements; nothing is displayed as officially confirmed
 * until a Level 1 source verifies it. MARGE's exact source URL is still to
 * be confirmed, so it is registered with baseUrl null (unknown) and
 * permissionState "unknown" — collection from it stays disabled until the
 * URL and permissions are confirmed by a human.
 */
import type { SourceLevel } from "./statuses";

export interface SourceOrgDefinition {
  key: string;
  name: string;
  level: SourceLevel;
  baseUrl: string | null;
  docsUrl: string | null;
  permissionNote: string;
  apiAvailable: boolean;
  /** Collection allowed by default? Only public, permission-checked pages are ever fetched. */
  collectable: boolean;
}

export const SOURCE_ORG_DEFINITIONS: readonly SourceOrgDefinition[] = [
  {
    key: "official-university",
    name: "Official university websites (course catalogues, admissions, fees, scholarships, English-language and research pages)",
    level: "L1_OFFICIAL",
    baseUrl: null, // per-university official domains — resolved per record
    docsUrl: null,
    permissionNote:
      "Official university pages. Used to verify facts discovered via Level 2 platforms. robots.txt respected per domain before every fetch.",
    apiAvailable: false,
    collectable: true,
  },
  {
    key: "applyboard-assist",
    name: "ApplyBoard Assist",
    level: "L2_DISCOVERY",
    baseUrl: "https://www.applyboard.com",
    docsUrl: null,
    permissionNote:
      "Education platform used for DISCOVERY of universities, programmes and advertised entry requirements only. Not a verification authority. Public pages only, robots.txt and terms respected; nothing is copied — only factual data points recorded with source attribution. Not affiliated with or endorsed by ApplyBoard.",
    apiAvailable: false,
    collectable: false,
  },
  {
    key: "edvoy",
    name: "Edvoy",
    level: "L2_DISCOVERY",
    baseUrl: "https://edvoy.com",
    docsUrl: null,
    permissionNote:
      "Education platform used for DISCOVERY only. Not a verification authority. Public pages only, robots.txt and terms respected; factual data points recorded with attribution. Not affiliated with or endorsed by Edvoy.",
    apiAvailable: false,
    collectable: false,
  },
  {
    key: "ahz-associates",
    name: "AHZ Associates",
    level: "L2_DISCOVERY",
    baseUrl: "https://www.ahzassociates.com",
    docsUrl: null,
    permissionNote:
      "Education consultancy used for DISCOVERY only. Not a verification authority. Public pages only, robots.txt and terms respected; factual data points recorded with attribution. Not affiliated with or endorsed by AHZ Associates.",
    apiAvailable: false,
    collectable: false,
  },
  {
    key: "idp-education",
    name: "IDP Education",
    level: "L2_DISCOVERY",
    baseUrl: "https://www.idp.com",
    docsUrl: null,
    permissionNote:
      "Education platform used for DISCOVERY only. Not a verification authority. Public pages only, robots.txt and terms respected; factual data points recorded with attribution. Not affiliated with or endorsed by IDP Education.",
    apiAvailable: false,
    collectable: false,
  },
  {
    key: "marge",
    name: "MARGE (exact source URL to be confirmed)",
    level: "L2_DISCOVERY",
    baseUrl: null, // TBD — confirmed by an operator before any collection runs
    docsUrl: null,
    permissionNote:
      "Registered per module spec with the exact source URL still to be confirmed. Collection stays DISABLED (collectable=false) until a human confirms the URL and its robots/terms; the review task 'confirm-marge-source-url' tracks this.",
    apiAvailable: false,
    collectable: false,
  },
  {
    key: "government",
    name: "Official government education sources (UK UCAS/HESA equivalents, ministries, immigration bodies)",
    level: "L3_CREDIBLE",
    baseUrl: null,
    docsUrl: null,
    permissionNote:
      "Government and public-body pages used for policy context. robots.txt respected; public pages only.",
    apiAvailable: false,
    collectable: true,
  },
  {
    key: "research-db",
    name: "Recognised research databases and public academic directories",
    level: "L3_CREDIBLE",
    baseUrl: null,
    docsUrl: null,
    permissionNote:
      "Recognised research databases (e.g. university research portals) used for research-group and supervisor context. Public pages only, robots.txt respected.",
    apiAvailable: false,
    collectable: true,
  },
];

export const MARGE_REVIEW_TASK = {
  type: "verify-discovery",
  refType: "source-org",
  refId: "marge",
  title: "Confirm MARGE source URL and permissions",
  detail:
    "MARGE is registered with an unknown source URL. Confirm the exact public URL, check robots.txt/terms, then set baseUrl + permissionState on the source registry before enabling collection.",
  priority: "MEDIUM",
} as const;

/**
 * Resolve the source level for a URL given the registry: if the hostname
 * belongs to a registered L2 platform, that level applies; otherwise an
 * official university domain (the university's own officialSourceUrl) is
 * L1 by definition. Unregistered URLs fall back to unknown → the caller
 * must flag SOURCE_CHECK_REQUIRED.
 */
export function resolveSourceLevel(
  url: string,
  officialHostnames: readonly string[]
): { level: SourceLevel; orgKey: string | null } {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { level: "L3_CREDIBLE", orgKey: null }; // unparseable → treated as untrusted
  }
  for (const def of SOURCE_ORG_DEFINITIONS) {
    if (!def.baseUrl) continue;
    try {
      if (new URL(def.baseUrl).hostname.toLowerCase() === host) {
        return { level: def.level, orgKey: def.key };
      }
    } catch {
      continue;
    }
  }
  if (officialHostnames.some((h) => h.toLowerCase() === host)) {
    return { level: "L1_OFFICIAL", orgKey: "official-university" };
  }
  return { level: "L3_CREDIBLE", orgKey: null };
}
