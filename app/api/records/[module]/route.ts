import { body, HttpError, requireUser, route } from "@/lib/api";
import { create, list, loadModule } from "@/lib/records";
export const dynamic = "force-dynamic";

type P = { module: string };

export const GET = route<P>(async (req, { module }) => {
  const me = await requireUser(req);
  const mod = await loadModule(module, me.role);
  const sp = req.nextUrl.searchParams;
  return list(mod, {
    q: sp.get("q") || undefined,
    status: sp.get("status") ? sp.get("status")!.split("|").filter(Boolean) : undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    parentKey: sp.get("parentKey") || undefined,
    parentId: sp.get("parentId") ? Number(sp.get("parentId")) : undefined,
    sort: sp.get("sort") || undefined,
    page: Number(sp.get("page") || 1),
    pageSize: Number(sp.get("pageSize") || 25),
  });
});

export const POST = route<P>(async (req, { module }) => {
  const me = await requireUser(req);
  const mod = await loadModule(module, me.role);
  if (!mod.canWrite) throw new HttpError(403, "Not allowed");
  const id = await create(mod, await body(req));
  return { id };
});
