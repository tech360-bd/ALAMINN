/**
 * RBAC — role/permission matrix shared by middleware and API routes.
 * Roles: ADMIN | EDITOR | AGENT | VIEWER. No role is tied to any person or
 * tenant identity; accounts live in StaffAccount.
 */
export const STAFF_ROLES = ["ADMIN", "EDITOR", "AGENT", "VIEWER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type Permission =
  | "users.manage"
  | "settings.write"
  | "uci.verify" // verification queue actions on requirement records
  | "uci.edit" // create/update institutions, programmes, sources
  | "import.run"
  | "export.run"
  | "umc.use" // agent console / messaging channel usage
  | "umc.admin" // tenant settings, bans, suppressions, moderation words
  | "reports.view"
  | "audit.view";

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  ADMIN: [
    "users.manage", "settings.write", "uci.verify", "uci.edit",
    "import.run", "export.run", "umc.use", "umc.admin", "reports.view", "audit.view",
  ],
  EDITOR: ["uci.verify", "uci.edit", "import.run", "export.run", "reports.view", "audit.view"],
  AGENT: ["umc.use"],
  VIEWER: ["reports.view"],
};

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function can(role: string, permission: Permission): boolean {
  if (!isStaffRole(role)) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Coarse per-path role gate used by middleware (edge-safe). */
export const PATH_ROLE_GATE: { prefix: string; roles: StaffRole[] }[] = [
  { prefix: "/admin/uci", roles: ["ADMIN", "EDITOR"] },
  { prefix: "/api/uci/admin", roles: ["ADMIN", "EDITOR"] },
  { prefix: "/api/staff", roles: ["ADMIN"] },
  { prefix: "/api/settings", roles: ["ADMIN", "EDITOR", "AGENT", "VIEWER"] },
  { prefix: "/console", roles: ["ADMIN", "AGENT"] },
  { prefix: "/api/umc", roles: ["ADMIN", "AGENT"] },
  { prefix: "/reports", roles: ["ADMIN", "EDITOR", "VIEWER"] },
  { prefix: "/dashboard", roles: ["ADMIN", "EDITOR", "AGENT", "VIEWER"] },
];

export function rolesForPath(pathname: string): StaffRole[] | null {
  const hit = PATH_ROLE_GATE.find(
    (g) => pathname === g.prefix || pathname.startsWith(g.prefix + "/") || pathname.startsWith(g.prefix + "?"),
  );
  return hit ? hit.roles : null;
}
