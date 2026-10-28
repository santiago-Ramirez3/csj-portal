"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RField, RModule, RParent } from "@/lib/schema";
import { api, qs } from "@/lib/client";
import { fmtDate } from "@/lib/dates";
import { useModule } from "./SchemaContext";
import { InlineCell } from "./fields";
import { Modal } from "./Modal";
import { RecordForm } from "./RecordForm";
import { RecordDrawer } from "./RecordDrawer";
import { ParentPicker, type ParentValue } from "./ParentPicker";
import { useToast } from "./Toast";

type Col = { kind: "field"; field: RField } | { kind: "parent"; parent: RParent };

function columns(mod: RModule): Col[] {
  const cols: Col[] = mod.fields.filter((f) => f.grid && !f.missing).map((field) => ({ kind: "field", field }));
  const parentCols: Col[] = mod.parents.filter((p) => p.grid && !p.missing).map((parent) => ({ kind: "parent", parent }));
  if (!parentCols.length) return cols;
  const at = cols.findIndex((c) => c.kind === "field" && c.field.name === "Date of Birth");
  cols.splice(at >= 0 ? at + 1 : cols.length, 0, ...parentCols);
  return cols;
}

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ModuleView({ moduleKey }: { moduleKey: string }) {
  const mod = useModule(moduleKey);
  const toast = useToast();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [parentFilter, setParentFilter] = useState<ParentValue>(null);
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [ready, setReady] = useState(false);

  // initial filters from the URL (dashboard deep links)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("status")) setStatus(sp.get("status")!.split("|"));
    if (sp.get("from")) setFrom(sp.get("from")!);
    if (sp.get("to")) setTo(sp.get("to")!);
    if (sp.get("open")) setOpenId(Number(sp.get("open")));
    setReady(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => setPage(1), [debouncedQ, status, from, to, parentFilter, sort]);

  const parentForFilter = mod?.parents.find((p) => p.key === mod.parentFilter && !p.missing);

  const query = useCallback(
    (p: number, size: number) =>
      qs({
        q: debouncedQ,
        status: status.join("|"),
        from,
        to,
        sort,
        page: p,
        pageSize: size,
        parentKey: parentFilter ? parentForFilter?.key : undefined,
        parentId: parentFilter?.id,
      }),
    [debouncedQ, status, from, to, sort, parentFilter, parentForFilter]
  );

  const load = useCallback(async () => {
    if (!mod || !ready) return;
    setLoading(true);
    try {
      const r = await api<{ rows: any[]; total: number }>(`/api/records/${mod.key}${query(page, pageSize)}`);
      setRows(r.rows);
      setTotal(r.total);
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setLoading(false);
    }
  }, [mod, ready, query, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const cols = useMemo(() => (mod ? columns(mod) : []), [mod]);
  const statusField = mod?.fields.find((f) => f.name === mod.statusField && !f.missing);
  const dateField = mod?.fields.find((f) => f.name === mod.dateFilterField && !f.missing);

  if (!mod) return <div className="page"><p>Unknown module.</p></div>;
  if (mod.missing) {
    return (
      <div className="page">
        <h1>{mod.title}</h1>
        <div className="notice">The table for this module was not found in NocoDB. Ask an admin to open Admin → Setup.</div>
      </div>
    );
  }

  const saveCell = async (row: Record<string, any>, field: RField, v: unknown) => {
    try {
      const updated = await api<Record<string, any>>(`/api/records/${mod.key}/${row.Id}`, {
        method: "PATCH",
        body: { fields: { [field.name]: v } },
      });
      setRows((rs) => rs.map((r) => (r.Id === row.Id ? updated : r)));
      toast(`${field.label} updated`);
    } catch (e: any) {
      toast(e.message, "err");
      throw e;
    }
  };

  const toggleSort = (name: string) => {
    if (sort === name) setSort(`-${name}`);
    else if (sort === `-${name}`) setSort("");
    else setSort(name);
  };
  const sortMark = (name: string) => (sort === name ? " ▲" : sort === `-${name}` ? " ▼" : "");

  const exportCsv = async () => {
    try {
      const all: Record<string, any>[] = [];
      for (let p = 1; p <= 10; p++) {
        const r = await api<{ rows: any[]; total: number }>(`/api/records/${mod.key}${query(p, 200)}`);
        all.push(...r.rows);
        if (all.length >= r.total || r.rows.length === 0) break;
      }
      const head = cols.map((c) => (c.kind === "field" ? c.field.label : c.parent.label));
      const lines = all.map((r) =>
        cols
          .map((c) => {
            if (c.kind === "parent") return csvCell(r.__parents?.[c.parent.key]?.label);
            const v = r[c.field.name];
            return csvCell(c.field.kind === "date" ? fmtDate(v) : c.field.kind === "checkbox" ? (v ? "Yes" : "No") : v);
          })
          .join(",")
      );
      const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${mod.key}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      toast(e.message, "err");
    }
  };

  const filtersActive = !!(q || status.length || from || to || parentFilter);
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{mod.title}</h1>
          <p className="muted">{loading ? "Loading…" : `${total.toLocaleString()} record${total === 1 ? "" : "s"}`}</p>
        </div>
        <div className="row gap">
          <button className="btn" onClick={exportCsv} title="Export the current filtered list (max 2,000 rows)">Export CSV</button>
          {mod.canWrite && <button className="btn primary" onClick={() => setCreating(true)}>+ New {mod.singular.toLowerCase()}</button>}
        </div>
      </div>

      <div className="toolbar">
        <input className="search" type="search" placeholder={`Search ${mod.searchFields.join(", ").toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {dateField && (
          <div className="date-range">
            <span className="muted small">{dateField.label}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <span className="muted">–</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
        )}
        {parentForFilter && (
          <div className="parent-filter">
            <ParentPicker parent={parentForFilter} value={parentFilter} onChange={(v) => setParentFilter(v)} placeholder={`Filter by ${parentForFilter.label.toLowerCase()}…`} />
            {parentFilter && <button className="link-btn" onClick={() => setParentFilter(null)}>Clear</button>}
          </div>
        )}
        {filtersActive && (
          <button className="link-btn" onClick={() => { setQ(""); setStatus([]); setFrom(""); setTo(""); setParentFilter(null); }}>
            Reset filters
          </button>
        )}
      </div>

      {statusField?.choices && (
        <div className="chips" role="group" aria-label={`Filter by ${statusField.label}`}>
          <span className="muted small">{statusField.label}:</span>
          {statusField.choices.map((c) => {
            const on = status.includes(c.title);
            return (
              <button
                key={c.title}
                className={`chip-btn ${on ? "on" : ""}`}
                style={on ? { background: `${c.color}33`, borderColor: c.color } : undefined}
                onClick={() => setStatus((s) => (on ? s.filter((x) => x !== c.title) : [...s, c.title]))}
                aria-pressed={on}
              >
                <span className="dot" style={{ background: c.color }} />
                {c.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="idcol">#</th>
              {cols.map((c) =>
                c.kind === "field" ? (
                  <th key={c.field.name} style={{ minWidth: c.field.width }} onClick={() => toggleSort(c.field.name)} className="sortable">
                    {c.field.label}{sortMark(c.field.name)}
                  </th>
                ) : (
                  <th key={`p-${c.parent.key}`} style={{ minWidth: c.parent.width }}>{c.parent.label}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="empty">No records{filtersActive ? " match these filters" : " yet"}.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.Id} onClick={() => setOpenId(r.Id)} className={openId === r.Id ? "active" : ""}>
                <td className="idcol">{r.Id}</td>
                {cols.map((c) =>
                  c.kind === "field" ? (
                    <td key={c.field.name} className={c.field.kind === "longtext" ? "long" : ""}>
                      <InlineCell field={c.field} value={r[c.field.name]} editable={mod.canWrite && c.field.inline} onSave={(v) => saveCell(r, c.field, v)} />
                    </td>
                  ) : (
                    <td key={`p-${c.parent.key}`}>
                      {r.__parents?.[c.parent.key]?.label ? <span className="clip">{r.__parents[c.parent.key].label}</span> : <span className="muted">—</span>}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="grid-loading">Loading…</div>}
      </div>

      <div className="pager">
        <span className="muted small">{firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {total.toLocaleString()}</span>
        <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <button className="btn sm" disabled={lastRow >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>

      {creating && (
        <Modal title={`New ${mod.singular.toLowerCase()}`} onClose={() => setCreating(false)} wide>
          <RecordForm
            mod={mod}
            submitLabel={`Create ${mod.singular.toLowerCase()}`}
            onCancel={() => setCreating(false)}
            onSubmit={async ({ fields, parents }) => {
              const r = await api<{ id: number }>(`/api/records/${mod.key}`, { method: "POST", body: { fields, parents } });
              setCreating(false);
              toast(`${mod.singular} created`);
              await load();
              if (mod.children.some((c) => c.canAdd)) setOpenId(r.id);
            }}
          />
        </Modal>
      )}

      {openId !== null && (
        <RecordDrawer
          mod={mod}
          id={openId}
          onClose={() => setOpenId(null)}
          onSaved={(u) => setRows((rs) => rs.map((r) => (r.Id === u.Id ? u : r)))}
          onDeleted={(id) => { setOpenId(null); setRows((rs) => rs.filter((r) => r.Id !== id)); setTotal((t) => t - 1); }}
        />
      )}
    </div>
  );
}

