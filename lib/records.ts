import "server-only";
import { HttpError } from "./api";
import {
  createRecord,
  deleteRecord,
  getRecord,
  link,
  listLinked,
  listRecords,
  unlink,
  updateRecord,
  w,
} from "./nocodb";
import { getSchema, resolveModule, type RField, type RModule, type RParent } from "./schema";
import { getModule, type Role } from "./modules";

export async function loadModule(key: string, role: Role): Promise<RModule> {
  const spec = getModule(key);
  if (!spec) throw new HttpError(404, "Unknown module");
  const s = await getSchema();
  const mod = resolveModule(s, spec, role);
  if (!mod.tableId) throw new HttpError(500, `Table "${spec.table}" not found in NocoDB`);
  return mod;
}

// ---------- value validation ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanValue(f: RField, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  switch (f.kind) {
    case "select": {
      const s = String(v);
      if (f.choices && !f.choices.some((c) => c.title === s)) {
        throw new HttpError(400, `"${s}" is not a valid option for ${f.label}`);
      }
      return s;
    }
    case "date": {
      const s = String(v).slice(0, 10);
      if (!DATE_RE.test(s)) throw new HttpError(400, `Invalid date for ${f.label}`);
      return s;
    }
    case "datetime":
      return String(v);
    case "checkbox":
      return v === true || v === "true" || v === 1;
    case "number": {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new HttpError(400, `Invalid number for ${f.label}`);
      return n;
    }
    case "text":
      return String(v).slice(0, 1000);
    case "longtext":
      return String(v).slice(0, 20000);
    default:
      return undefined;
  }
}

export function sanitize(mod: RModule | { fields: RField[] }, input: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  for (const f of mod.fields) {
    if (!f.form || f.missing) continue;
    if (!(f.name in input)) continue;
    const v = cleanValue(f, input[f.name]);
    if (v !== undefined) out[f.name] = v;
  }
  if (!partial) {
    for (const f of mod.fields) {
      if (f.required && !f.missing && (out[f.name] === undefined || out[f.name] === null || out[f.name] === "")) {
        throw new HttpError(400, `${f.label} is required`);
      }
    }
  }
  return out;
}

// ---------- row shaping ----------

function parentValue(row: Record<string, any>, p: RParent): { id: number; label: string } | null {
  if (!p.childFieldTitle) return null;
  let v = row[p.childFieldTitle];
  if (Array.isArray(v)) v = v[0];
  if (!v || typeof v !== "object") return null;
  const id = Number(v.Id ?? v.id);
  if (!Number.isFinite(id)) return null;
  const label =
    v[p.parentDisplayField] ??
    Object.entries(v).find(([k, val]) => k !== "Id" && k !== "id" && typeof val === "string")?.[1] ??
    `#${id}`;
  return { id, label: String(label) };
}

export function shapeRow(mod: RModule, row: Record<string, any>) {
  const out: Record<string, any> = { Id: row.Id };
  for (const f of mod.fields) if (!f.missing) out[f.name] = row[f.name] ?? null;
  const parents: Record<string, { id: number; label: string } | null> = {};
  for (const p of mod.parents) parents[p.key] = parentValue(row, p);
  out.__parents = parents;
  out.__updatedAt = row.UpdatedAt || row.updated_at || null;
  return out;
}

// ---------- list ----------

export interface ListParams {
  q?: string;
  status?: string[];
  from?: string;
  to?: string;
  parentKey?: string;
  parentId?: number;
  sort?: string;
  page?: number;
  pageSize?: number;
  where?: string; // extra where (server-built only)
}

export function buildWhere(mod: RModule, p: ListParams): string {
  const parts: string[] = [];
  const q = p.q?.trim();
  if (q) {
    const fields = mod.searchFields.filter((n) => mod.fields.find((f) => f.name === n && !f.missing) || n === mod.displayField);
    const ors = fields.map((n) => w.like(n, q));
    if (ors.length) parts.push(w.or(...ors));
  }
  if (p.status?.length && mod.statusField) {
    const sf = mod.fields.find((f) => f.name === mod.statusField);
    const valid = p.status.filter((s) => !sf?.choices || sf.choices.some((c) => c.title === s));
    if (valid.length) parts.push(w.or(...valid.map((s) => w.eq(mod.statusField!, s))));
  }
  if (mod.dateFilterField) {
    if (p.from && DATE_RE.test(p.from)) parts.push(w.dateGte(mod.dateFilterField, p.from));
    if (p.to && DATE_RE.test(p.to)) parts.push(w.dateLte(mod.dateFilterField, p.to));
  }
  if (p.where) parts.push(p.where);
  return w.and(...parts);
}

function safeSort(mod: RModule, sort?: string) {
  const s = sort || mod.defaultSort;
  const name = s.replace(/^-/, "");
  const known = name === "Id" || mod.fields.some((f) => f.name === name && !f.missing);
  return known ? s : mod.defaultSort;
}

export async function list(mod: RModule, p: ListParams) {
  const pageSize = Math.min(Math.max(p.pageSize || 25, 1), 200);
  const page = Math.max(p.page || 1, 1);
  const where = buildWhere(mod, p);
  const sort = safeSort(mod, p.sort);
  const offset = (page - 1) * pageSize;
  let r;
  if (p.parentKey && p.parentId) {
    const parent = mod.parents.find((x) => x.key === p.parentKey);
    if (!parent?.parentTableId || !parent.linkFieldId) throw new HttpError(400, "Unknown parent filter");
    r = await listLinked(parent.parentTableId, parent.linkFieldId, p.parentId, { where, sort, limit: pageSize, offset });
  } else {
    r = await listRecords(mod.tableId!, { where, sort, limit: pageSize, offset });
  }
  return {
    rows: r.list.map((row) => shapeRow(mod, row)),
    total: r.pageInfo?.totalRows ?? r.list.length,
    page,
    pageSize,
  };
}

export async function read(mod: RModule, id: number) {
  return shapeRow(mod, await getRecord(mod.tableId!, id));
}

// ---------- parents ----------

async function copyFromParent(mod: RModule, parent: RParent, parentId: number, fields: Record<string, unknown>) {
  if (!parent.parentTableId) return;
  const prow = await getRecord(parent.parentTableId, parentId);
  for (const [from, to] of Object.entries(parent.copy)) {
    const f = mod.fields.find((x) => x.name === to);
    if (f && !f.missing && prow[from] !== undefined && prow[from] !== null && prow[from] !== "") {
      fields[to] = prow[from];
    }
  }
}

async function setParent(mod: RModule, parent: RParent, childId: number, newParentId: number | null) {
  if (!parent.parentTableId || !parent.linkFieldId) {
    throw new HttpError(500, `Link "${parent.label}" is not configured in NocoDB`);
  }
  // find current parent through the inverse field (if NocoDB exposes it)
  const current = parentValue(await getRecord(mod.tableId!, childId), parent);
  if (current && current.id === newParentId) return;
  if (current) await unlink(parent.parentTableId, parent.linkFieldId, current.id, [childId]);
  if (newParentId) await link(parent.parentTableId, parent.linkFieldId, newParentId, [childId]);
}

function parseParents(mod: RModule, input: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!input || typeof input !== "object") return out;
  for (const p of mod.parents) {
    if (!(p.key in (input as any))) continue;
    const v = (input as any)[p.key];
    if (v === null || v === "") out[p.key] = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${p.label}`);
      out[p.key] = n;
    }
  }
  return out;
}

// ---------- create / update / delete ----------

export async function create(mod: RModule, input: { fields?: Record<string, unknown>; parents?: unknown }) {
  const parents = parseParents(mod, input.parents);
  for (const p of mod.parents) {
    if (p.required && !parents[p.key]) throw new HttpError(400, `${p.label} is required`);
  }
  const fields = sanitize(mod, input.fields || {}, true);
  for (const p of mod.parents) {
    const pid = parents[p.key];
    if (pid) await copyFromParent(mod, p, pid, fields);
  }
  // required check after copying from parents
  for (const f of mod.fields) {
    if (f.required && !f.missing && (fields[f.name] === undefined || fields[f.name] === null || fields[f.name] === "")) {
      throw new HttpError(400, `${f.label} is required`);
    }
  }
  const { Id } = await createRecord(mod.tableId!, fields);
  try {
    for (const p of mod.parents) {
      const pid = parents[p.key];
      if (pid) {
        if (!p.parentTableId || !p.linkFieldId) throw new HttpError(500, `Link "${p.label}" is not configured in NocoDB`);
        await link(p.parentTableId, p.linkFieldId, pid, [Id]);
      }
    }
  } catch (e) {
    await deleteRecord(mod.tableId!, Id).catch(() => undefined);
    throw e;
  }
  return Id;
}

export async function update(mod: RModule, id: number, input: { fields?: Record<string, unknown>; parents?: unknown }) {
  const fields = sanitize(mod, input.fields || {}, true);
  for (const f of mod.fields) {
    if (f.required && f.name in fields && (fields[f.name] === null || fields[f.name] === "")) {
      throw new HttpError(400, `${f.label} is required`);
    }
  }
  const parents = parseParents(mod, input.parents);
  for (const p of mod.parents) {
    if (!(p.key in parents)) continue;
    if (p.required && !parents[p.key]) throw new HttpError(400, `${p.label} is required`);
    await setParent(mod, p, id, parents[p.key]);
    if (parents[p.key]) await copyFromParent(mod, p, parents[p.key]!, fields);
  }
  if (Object.keys(fields).length) await updateRecord(mod.tableId!, id, fields);
}

export async function remove(mod: RModule, id: number) {
  await deleteRecord(mod.tableId!, id);
}

// ---------- children (related lists) ----------

export async function listChildren(mod: RModule, id: number, childKey: string, role: Role) {
  const child = mod.children.find((c) => c.key === childKey);
  if (!child?.linkFieldId) throw new HttpError(400, "Related list not configured");
  const cmod = await loadModule(child.module, role);
  const r = await listLinked(mod.tableId!, child.linkFieldId, id, { sort: child.sort, limit: 100 });
  return { rows: r.list.map((row) => shapeRow(cmod, row)), total: r.pageInfo?.totalRows ?? r.list.length };
}

export async function addChild(mod: RModule, id: number, childKey: string, input: Record<string, unknown>, role: Role) {
  const child = mod.children.find((c) => c.key === childKey);
  if (!child?.linkFieldId || !child.canAdd) throw new HttpError(400, "Cannot add to this list");
  const cmod = await loadModule(child.module, role);
  if (!cmod.canWrite) throw new HttpError(403, "Not allowed");
  const allowed = { fields: cmod.fields.filter((f) => child.addFields.some((a) => a.name === f.name)) };
  const fields = sanitize(allowed, input, false);
  const { Id } = await createRecord(cmod.tableId!, fields);
  try {
    await link(mod.tableId!, child.linkFieldId, id, [Id]);
  } catch (e) {
    await deleteRecord(cmod.tableId!, Id).catch(() => undefined);
    throw e;
  }
  return Id;
}
