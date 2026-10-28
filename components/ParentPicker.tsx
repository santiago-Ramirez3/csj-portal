"use client";
import { useEffect, useRef, useState } from "react";
import type { RParent } from "@/lib/schema";
import { api, qs } from "@/lib/client";
import { fmtDate } from "@/lib/dates";
import { useModule } from "./SchemaContext";
import { FieldInput } from "./fields";
import { useToast } from "./Toast";

export type ParentValue = { id: number; label: string } | null;

export function ParentPicker({
  parent,
  value,
  onChange,
  disabled,
  id,
  placeholder,
}: {
  parent: RParent;
  value: ParentValue;
  onChange: (v: ParentValue, row?: Record<string, any>) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const pmod = useModule(parent.module);
  const toast = useToast();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const boxRef = useRef<HTMLDivElement>(null);
  const isPatients = parent.module === "patients";

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api<{ rows: Record<string, any>[] }>(
          `/api/records/${parent.module}${qs({ q, pageSize: 15, sort: parent.parentDisplayField })}`
        );
        if (!cancel) setRows(r.rows);
      } catch (e: any) {
        if (!cancel) toast(e.message, "err");
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q, open, parent.module, parent.parentDisplayField, toast]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const sub = (r: Record<string, any>) => {
    if (isPatients) return r["Date of Birth"] ? `DOB ${fmtDate(r["Date of Birth"])}` : "";
    if (parent.module === "insurances") return r["Short Name"] || "";
    if (parent.module === "procedures") return r["Category"] || "";
    return "";
  };

  const createNew = async () => {
    if (!pmod) return;
    try {
      const r = await api<{ id: number }>(`/api/records/${parent.module}`, { method: "POST", body: { fields: draft } });
      const label = String(draft[parent.parentDisplayField] || `#${r.id}`);
      onChange({ id: r.id, label }, { Id: r.id, ...draft });
      setCreating(false);
      setDraft({});
      setOpen(false);
      toast(`${pmod.singular} created`);
    } catch (e: any) {
      toast(e.message, "err");
    }
  };

  if (value && !open) {
    return (
      <div className="picker-selected">
        <span className="chip">{value.label}</span>
        {!disabled && (
          <button type="button" className="link-btn" onClick={() => { setOpen(true); setQ(""); }}>
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="picker" ref={boxRef}>
      <input
        id={id}
        type="search"
        placeholder={placeholder || `Search ${parent.label.toLowerCase()}…`}
        value={q}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {open && (
        <div className="picker-menu">
          {loading && <div className="picker-empty">Searching…</div>}
          {!loading && rows.length === 0 && <div className="picker-empty">No matches</div>}
          {!loading &&
            rows.map((r) => (
              <button
                type="button"
                key={r.Id}
                className={`picker-item ${r.Active === false ? "inactive" : ""}`}
                onClick={() => {
                  onChange({ id: r.Id, label: String(r[parent.parentDisplayField] || `#${r.Id}`) }, r);
                  setOpen(false);
                }}
              >
                <span>{r[parent.parentDisplayField] || `#${r.Id}`}{r.Active === false ? " (inactive)" : ""}</span>
                <span className="muted small">{sub(r)}</span>
              </button>
            ))}
          {isPatients && pmod?.canWrite && !creating && (
            <button
              type="button"
              className="picker-item create"
              onClick={() => {
                const defaults: Record<string, unknown> = {};
                for (const f of pmod.fields) if (f.defaultValue !== undefined) defaults[f.name] = f.defaultValue;
                setCreating(true);
                setDraft({ ...defaults, "Patient Name": q.toUpperCase().trim() });
              }}
            >
              + New patient{q ? ` “${q}”` : ""}
            </button>
          )}
          {creating && pmod && (
            <div className="picker-create">
              {pmod.fields.filter((f) => f.form && f.name !== "Notes").map((f) => (
                <label key={f.name} className="field">
                  <span>{f.label}{f.required && " *"}</span>
                  <FieldInput field={f} value={draft[f.name]} onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))} />
                </label>
              ))}
              <div className="row gap">
                <button type="button" className="btn primary sm" onClick={createNew}>Create & select</button>
                <button type="button" className="btn sm" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
