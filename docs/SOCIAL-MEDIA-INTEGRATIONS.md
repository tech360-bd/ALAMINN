# SOCIAL MEDIA INTEGRATIONS — STATUS & DESIGN

Status 2026-09-30. Honest capability matrix — **profile links ≠ publishing automation**.

## 1. What exists today (verified)

| Capability | State |
|---|---|
| Profile links (Facebook verified hub, WhatsApp verified number) | ✅ Live — `src/lib/site-data.ts` (`SOCIAL_LINKS`, `WHATSAPP_NUMBER`) |
| UTM-tagged social sharing | ✅ `src/lib/utm.ts` (10 unit tests) |
| WhatsApp Cloud API adapter (send/webhook/status/AI agent/leads) | ✅ Code complete; needs Meta credentials to go live |
| Other platforms (LinkedIn, Instagram, X, YouTube, TikTok, Pinterest) | ➖ Route through the verified Facebook hub **by design** so no visitor hits a dead link |
| Drafting/scheduling/publishing to social platforms | ❌ Not implemented |
| Publishing status/analytics aggregation | ❌ Not implemented |

## 2. Required before publishing can be built

Per platform, the owner must supply (these are **hard blockers** — no code can substitute):

| Platform | Prerequisite |
|---|---|
| Facebook Pages + Instagram | Meta Developer app + Page access token + `pages_manage_posts` etc. (App Review) |
| LinkedIn | Developer app + `w_member_social`/organization posting token |
| YouTube | Google Cloud project + OAuth (upload scope) |
| X | Developer account + API keys (paid tier for write) |
| TikTok | Developer app + Content Posting API approval |
| Pinterest | Developer app + `pins:write` token |
| Telegram | Bot token from @BotFather + approved admin chat IDs (see TELEGRAM-INTEGRATION.md) |

## 3. Designed workflow (to implement when credentials arrive)

```
AI draft → Editor review → Approval (AiApproval gate) → Schedule
        → Publish (platform API) → Verify platform response
        → Record result (SocialPost model) → Collect analytics
```

Non-negotiable rules:
1. **Never report a post as published without the platform API confirming it** (store the platform post ID + response payload).
2. Every publish attempt is audit-logged; failures are retried with backoff, max N attempts, then flagged for manual action.
3. Token expiry monitored → reconnection alerts in the admin dashboard.
4. A manual publishing path (copy-to-clipboard with pre-filled composer links) ships FIRST for any platform whose API approval is pending — documented, honest fallback.

## 4. Suggested data model (future PR, schema addition only — non-destructive)

`SocialAccount` (platform, token ref, expiry, status) · `SocialPost` (platform, contentRef, scheduleAt, status: draft/approval/scheduled/publishing/published/failed, platformPostId, error) · `SocialAnalytics` (postId, impressions, engagements, fetchedAt).
