import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { retryPending } from "@/lib/invoicing";

export const dynamic = "force-dynamic";

/** Call every 5–10 minutes from a scheduler with header `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await retryPending();
  return NextResponse.json({ processed: Object.keys(results).length, results });
}
