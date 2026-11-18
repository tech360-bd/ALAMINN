import type { NextRequest } from "next/server";
import { kitAction, kitOk, kitError } from "@/lib/kits/api";
import { checkAdminRateLimit } from "@/lib/admin-api-server";
import { generateSchema } from "@/lib/kits/contracts";
import { generateKit, AiUnavailableError } from "@/lib/kits/ai";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: NextRequest) { return kitAction(req, "ai_tasks.create", generateSchema, async (data, session) => { if (!checkAdminRateLimit(`ai-kit:${session.userId}`, 10).allowed) return kitError("AI limit reached. Try again in a minute.", 429); try { return kitOk(await generateKit(data, session), "Draft generated. Review before using."); } catch (e) { if (e instanceof AiUnavailableError) return kitError(e.message, 503); return kitError("AI generation failed or returned an invalid format. Your document has not been changed. Please retry.", 502); } }); }
