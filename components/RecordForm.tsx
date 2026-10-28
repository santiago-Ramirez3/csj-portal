"use client";
import { useMemo, useState } from "react";
import type { RModule } from "@/lib/schema";
import { FieldInput } from "./fields";
import { ParentPicker, type ParentValue } from "./ParentPicker";

export type FormResult = { fields: Record<string, unknown>; parents: Record<string, number | null> };

export function RecordForm({
  mod,
  row,
  submitLabel,
  onSubmit,
  onCancel,
  readOnly,
  presetParents,
}: {
  mod: RModule;
  row?: Record<string, any> | null;
  submitLabel: string;
  onSubmit: (r: FormResult) => Promise<void>;
  onCancel?: () => void;
  readOnly?: boolean;
  presetParents?: Record<string, ParentValue>;
}) {
  const isNew = !row;
  const initial = useMemo(() => {
    const v: Record<string, unknown> = {};
    for (const f of mod.fields) {
      if (row) v[f.name] = row[f.name] ?? null;
      else if (f.defaultValue !== undefined) v[f.name] = f.defaultValue;
    }
    return v;
  }, [mod, row]);
  const initialParents = useMemo(() => {
    const p: Record<string, ParentValue> = {};
    for (const par of mod.parents) p[par.key] = row?.__parents?.[par.key] ?? presetParents?.[par.key] ?? null;
    return p;
  }, [mod, row, presetParents]);

  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [parents, setParents] = useState<Record<string, ParentValue>>(initialParents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirtyFields = () => {
    if (isNew) return values;
    const d: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) if ((v ?? null) !== (initial[k] ?? null)) d[k] = v;
    return d;
  };
  const dirtyParents = () => {
    const d: Record<string, number | null> = {};
    for (const p of mod.parents) {
      const now = parents[p.key]?.id ?? null;
      const before = initialParents[p.key]?.id ?? null;
      if (isNew ? now !== null : now !== before) d[p.key] = now;
    }
    return d;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    for (const p of mod.parents) {
      if (p.required && !p.missing && !parents[p.key]) return setError(`${p.label} is required`);
    }
    const copied = new Set(mod.parents.flatMap((p) => (parents[p.key] ? Object.values(p.copy) : [])));
    for (const f of mod.fields) {
      if (f.required && f.form && !f.missing && !copied.has(f.name) && (values[f.name] === null || values[f.name] === undefined || values[f.name] === "")) {
        return setError(`${f.label} is required`);
      }
    }
    setBusy(true);
    try {
      await onSubmit({ fields: dirtyFields(), parents: dirtyParents() });
    } catch (err: any) {
      setError(err.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const formFields = mod.fields.filter((f) => f.form && !f.missing);

  return (
    <form className="record-form" onSubmit={submit}>
      {mod.parents.filter((p) => !p.missing).length > 0 && (
        <div className="form-grid">
          {mod.parents.filter((p) => !p.missing).map((p) => (
            <label key={p.key} className="field" htmlFor={`p-${p.key}`}>
              <span>{p.label}{p.required && " *"}</span>
              <ParentPicker
                id={`p-${p.key}`}
                parent={p}
                value={parents[p.key]}
                disabled={readOnly}
                onChange={(v, prow) => {
                  setParents((x) => ({ ...x, [p.key]: v }));
                  if (prow) {
                    setValues((vals) => {
                      const next = { ...vals };
                      for (const [from, to] of Object.entries(p.copy)) if (prow[from] !== undefined && prow[from] !== null) next[to] = prow[from];
                      return next;
                    });
                  }
                }}
              />
            </label>
          ))}
        </div>
      )}
      <div className="form-grid">
        {formFields.map((f) => (
          <label key={f.name} className={`field ${f.kind === "longtext" ? "full" : ""}`} htmlFor={`f-${f.name}`}>
            <span>{f.label}{f.required && " *"}</span>
            <FieldInput
              id={`f-${f.name}`}
              field={f}
              value={values[f.name]}
              disabled={readOnly}
              onChange={(v) => setValues((x) => ({ ...x, [f.name]: v }))}
            />
          </label>
        ))}
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!readOnly && (
        <div className="form-actions">
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        </div>
      )}
    </form>
  );
}
