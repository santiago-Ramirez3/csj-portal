import { body, HttpError, requireUser, route } from "@/lib/api";
import { checkPassword, getUser, updateUser, validatePassword } from "@/lib/users";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const me = await requireUser(req);
  const { current, next } = await body<{ current?: string; next?: string }>(req);
  const u = await getUser(me.uid);
  if (!u || !(await checkPassword(u, String(current || "")))) throw new HttpError(400, "Current password is incorrect");
  const err = validatePassword(String(next || ""));
  if (err) throw new HttpError(400, err);
  await updateUser(me.uid, { password: String(next) });
  return { ok: true };
});
