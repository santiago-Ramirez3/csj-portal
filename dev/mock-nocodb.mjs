// Minimal in-memory NocoDB mock for local development / testing of the portal.
// Implements only the endpoints the portal uses (v3 meta reads/table create, v2 data + links).
// Usage: MOCK_TOKEN=dev-token PORT=8090 node dev/mock-nocodb.mjs
// Then run the portal with NOCODB_URL=http://localhost:8090 NOCODB_TOKEN=dev-token NOCODB_BASE_ID=pmockbase
import http from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT || 8090);
const TOKEN = process.env.MOCK_TOKEN || "dev-token";
const BASE = "pmockbase";
const def = JSON.parse(readFileSync(new URL("./mock-schema.json", import.meta.url), "utf8"));

let seq = 0;
const nid = (p) => `${p}${(++seq).toString(36).padStart(6, "0")}`;
const tables = new Map(); // id -> { id, title, fields: [], rows: Map, nextId }
const links = new Map(); // `${parentTableId}|${hmFieldId}` -> Map(parentId -> Set(childId))

function addTable(title, fields) {
  const t = { id: nid("m"), title, fields: [], rows: new Map(), nextId: 1 };
  t.fields.push({ id: nid("c"), title: "Id", type: "ID" });
  for (const f of fields) {
    const nf = { id: nid("c"), title: f.title, type: f.type, default_value: f.default_value, options: f.options ? JSON.parse(JSON.stringify(f.options)) : undefined };
    if (nf.options?.choices) nf.options.choices.forEach((c) => (c.id = nid("s")));
    t.fields.push(nf);
  }
  t.display_field_id = t.fields[1]?.id;
  tables.set(t.id, t);
  return t;
}
const byTitle = (title) => [...tables.values()].find((t) => t.title === title);

for (const t of def.tables) addTable(t.title, t.fields);
for (const l of def.links) {
  const p = byTitle(l.parent), c = byTitle(l.child);
  const hm = { id: nid("c"), title: l.title, type: "Links", options: { relation_type: "hm", related_table_id: c.id } };
  p.fields.push(hm);
  const bt = { id: nid("c"), title: p.title, type: "Links", options: { relation_type: "bt", related_table_id: p.id }, _hm: hm.id };
  c.fields.push(bt);
  links.set(`${p.id}|${hm.id}`, new Map());
}
for (const [title, recs] of Object.entries(def.seed)) {
  const t = byTitle(title);
  for (const r of recs) insert(t, r);
}

function insert(t, data) {
  const Id = t.nextId++;
  const row = { Id, CreatedAt: new Date().toISOString(), UpdatedAt: new Date().toISOString() };
  for (const f of t.fields) {
    if (f.type === "ID" || f.type === "Links") continue;
    if (f.title in data) row[f.title] = data[f.title];
    else if (f.default_value !== undefined && f.type !== "Checkbox") row[f.title] = f.default_value;
    else row[f.title] = f.type === "Checkbox" ? false : null;
  }
  t.rows.set(Id, row);
  return row;
}

function display(t, row) {
  const f = t.fields.find((x) => x.id === t.display_field_id);
  return row[f.title];
}

function expand(t, row) {
  const out = { ...row };
  for (const f of t.fields) {
    if (f.type !== "Links") continue;
    if (f.options.relation_type === "hm") {
      out[f.title] = links.get(`${t.id}|${f.id}`).get(row.Id)?.size || 0;
    } else {
      const parent = tables.get(f.options.related_table_id);
      const m = links.get(`${parent.id}|${f._hm}`);
      let pid = null;
      for (const [k, set] of m) if (set.has(row.Id)) pid = k;
      const prow = pid ? parent.rows.get(pid) : null;
      const df = parent.fields.find((x) => x.id === parent.display_field_id).title;
      out[f.title] = prow ? { Id: prow.Id, [df]: prow[df] } : null;
    }
  }
  return out;
}

// ---- where parser: (a,eq,b)~and((c,like,%x%)~or(d,gte,exactDate,2024-01-01)) ----
function parseWhere(s) {
  let i = 0;
  function expr() {
    let left = term();
    while (s.startsWith("~and", i) || s.startsWith("~or", i)) {
      const op = s.startsWith("~and", i) ? "and" : "or";
      i += op === "and" ? 4 : 3;
      const right = term();
      const l = left;
      left = op === "and" ? (r) => l(r) && right(r) : (r) => l(r) || right(r);
    }
    return left;
  }
  function term() {
    if (s[i] !== "(") throw new Error(`bad where at ${i}: ${s}`);
    if (s[i + 1] === "(") {
      i++;
      const e = expr();
      if (s[i] !== ")") throw new Error("missing )");
      i++;
      return e;
    }
    const end = s.indexOf(")", i);
    const [field, op, ...rest] = s.slice(i + 1, end).split(",");
    i = end + 1;
    let val = rest.join(",");
    if (rest[0] === "exactDate") val = rest[1];
    return (r) => {
      const v = r[field];
      switch (op) {
        case "eq": return String(v ?? "").toLowerCase() === val.toLowerCase();
        case "like": return String(v ?? "").toLowerCase().includes(val.replace(/%/g, "").toLowerCase());
        case "gte": return v != null && String(v) >= val;
        case "lte": return v != null && String(v) <= val;
        default: throw new Error(`op ${op} not mocked`);
      }
    };
  }
  const e = expr();
  if (i !== s.length) throw new Error(`trailing where: ${s.slice(i)}`);
  return e;
}

function applyQuery(rowsArr, q) {
  let rows = rowsArr;
  if (q.get("where")) rows = rows.filter(parseWhere(q.get("where")));
  if (q.get("sort")) {
    const keys = q.get("sort").split(",").map((k) => (k.startsWith("-") ? [k.slice(1), -1] : [k, 1]));
    rows = [...rows].sort((a, b) => {
      for (const [k, d] of keys) {
        const x = a[k] ?? "", y = b[k] ?? "";
        if (x < y) return -d;
        if (x > y) return d;
      }
      return 0;
    });
  }
  const limit = Number(q.get("limit") || 25), offset = Number(q.get("offset") || 0);
  return { list: rows.slice(offset, offset + limit), pageInfo: { totalRows: rows.length, page: Math.floor(offset / limit) + 1, pageSize: limit, isLastPage: offset + limit >= rows.length } };
}

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let body = "";
  for await (const ch of req) body += ch;
  const json = body ? JSON.parse(body) : undefined;
  if (req.headers["xc-token"] !== TOKEN) return send(res, 401, { msg: "Invalid token" });
  const p = url.pathname.split("/").filter(Boolean);
  try {
    // v3 meta
    if (p[0] === "api" && p[1] === "v3" && p[2] === "meta" && p[3] === "bases" && p[5] === "tables") {
      if (p.length === 6 && req.method === "GET") return send(res, 200, { list: [...tables.values()].map((t) => ({ id: t.id, title: t.title })) });
      if (p.length === 6 && req.method === "POST") {
        const t = addTable(json.title, json.fields || []);
        return send(res, 200, { id: t.id, title: t.title, fields: t.fields });
      }
      if (p.length === 7 && req.method === "GET") {
        const t = tables.get(p[6]);
        if (!t) return send(res, 404, { msg: "Table not found" });
        return send(res, 200, { id: t.id, title: t.title, display_field_id: t.display_field_id, fields: t.fields.map(({ _hm, ...f }) => f) });
      }
    }
    // v2 data
    if (p[0] === "api" && p[1] === "v2" && p[2] === "tables") {
      const t = tables.get(p[3]);
      if (!t) return send(res, 404, { msg: "Table not found" });
      if (p[4] === "records") {
        if (p.length === 5 && req.method === "GET") {
          const r = applyQuery([...t.rows.values()], url.searchParams);
          return send(res, 200, { ...r, list: r.list.map((row) => expand(t, row)) });
        }
        if (p.length === 6 && req.method === "GET") {
          const row = t.rows.get(Number(p[5]));
          return row ? send(res, 200, expand(t, row)) : send(res, 404, { msg: "Record not found" });
        }
        if (req.method === "POST") {
          const items = Array.isArray(json) ? json : [json];
          const out = items.map((d) => ({ Id: insert(t, d).Id }));
          return send(res, 200, Array.isArray(json) ? out : out[0]);
        }
        if (req.method === "PATCH") {
          const items = Array.isArray(json) ? json : [json];
          for (const d of items) {
            const row = t.rows.get(Number(d.Id));
            if (!row) return send(res, 404, { msg: "Record not found" });
            for (const [k, v] of Object.entries(d)) {
              if (k === "Id") continue;
              const f = t.fields.find((x) => x.title === k);
              if (!f) return send(res, 400, { msg: `Field '${k}' not found` });
              if (f.type === "SingleSelect" && v !== null && !f.options.choices.some((c) => c.title === v)) return send(res, 400, { msg: `Invalid option ${v}` });
              row[k] = v;
            }
            row.UpdatedAt = new Date().toISOString();
          }
          return send(res, 200, items.map((d) => ({ Id: d.Id })));
        }
        if (req.method === "DELETE") {
          const items = Array.isArray(json) ? json : [json];
          for (const d of items) t.rows.delete(Number(d.Id));
          return send(res, 200, items.map((d) => ({ Id: d.Id })));
        }
      }
      if (p[4] === "links") {
        const key = `${t.id}|${p[5]}`;
        const m = links.get(key);
        if (!m) return send(res, 404, { msg: "Link field not found (only parent-side has-many links are mocked)" });
        const pid = Number(p[7]);
        const field = t.fields.find((f) => f.id === p[5]);
        const child = tables.get(field.options.related_table_id);
        if (req.method === "GET") {
          const ids = [...(m.get(pid) || [])];
          const r = applyQuery(ids.map((id) => child.rows.get(id)).filter(Boolean), url.searchParams);
          return send(res, 200, { ...r, list: r.list.map((row) => expand(child, row)) });
        }
        const ids = (Array.isArray(json) ? json : [json]).map((x) => Number(x.Id));
        if (req.method === "POST") {
          // has-many: a child can only belong to one parent
          for (const id of ids) for (const set of m.values()) set.delete(id);
          if (!m.has(pid)) m.set(pid, new Set());
          ids.forEach((id) => m.get(pid).add(id));
          return send(res, 200, true);
        }
        if (req.method === "DELETE") {
          ids.forEach((id) => m.get(pid)?.delete(id));
          return send(res, 200, true);
        }
      }
    }
    send(res, 404, { msg: `Not mocked: ${req.method} ${url.pathname}` });
  } catch (e) {
    send(res, 400, { msg: String(e.message || e) });
  }
});
server.listen(PORT, () => console.log(`mock NocoDB on http://localhost:${PORT} (base ${BASE}, token ${TOKEN})`));
