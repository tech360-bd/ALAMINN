import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";

export default async function UciStaffLayout({ children }: { children: ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/admin/uci");
  if (!can(session.role, "uci.verify")) redirect("/dashboard?denied=/admin/uci");
  return children;
}
