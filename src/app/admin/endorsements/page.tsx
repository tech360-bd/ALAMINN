"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Info,
  Linkedin,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, ErrorState } from "@/components/admin/page-primitives";
import { adminFetch } from "@/components/admin/lib";
import type { LinkedInEndorsement } from "@/lib/endorsements";

type Payload = {
  profileUrl: string;
  items: LinkedInEndorsement[];
};

const EMPTY_ITEM: LinkedInEndorsement = {
  id: "",
  quote: "",
  name: "",
  role: "",
  organization: "",
  linkedinUrl: "",
  date: "",
  consented: false,
};

function newItem(): LinkedInEndorsement {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `e_${Date.now().toString(36)}`;
  return { ...EMPTY_ITEM, id };
}

/**
 * Admin editor for LinkedIn recommendations.
 *
 * LinkedIn offers no public API or embeddable recommendations widget, so
 * there is no scraping here. The owner copies a recommendation from
 * LinkedIn, records the author's consent, and the public homepage renders
 * ONLY consented entries — never demo or generated testimonials.
 */
export default function AdminEndorsementsPage() {
  const [profileUrl, setProfileUrl] = useState("");
  const [items, setItems] = useState<LinkedInEndorsement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<Payload>("/api/v1/admin/endorsements");
      setProfileUrl(res.data.profileUrl ?? "");
      setItems(res.data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load endorsements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(index: number, patch: Partial<LinkedInEndorsement>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  function remove(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await adminFetch<Payload>("/api/v1/admin/endorsements", {
        method: "PUT",
        body: JSON.stringify({ profileUrl, items }),
      });
      setProfileUrl(res.data.profileUrl ?? "");
      setItems(res.data.items ?? []);
      toast.success("Endorsements saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const published = items.filter((i) => i.consented).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="LinkedIn endorsements"
        subtitle="Real recommendations only — pasted from LinkedIn with the author's consent."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/#recommendations" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                View public section
              </Link>
            </Button>
            <Button onClick={save} disabled={saving || loading}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save changes
            </Button>
          </>
        }
      />

      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20">
        <CardContent className="flex gap-3 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="space-y-1 text-muted-foreground">
            <p className="font-medium text-foreground">
              Why paste instead of import?
            </p>
            <p>
              LinkedIn does not provide a public API or embeddable widget for
              recommendations, and scraping it would breach its terms. Copy the
              recommendation text from{" "}
              <span className="font-medium text-foreground">
                LinkedIn → Me → Recommendations
              </span>
              , add the author and date, and switch on consent once the author
              has agreed to be quoted. Unconsented drafts never appear on the
              public site.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && <ErrorState message={error} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LinkedIn profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="linkedin-profile-url">Public profile URL</Label>
          <Input
            id="linkedin-profile-url"
            type="url"
            inputMode="url"
            placeholder="https://www.linkedin.com/in/al-aminn"
            value={profileUrl}
            onChange={(e) => setProfileUrl(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Used for the “See all on LinkedIn” link and the fallback panel shown
            when no recommendations are published yet. Must be a linkedin.com
            https:// URL.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recommendations</h2>
          <p className="text-sm text-muted-foreground">
            {items.length} total · {published} published on the homepage
          </p>
        </div>
        <Button variant="outline" onClick={() => setItems((c) => [newItem(), ...c])}>
          <Plus className="mr-2 h-4 w-4" />
          Add recommendation
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0A66C2]/10 text-[#0A66C2]">
              <Linkedin className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium">No recommendations yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Add a real recommendation from LinkedIn. Until one is added and
              consented, the homepage shows a link to your LinkedIn profile (if
              the URL above is set) — never placeholder quotes.
            </p>
            <Button onClick={() => setItems([newItem()])}>
              <Plus className="mr-2 h-4 w-4" />
              Add the first recommendation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <Card key={item.id || index}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <CardTitle className="text-base">
                  {item.name.trim() || "New recommendation"}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove recommendation"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`quote-${item.id}`}>Recommendation text</Label>
                  <Textarea
                    id={`quote-${item.id}`}
                    rows={5}
                    maxLength={1200}
                    placeholder="Paste the recommendation exactly as it appears on LinkedIn…"
                    value={item.quote}
                    onChange={(e) => update(index, { quote: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {item.quote.trim().length} / 1200 characters · reproduced as
                    written, never reworded.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`name-${item.id}`}>Author name</Label>
                  <Input
                    id={`name-${item.id}`}
                    value={item.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                    placeholder="e.g. Ayesha Rahman"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`role-${item.id}`}>Role / headline</Label>
                  <Input
                    id={`role-${item.id}`}
                    value={item.role}
                    onChange={(e) => update(index, { role: e.target.value })}
                    placeholder="e.g. Director, International Partnerships"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`org-${item.id}`}>Organization</Label>
                  <Input
                    id={`org-${item.id}`}
                    value={item.organization}
                    onChange={(e) => update(index, { organization: e.target.value })}
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`date-${item.id}`}>Date</Label>
                  <Input
                    id={`date-${item.id}`}
                    value={item.date}
                    onChange={(e) => update(index, { date: e.target.value })}
                    placeholder="YYYY or YYYY-MM or YYYY-MM-DD"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`url-${item.id}`}>LinkedIn URL</Label>
                  <Input
                    id={`url-${item.id}`}
                    type="url"
                    inputMode="url"
                    value={item.linkedinUrl}
                    onChange={(e) => update(index, { linkedinUrl: e.target.value })}
                    placeholder="https://www.linkedin.com/in/…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Link to the recommendation or the author&apos;s profile.
                    Falls back to the profile URL above.
                  </p>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg border p-3 md:col-span-2">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-medium">Author consented</p>
                      <p className="text-xs text-muted-foreground">
                        Only switch this on once the author has agreed to have
                        their name and recommendation published on alaminn.info.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={item.consented}
                    onCheckedChange={(checked) => update(index, { consented: checked })}
                    aria-label="Author consented to publication"
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
