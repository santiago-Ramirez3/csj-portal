import { body, HttpError, requireUser, route } from "@/lib/api";
import { loadModule, read, remove, update } from "@/lib/records";
export const dynamic = "force-dynamic";

type P = { module: string; id: string };
const num = (id: string) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
};

export const GET = route<P>(async (req, { module, id }) => {
  const me = await requireUser(req);
  return read(await loadModule(module, me.role), num(id));
});

export const PATCH = route<P>(async (req, { module, id }) => {
  const me = await requireUser(req);
  const mod = await loadModule(module, me.role);
  if (!mod.canWrite) throw new HttpError(403, "Not allowed");
  await update(mod, num(id), await body(req));
  return read(mod, num(id));
});

export const DELETE = route<P>(async (req, { module, id }) => {
  const me = await requireUser(req, "Admin");
  await remove(await loadModule(module, me.role), num(id));
  return { ok: true };
});
