/**
 * /admin/sms — SMS failover gateway workspace.
 * Configure providers on /admin/integrations; send consent-based SMS here.
 */
import type { Metadata } from "next";
import SmsKit from "@/components/admin/kits/sms";

export const metadata: Metadata = {
  title: "SMS Failover Gateway",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SmsKit />;
}
