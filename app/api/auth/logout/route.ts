import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/session";
export const dynamic = "force-dynamic";
export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
