import "server-only";
import { env, nc } from "./nocodb";
import { MODULES, USERS_TABLE, canWrite, type ModuleSpec, type Role } from "./modules";

// ---------- normalized NocoDB schema ----------

export interface NChoice {
  title: string;
  color?: string;
}
export interface NField {
  id: string;
  title: string;
  type: string;
  choices?: NChoice[];
  defaultValue?: string;
  relatedTableId?: string;
  relationType?: string;
  system?: boolean;
}
export interface NTable {
  id: string;
  title: string;
  displayFieldId?: string;
  fields: NField[];
  byTitle: Record<string, NField>;
}
export interface Schema {
  baseId: string;
  tables: Record<string, NTable>; // by title
  loadedAt: number;
}

const LINK_TYPES = new Set(["Links", "LinkToAnotherRecord"]);

function stripQuotes(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const s = String(v);
  return s.replace(/^'(.*)'$/, "$1");
}

function normalizeField(raw: any): NField {
  // v3 shape: { id, title, type, options: { choices, relation_type, related_table_id }, default_value }
  // v2 shape: { id, title, uidt, colOptions: { options, type, fk_related_model_id }, cdf, system }
  const type: string = raw.type || raw.uidt || "SingleLineText";
  const opts = raw.options || {};
  const col = raw.colOptions || {};
  const rawChoices = opts.choices || col.options;
  return {
    id: raw.id,
    title: raw.title,
    type,
    choices: Array.isArray(rawChoices)
      ? rawChoices.map((c: any) => ({ title: String(c.title), color: c.color }))
      : undefined,
    defaultValue: stripQuotes(raw.default_value ?? raw.cdf),
    relatedTableId: opts.related_table_id || col.fk_related_model_id,
    relationType: opts.relation_type || col.type,
    system: !!raw.system,
  };
}

function normalizeTable(raw: any): NTable {
  const fields: NField[] = (raw.fields || raw.columns || []).map(normalizeField);
  const byTitle: Record<string, NField> = {};
  for (const f of fields) byTitle[f.title] = f;
  return {
    id: raw.id,
    title: raw.title,
    displayFieldId: raw.display_field_id || (raw.columns || []).find((c: any) => c.pv)?.id,
    fields,
    byTitle,
  };
}

async function listTables(baseId: string): Promise<{ id: string; title: string }[]> {
  try {
    const r = await nc<any>(`/api/v3/meta/bases/${baseId}/tables`);
    const list = Array.isArray(r) ? r : r.list;
    if (Array.isArray(list)) return list;
  } catch {
    /* fall back to v2 */
  }
  const r2 = await nc<any>(`/api/v2/meta/bases/${baseId}/tables`);
  return r2.list || [];
}

async function readTable(baseId: string, tableId: string): Promise<NTable> {
  try {
    const r = await nc<any>(`/api/v3/meta/bases/${baseId}/tables/${tableId}`);
    if (Array.isArray(r.fields)) return normalizeTable(r);
  } catch {
    /* fall back to v2 */
  }
  return normalizeTable(await nc<any>(`/api/v2/meta/tables/${tableId}`));
}

let cache: Schema | null = null;
let inflight: Promise<Schema> | null = null;
const TTL_MS = 5 * 60 * 1000;

export function invalidateSchema() {
  cache = null;
}

export async function getSchema(): Promise<Schema> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { baseId } = env();
    const wanted = new Set([...MODULES.map((m) => m.table), USERS_TABLE]);
    const tables = (await listTables(baseId)).filter((t) => wanted.has(t.title));
    const full = await Promise.all(tables.map((t) => readTable(baseId, t.id)));
    const s: Schema = { baseId, tables: {}, loadedAt: Date.now() };
    for (const t of full) s.tables[t.title] = t;
    cache = s;
    return s;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

// ---------- module resolution (what the client receives) ----------

export type Kind = "text" | "longtext" | "date" | "datetime" | "select" | "checkbox" | "number" | "readonly";

export function kindOf(type: string): Kind {
  switch (type) {
    case "SingleLineText":
    case "Email":
    case "URL":
    case "PhoneNumber":
      return "text";
    case "LongText":
      return "longtext";
    case "Date":
      return "date";
    case "DateTime":
      return "datetime";
    case "SingleSelect":
      return "select";
    case "Checkbox":
      return "checkbox";
    case "Number":
    case "Decimal":
    case "Currency":
    case "Percent":
      return "number";
    default:
      return "readonly";
  }
}

export interface RField {
  name: string;
  label: string;
  kind: Kind;
  choices?: NChoice[];
  grid: boolean;
  inline: boolean;
  form: boolean;
  required: boolean;
  width?: number;
  defaultValue?: unknown;
  missing?: boolean;
}
export interface RParent {
  key: string;
  label: string;
  module: string;
  required: boolean;
  grid: boolean;
  width?: number;
  copy: Record<string, string>;
  parentTableId?: string;
  linkFieldId?: string; // has-many on parent
  childFieldTitle?: string; // inverse field on this table
  parentDisplayField: string;
  missing?: boolean;
}
export interface RChild {
  key: string;
  label: string;
  module: string;
  linkFieldId?: string;
  childTableId?: string;
  columns: RField[];
  canAdd: boolean;
  addFields: RField[];
  sort?: string;
  missing?: boolean;
}
export interface RModule {
  key: string;
  title: string;
  singular: string;
  section: string;
  hidden: boolean;
  canWrite: boolean;
  displayField: string;
  searchFields: string[];
  statusField?: string;
  dateFilterField?: string;
  parentFilter?: string;
  defaultSort: string;
  tableId?: string;
  missing?: boolean;
  fields: RField[];
  parents: RParent[];
  children: RChild[];
}

function resolveField(table: NTable | undefined, spec: ModuleSpec["fields"][number]): RField {
  const nf = table?.byTitle[spec.name];
  const kind = nf ? kindOf(nf.type) : "readonly";
  let def: unknown = spec.defaultValue;
  if (def === undefined && nf?.defaultValue !== undefined) {
    if (kind === "select" || kind === "text") def = nf.defaultValue;
  }
  return {
    name: spec.name,
    label: spec.label || spec.name,
    kind,
    choices: nf?.choices,
    grid: !!spec.grid,
    inline: !!spec.inline && kind !== "readonly",
    form: spec.form !== false && kind !== "readonly",
    required: !!spec.required,
    width: spec.width,
    defaultValue: def,
    missing: !nf,
  };
}

export function resolveModule(s: Schema, mod: ModuleSpec, role?: Role): RModule {
  const table = s.tables[mod.table];
  const fields = mod.fields.map((f) => resolveField(table, f));

  const parents: RParent[] = (mod.parents || []).map((p) => {
    const pmod = MODULES.find((m) => m.key === p.module)!;
    const ptable = s.tables[pmod.table];
    const hm = ptable?.byTitle[p.linkField];
    const inverse =
      table && ptable
        ? table.fields.find(
            (f) => f.relatedTableId === ptable.id && (LINK_TYPES.has(f.type) || f.relationType === "bt")
          )
        : undefined;
    return {
      key: p.key,
      label: p.label,
      module: p.module,
      required: !!p.required,
      grid: !!p.grid,
      width: p.width,
      copy: p.copy || {},
      parentTableId: ptable?.id,
      linkFieldId: hm?.id,
      childFieldTitle: inverse?.title,
      parentDisplayField: pmod.displayField,
      missing: !ptable || !hm,
    };
  });

  const children: RChild[] = (mod.children || []).map((c) => {
    const cmod = MODULES.find((m) => m.key === c.module)!;
    const ctable = s.tables[cmod.table];
    const hm = table?.byTitle[c.linkField];
    const specFor = (name: string) => cmod.fields.find((f) => f.name === name) || { name };
    return {
      key: c.key,
      label: c.label,
      module: c.module,
      linkFieldId: hm?.id,
      childTableId: ctable?.id,
      columns: c.columns.map((n) => resolveField(ctable, specFor(n))),
      canAdd: !!c.canAdd && canWrite(cmod, role),
      addFields: (c.addFields || []).map((n) => resolveField(ctable, specFor(n))),
      sort: c.sort,
      missing: !ctable || !hm,
    };
  });

  return {
    key: mod.key,
    title: mod.title,
    singular: mod.singular,
    section: mod.section,
    hidden: !!mod.hidden,
    canWrite: canWrite(mod, role),
    displayField: mod.displayField,
    searchFields: mod.searchFields,
    statusField: mod.statusField,
    dateFilterField: mod.dateFilterField,
    parentFilter: mod.parentFilter,
    defaultSort: mod.defaultSort,
    tableId: table?.id,
    missing: !table,
    fields,
    parents,
    children,
  };
}

export async function clientSchema(role?: Role): Promise<RModule[]> {
  const s = await getSchema();
  // tableIds are internal; strip them before sending to the browser
  return MODULES.map((m) => {
    const r = resolveModule(s, m, role);
    return {
      ...r,
      tableId: undefined,
      parents: r.parents.map((p) => ({ ...p, parentTableId: undefined, linkFieldId: undefined })),
      children: r.children.map((c) => ({ ...c, linkFieldId: undefined, childTableId: undefined })),
    };
  });
}
