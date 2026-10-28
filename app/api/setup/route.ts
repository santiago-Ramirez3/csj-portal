import { requireUser, route } from "@/lib/api";
import { getSchema, invalidateSchema, resolveModule } from "@/lib/schema";
import { listRecords } from "@/lib/nocodb";
import { MODULES, USERS_TABLE } from "@/lib/modules";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const me = await requireUser(req, "Admin");
  if (req.nextUrl.searchParams.get("refresh") === "1") invalidateSchema();
  const s = await getSchema();
  const modules = await Promise.all(
    MODULES.map(async (spec) => {
      const m = resolveModule(s, spec, me.role);
      let rows: number | null = null;
      if (m.tableId) {
        try {
          const r = await listRecords(m.tableId, { limit: 1, fields: "Id" });
          rows = r.pageInfo?.totalRows ?? r.list.length;
        } catch {
          rows = null;
        }
      }
      return {
        key: m.key,
        table: spec.table,
        found: !!m.tableId,
        rows,
        missingFields: m.fields.filter((f) => f.missing).map((f) => f.name),
        parents: m.parents.map((p) => ({ label: p.label, linkOk: !!p.linkFieldId, inverseField: p.childFieldTitle || null })),
        children: m.children.map((c) => ({ label: c.label, linkOk: !!c.linkFieldId })),
      };
    })
  );
  return { baseId: s.baseId, loadedAt: s.loadedAt, usersTable: !!s.tables[USERS_TABLE], modules };
});
