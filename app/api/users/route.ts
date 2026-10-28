import { body, HttpError, requireUser, route } from "@/lib/api";
import { createUser, listUsers, validatePassword } from "@/lib/users";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireUser(req, "Admin");
  return { users: await listUsers() };
});

export const POST = route(async (req) => {
  await requireUser(req, "Admin");
  const b = await body<{ email?: string; name?: string; role?: string; password?: string }>(req);
  const email = String(b.email || "").trim().toLowerCase();
  if (!/^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(email)) throw new HttpError(400, "Invalid email");
  const err = validatePassword(String(b.password || ""));
  if (err) throw new HttpError(400, err);
  try {
    const id = await createUser({ email, name: String(b.name || ""), role: b.role === "Admin" ? "Admin" : "Staff", password: String(b.password) });
    return { id };
  } catch (e: any) {
    if (/already exists/.test(e?.message)) throw new HttpError(400, e.message);
    throw e;
  }
});
