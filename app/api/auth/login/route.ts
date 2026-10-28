import { NextResponse } from "next/server";
import { body, HttpError, route } from "@/lib/api";
import { COOKIE, cookieOptions, signSession } from "@/lib/session";
import { checkPassword, countUsers, createUser, findUserByEmail, touchLastLogin, usersTableId, validatePassword } from "@/lib/users";

export const dynamic = "force-dynamic";

// naive in-memory rate limit: 10 attempts / 15 min per IP+email
const attempts = new Map<string, { n: number; at: number }>();
function limited(key: string) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.at > 15 * 60_000) {
    attempts.set(key, { n: 1, at: now });
    return false;
  }
  a.n += 1;
  return a.n > 10;
}

export const POST = route(async (req) => {
  const { email, password } = await body<{ email?: string; password?: string }>(req);
  const e = String(email || "").toLowerCase().trim();
  const p = String(password || "");
  if (!e || !p) throw new HttpError(400, "Email and password are required");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(`${ip}|${e}`)) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");

  // First run: create the Portal Users table and the first admin from env vars
  const bootEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").toLowerCase().trim();
  const bootPass = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  if (bootEmail && bootPass && e === bootEmail && p === bootPass) {
    await usersTableId(true);
    if ((await countUsers()) === 0) {
      const err = validatePassword(bootPass);
      if (err) throw new HttpError(400, `BOOTSTRAP_ADMIN_PASSWORD: ${err}`);
      await createUser({ email: bootEmail, name: process.env.BOOTSTRAP_ADMIN_NAME || "Portal Admin", role: "Admin", password: bootPass });
    }
  }

  const u = await findUserByEmail(e);
  if (!u || !u.Active || !(await checkPassword(u, p))) throw new HttpError(401, "Invalid email or password");

  attempts.delete(`${ip}|${e}`);
  await touchLastLogin(u.Id);
  const token = await signSession({ uid: u.Id, email: u.Email, name: u["Full Name"] || u.Email, role: u.Role === "Admin" ? "Admin" : "Staff" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, cookieOptions());
  return res;
});
