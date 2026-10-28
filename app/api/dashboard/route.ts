import { requireUser, route } from "@/lib/api";
import { listRecords, w } from "@/lib/nocodb";
import { loadModule, shapeRow } from "@/lib/records";
import { addDays, todayISO } from "@/lib/dates";
export const dynamic = "force-dynamic";

async function count(tableId: string, where: string) {
  const r = await listRecords(tableId, { where, limit: 1, fields: "Id" });
  return r.pageInfo?.totalRows ?? r.list.length;
}

export const GET = route(async (req) => {
  const me = await requireUser(req);
  const tz = process.env.APP_TIMEZONE || "America/Detroit";
  const today = todayISO(tz);
  const in7 = addDays(today, 7);
  const [auth, coord, ver] = await Promise.all([
    loadModule("authorizations", me.role),
    loadModule("coordination", me.role),
    loadModule("verifications", me.role),
  ]);
  const safe = async (fn: () => Promise<number>) => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };
  const cards = await Promise.all([
    safe(() => count(auth.tableId!, w.eq("Status", "Pending"))).then((n) => ({ module: "authorizations", label: "Auths pending", status: "Pending", n, tone: "amber" })),
    safe(() => count(auth.tableId!, w.eq("Status", "Appeal Pending"))).then((n) => ({ module: "authorizations", label: "Appeals pending", status: "Appeal Pending", n, tone: "orange" })),
    safe(() => count(coord.tableId!, w.eq("Status", "Pending"))).then((n) => ({ module: "coordination", label: "Coordination pending", status: "Pending", n, tone: "amber" })),
    safe(() => count(coord.tableId!, w.eq("Status", "Unable to Proceed"))).then((n) => ({ module: "coordination", label: "Unable to proceed", status: "Unable to Proceed", n, tone: "red" })),
    safe(() => count(ver.tableId!, w.eq("Verification Status", "Pending"))).then((n) => ({ module: "verifications", label: "Verifications pending", status: "Pending", n, tone: "amber" })),
  ]);
  let upcoming: any[] = [];
  try {
    const r = await listRecords(coord.tableId!, {
      where: w.and(w.dateGte("Date of Service", today), w.dateLte("Date of Service", in7)),
      sort: "Date of Service",
      limit: 25,
    });
    upcoming = r.list.map((row) => shapeRow(coord, row));
  } catch {
    upcoming = [];
  }
  return { today, cards, upcoming };
});
