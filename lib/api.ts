import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession, type SessionUser } from "./session";
import { getUserCached } from "./users";
import { NocoError } from "./nocodb";
import type { Role } from "./modules";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(req: NextRequest, role?: Role): Promise<SessionUser> {
  const s = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!s) throw new HttpError(401, "Not signed in");
  const u = await getUserCached(s.uid);
  if (!u || !u.Active) throw new HttpError(401, "User is inactive");
  const current: SessionUser = { ...s, role: u.Role === "Admin" ? "Admin" : "Staff", name: u["Full Name"] || s.name };
  if (role && current.role !== role) throw new HttpError(403, "Not allowed");
  return current;
}

type Ctx<P> = { params: Promise<P> };

export function route<P = Record<string, string>>(
  fn: (req: NextRequest, params: P) => Promise<unknown>
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const params = (ctx?.params ? await ctx.params : ({} as P)) as P;
      const out = await fn(req, params);
      if (out instanceof NextResponse) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e: any) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof NocoError) {
        console.error("[nocodb]", e.message);
        let msg = "NocoDB request failed";
        try {
          const j = JSON.parse(e.body);
          msg = j.msg || j.message || j.error || msg;
        } catch {
          /* ignore */
        }
        return NextResponse.json({ error: `NocoDB: ${msg}` }, { status: e.status >= 500 ? 502 : 400 });
      }
      console.error("[api]", e);
      return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
    }
  };
}

export async function body<T = any>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
