/**
 * /admin/email — Email failover gateway workspace.
 * Configure providers on /admin/integrations; send consent-based email here.
 */
import type { Metadata } from "next";
import EmailKit from "@/components/admin/kits/email";

export const metadata: Metadata = {
  title: "Email Failover Gateway",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <EmailKit />;
}
