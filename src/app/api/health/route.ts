import { NextResponse } from "next/server";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await one("SELECT 1");
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
