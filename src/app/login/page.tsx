"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap, Loader2, LogIn, KeyRound } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // password reset state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetStage, setResetStage] = useState<"request" | "confirm">("request");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetErr, setResetErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const requestReset = async () => {
    setResetErr("");
    setResetMsg("");
    const res = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "request", email: resetEmail.trim().toLowerCase() }),
    });
    const data = await res.json();
    if (!res.ok) { setResetErr(data.error ?? "Request failed"); return; }
    if (data.code) {
      setResetMsg(`No mail transport is configured in this deployment, so the code is returned here for this request only: ${data.code}`);
    } else {
      setResetMsg(data.message ?? "Code issued.");
    }
    setResetStage("confirm");
  };

  const confirmReset = async () => {
    setResetErr("");
    const res = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", email: resetEmail.trim().toLowerCase(), code: resetCode.trim(), newPassword }),
    });
    const data = await res.json();
    if (!res.ok) { setResetErr(data.error ?? "Reset failed"); return; }
    setResetMsg("Password updated and all sessions revoked. You can sign in now.");
    setResetStage("request");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-[#FFF3EA] px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#E8501A" }}>
            <GraduationCap className="h-6 w-6 text-white" aria-hidden />
          </div>
          <h1 className="text-lg font-bold">ALO Education — Staff Sign In</h1>
          <p className="text-xs text-muted-foreground">University & Course Intelligence · Agent Console · Admin</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><LogIn className="h-4 w-4" style={{ color: "#0066CC" }} /> Sign in</CardTitle>
            <CardDescription className="text-xs">
              {process.env.NEXT_PUBLIC_HAS_ACCOUNTS === "false"
                ? "No accounts exist yet — the first registration becomes the ADMIN."
                : "Use your staff account. Sessions are revocable and audit-logged."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full text-white" style={{ backgroundColor: "#E8501A" }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </form>
            <button
              type="button"
              onClick={() => { setResetOpen(!resetOpen); setResetMsg(""); setResetErr(""); }}
              className="mt-3 text-xs underline flex items-center gap-1"
              style={{ color: "#0066CC" }}
            >
              <KeyRound className="h-3 w-3" aria-hidden /> Forgot password?
            </button>
          </CardContent>
        </Card>

        {resetOpen && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Password reset (single-use 6-digit code, 15 min)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="reset-email">Account email</Label>
                <Input id="reset-email" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
              </div>
              {resetStage === "request" ? (
                <Button type="button" variant="outline" className="w-full" onClick={requestReset}>Send reset code</Button>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="reset-code">6-digit code</Label>
                    <Input id="reset-code" inputMode="numeric" maxLength={6} value={resetCode} onChange={(e) => setResetCode(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-password">New password (min 10 chars)</Label>
                    <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  </div>
                  <Button type="button" className="w-full text-white" style={{ backgroundColor: "#0066CC" }} onClick={confirmReset}>Set new password</Button>
                </>
              )}
              {resetMsg && <p className="text-xs text-emerald-700 whitespace-pre-wrap">{resetMsg}</p>}
              {resetErr && <p className="text-xs text-red-600" role="alert">{resetErr}</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
