import { body, HttpError, requireUser, route } from "@/lib/api";
import { updateUser, validatePassword } from "@/lib/users";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const me = await requireUser(req, "Admin");
  const uid = Number(id);
  if (!Number.isInteger(uid) || uid <= 0) throw new HttpError(400, "Invalid id");
  const b = await body<{ name?: string; role?: string; active?: boolean; password?: string }>(req);
  if (uid === me.uid && (b.active === false || b.role === "Staff")) {
    throw new HttpError(400, "You cannot deactivate or demote your own account");
  }
  if (b.password !== undefined) {
    const err = validatePassword(String(b.password));
    if (err) throw new HttpError(400, err);
  }
  await updateUser(uid, {
    name: b.name,
    role: b.role === undefined ? undefined : b.role === "Admin" ? "Admin" : "Staff",
    active: b.active,
    password: b.password,
  });
  return { ok: true };
});
