import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "./modules";

export const COOKIE = "csj_session";

export interface SessionUser {
  uid: number;
  email: string;
  name: string;
  role: Role;
}

function secret() {
  const s = process.env.SESSION_SECRET || "";
  if (s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters)");
  return new TextEncoder().encode(s);
}

export function sessionHours() {
  const h = Number(process.env.SESSION_HOURS || 12);
  return Number.isFinite(h) && h > 0 ? h : 12;
}

export async function signSession(u: SessionUser): Promise<string> {
  return new SignJWT({ email: u.email, name: u.name, role: u.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(u.uid))
    .setIssuedAt()
    .setExpirationTime(`${sessionHours()}h`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return {
      uid: Number(payload.sub),
      email: String(payload.email),
      name: String(payload.name || ""),
      role: payload.role === "Admin" ? "Admin" : "Staff",
    };
  } catch {
    return null;
  }
}

/** For server components / layouts. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE)?.value);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: sessionHours() * 3600,
  };
}
