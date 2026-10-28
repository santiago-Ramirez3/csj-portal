"use client";
import { useCallback, useEffect, useState } from "react";
import type { RChild, RModule } from "@/lib/schema";
import { api } from "@/lib/client";
import { todayISO } from "@/lib/dates";
import { Drawer } from "./Modal";
import { RecordForm } from "./RecordForm";
import { DisplayValue, FieldInput } from "./fields";
import { usePortal } from "./SchemaContext";
import { useToast } from "./Toast";

function RelatedList({ mod, recordId, child }: { mod: RModule; recordId: number; child: RChild }) {
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ rows: Record<string, any>[] }>(`/api/records/${mod.key}/${recordId}/related/${child.key}`);
      setRows(r.rows);
    } catch (e: any) {
      toast(e.message, "err");
      setRows([]);
    }
  }, [mod.key, recordId, child.key, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const startAdd = () => {
    const d: Record<string, unknown> = {};
    const firstDate = child.addFields.find((f) => f.kind === "date");
    if (firstDate) d[firstDate.name] = todayISO();
    for (const f of child.addFields) if (f.defaultValue !== undefined && d[f.name] === undefined) d[f.name] = f.defaultValue;
    setDraft(d);
    setAdding(true);
  };

  const save = async () => {
    for (const f of child.addFields) {
      if (f.required && !draft[f.name]) return toast(`${f.label} is required`, "err");
    }
    setBusy(true);
    try {
      await api(`/api/records/${mod.key}/${recordId}/related/${child.key}`, { method: "POST", body: { fields: draft } });
      setAdding(false);
      toast(`${child.label.replace(/s$/, "")} added`);
      await load();
    } catch (e: any) {
      toast(e.message, "err");
    } finally {
      setBusy(false);
    }
  };

  if (child.missing) {
    return (
      <section className="related">
        <h3>{child.label}</h3>
        <p className="muted small">The link field for this list was not found in NocoDB. Check Admin → Setup.</p>
      </section>
    );
  }

  const cols = child.columns.filter((c) => !c.missing);
  return (
    <section className="related">
      <div className="related-head">
        <h3>{child.label} {rows && <span className="count">{rows.length}</span>}</h3>
        {child.canAdd && !adding && <button className="btn sm primary" onClick={startAdd}>+ Add {child.label.replace(/s$/, "").toLowerCase()}</button>}
      </div>
      {adding && (
        <div className="related-add">
          <div className="form-grid">
            {child.addFields.filter((f) => !f.missing).map((f) => (
              <label key={f.name} className={`field ${f.kind === "longtext" ? "full" : ""}`}>
                <span>{f.label}{f.required && " *"}</span>
                <FieldInput field={f} value={draft[f.name]} onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))} />
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
      {rows === null ? (
        <p className="muted small">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted small">No {child.label.toLowerCase()} yet.</p>
      ) : (
        <div className="mini-table-wrap">
          <table className="mini-table">
            <thead>
              <tr>{cols.map((c) => <th key={c.name}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.Id}>
                  {cols.map((c) => (
                    <td key={c.name} className={c.kind === "longtext" ? "wrap" : ""}>
                      {c.kind === "longtext" ? (r[c.name] || <span className="muted">—</span>) : <DisplayValue field={c} value={r[c.name]} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RecordDrawer({
  mod,
  id,
  onClose,
  onSaved,
  onDeleted,
}: {
  mod: RModule;
  id: number;
  onClose: () => void;
  onSaved: (row: Record<string, any>) => void;
  onDeleted: (id: number) => void;
}) {
  const { me } = usePortal();
  const toast = useToast();
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancel = false;
    api<Record<string, any>>(`/api/records/${mod.key}/${id}`)
      .then((r) => !cancel && setRow(r))
      .catch((e) => toast(e.message, "err"));
    return () => {
      cancel = true;
    };
  }, [mod.key, id, toast]);

  const del = async () => {
    if (!window.confirm(`Delete this ${mod.singular.toLowerCase()}? This cannot be undone.`)) return;
    try {
      await api(`/api/records/${mod.key}/${id}`, { method: "DELETE" });
      toast(`${mod.singular} deleted`);
      onDeleted(id);
    } catch (e: any) {
      toast(e.message, "err");
    }
  };

  const title = row ? String(row[mod.displayField] || `${mod.singular} #${id}`) : "Loading…";
  return (
    <Drawer title={title} subtitle={`${mod.singular} #${id}`} onClose={onClose}>
      {row && (
        <>
          <RecordForm
            key={version}
            mod={mod}
            row={row}
            readOnly={!mod.canWrite}
            submitLabel="Save changes"
            onSubmit={async ({ fields, parents }) => {
              if (!Object.keys(fields).length && !Object.keys(parents).length) {
                toast("No changes to save");
                return;
              }
              const updated = await api<Record<string, any>>(`/api/records/${mod.key}/${id}`, { method: "PATCH", body: { fields, parents } });
              setRow(updated);
              setVersion((v) => v + 1);
              onSaved(updated);
              toast("Saved");
            }}
          />
          {mod.children.map((c) => (
            <RelatedList key={c.key} mod={mod} recordId={id} child={c} />
          ))}
          {me.role === "Admin" && (
            <div className="danger-zone">
              <button className="btn danger sm" onClick={del}>Delete {mod.singular.toLowerCase()}</button>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
