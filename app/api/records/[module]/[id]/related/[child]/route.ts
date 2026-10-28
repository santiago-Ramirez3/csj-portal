import { body, HttpError, requireUser, route } from "@/lib/api";
import { addChild, listChildren, loadModule } from "@/lib/records";
export const dynamic = "force-dynamic";

type P = { module: string; id: string; child: string };
const num = (id: string) => {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Invalid id");
  return n;
};

export const GET = route<P>(async (req, { module, id, child }) => {
  const me = await requireUser(req);
  return listChildren(await loadModule(module, me.role), num(id), child, me.role);
});

export const POST = route<P>(async (req, { module, id, child }) => {
  const me = await requireUser(req);
  const newId = await addChild(await loadModule(module, me.role), num(id), child, (await body(req)).fields || {}, me.role);
  return { id: newId };
});
