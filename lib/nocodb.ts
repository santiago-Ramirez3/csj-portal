import "server-only";

// Thin NocoDB client. The API token never leaves the server.
// Meta (schema) reads use the v3 meta API with a v2 fallback; record CRUD and
// links use the v2 data API (stable on self-hosted NocoDB).

export class NocoError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, path: string) {
    super(`NocoDB ${status} on ${path}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

export function env() {
  const url = (process.env.NOCODB_URL || "").replace(/\/+$/, "");
  const token = process.env.NOCODB_TOKEN || "";
  const baseId = process.env.NOCODB_BASE_ID || "";
  if (!url || !token || !baseId) {
    throw new Error("Missing NOCODB_URL, NOCODB_TOKEN or NOCODB_BASE_ID environment variables");
  }
  return { url, token, baseId };
}

type Query = Record<string, string | number | undefined | null>;

export async function nc<T = any>(
  path: string,
  opts: { method?: string; query?: Query; body?: unknown } = {}
): Promise<T> {
  const { url, token } = env();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const full = `${url}${path}${qs.toString() ? `?${qs}` : ""}`;
  const res = await fetch(full, {
    method: opts.method || "GET",
    headers: { "xc-token": token, "Content-Type": "application/json", Accept: "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new NocoError(res.status, text, path);
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------- where-clause helpers (NocoDB v2 syntax) ----------

/** Removes characters that would break NocoDB's where syntax. */
export function cleanValue(v: string): string {
  return v.replace(/[(),~]/g, " ").replace(/\s+/g, " ").trim();
}

export const w = {
  eq: (f: string, v: string | number | boolean) => `(${f},eq,${typeof v === "string" ? cleanValue(v) : v})`,
  like: (f: string, v: string) => `(${f},like,%${cleanValue(v)}%)`,
  dateGte: (f: string, d: string) => `(${f},gte,exactDate,${d})`,
  dateLte: (f: string, d: string) => `(${f},lte,exactDate,${d})`,
  and: (...parts: (string | undefined | false)[]) => {
    const p = parts.filter(Boolean) as string[];
    return p.length <= 1 ? p[0] || "" : p.join("~and");
  },
  or: (...parts: string[]) => (parts.length <= 1 ? parts[0] || "" : `(${parts.join("~or")})`),
};

// ---------- data API (v2) ----------

export interface ListResult {
  list: Record<string, any>[];
  pageInfo: { totalRows?: number; page?: number; pageSize?: number; isLastPage?: boolean };
}

export function listRecords(
  tableId: string,
  q: { where?: string; sort?: string; limit?: number; offset?: number; fields?: string }
) {
  return nc<ListResult>(`/api/v2/tables/${tableId}/records`, {
    query: { where: q.where, sort: q.sort, limit: q.limit ?? 25, offset: q.offset ?? 0, fields: q.fields },
  });
}

export function getRecord(tableId: string, id: string | number) {
  return nc<Record<string, any>>(`/api/v2/tables/${tableId}/records/${encodeURIComponent(String(id))}`);
}

export async function createRecord(tableId: string, fields: Record<string, unknown>) {
  const res = await nc<any>(`/api/v2/tables/${tableId}/records`, { method: "POST", body: fields });
  const row = Array.isArray(res) ? res[0] : res;
  return row as { Id: number };
}

export function updateRecord(tableId: string, id: number, fields: Record<string, unknown>) {
  return nc(`/api/v2/tables/${tableId}/records`, { method: "PATCH", body: { ...fields, Id: id } });
}

export function deleteRecord(tableId: string, id: number) {
  return nc(`/api/v2/tables/${tableId}/records`, { method: "DELETE", body: { Id: id } });
}

/** Records linked through a has-many field of the parent record. */
export function listLinked(
  parentTableId: string,
  linkFieldId: string,
  parentId: number,
  q: { sort?: string; limit?: number; offset?: number; where?: string; fields?: string } = {}
) {
  return nc<ListResult>(`/api/v2/tables/${parentTableId}/links/${linkFieldId}/records/${parentId}`, {
    query: { sort: q.sort, limit: q.limit ?? 25, offset: q.offset ?? 0, where: q.where, fields: q.fields },
  });
}

export function link(parentTableId: string, linkFieldId: string, parentId: number, childIds: number[]) {
  return nc(`/api/v2/tables/${parentTableId}/links/${linkFieldId}/records/${parentId}`, {
    method: "POST",
    body: childIds.map((Id) => ({ Id })),
  });
}

export function unlink(parentTableId: string, linkFieldId: string, parentId: number, childIds: number[]) {
  return nc(`/api/v2/tables/${parentTableId}/links/${linkFieldId}/records/${parentId}`, {
    method: "DELETE",
    body: childIds.map((Id) => ({ Id })),
  });
}
