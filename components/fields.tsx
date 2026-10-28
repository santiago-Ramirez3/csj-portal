"use client";
import { useEffect, useRef, useState } from "react";
import type { RField } from "@/lib/schema";
import { fmtDate, fmtDateTime } from "@/lib/dates";

export function Pill({ value, field }: { value: unknown; field: RField }) {
  if (value === null || value === undefined || value === "") return <span className="muted">—</span>;
  const c = field.choices?.find((x) => x.title === value)?.color || "#9aa5b1";
  return (
    <span className="pill" style={{ background: `${c}22`, borderColor: `${c}66` }}>
      <span className="dot" style={{ background: c }} />
      {String(value)}
    </span>
  );
}

export function DisplayValue({ field, value }: { field: RField; value: unknown }) {
  switch (field.kind) {
    case "select":
      return <Pill value={value} field={field} />;
    case "date":
      return value ? <span>{fmtDate(value)}</span> : <span className="muted">—</span>;
    case "datetime":
      return value ? <span>{fmtDateTime(value)}</span> : <span className="muted">—</span>;
    case "checkbox":
      return <span className={`check ${value ? "on" : ""}`}>{value ? "✓" : ""}</span>;
    default:
      return value === null || value === undefined || value === "" ? (
        <span className="muted">—</span>
      ) : (
        <span className="clip" title={String(value)}>{String(value)}</span>
      );
  }
}

export function FieldInput({
  field,
  value,
  onChange,
  disabled,
  autoFocus,
  id,
}: {
  field: RField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const v = value ?? "";
  switch (field.kind) {
    case "select":
      return (
        <select id={id} value={String(v)} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} autoFocus={autoFocus}>
          <option value="">—</option>
          {field.choices?.map((c) => (
            <option key={c.title} value={c.title}>{c.title}</option>
          ))}
        </select>
      );
    case "date":
      return <input id={id} type="date" value={String(v).slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} autoFocus={autoFocus} />;
    case "checkbox":
      return (
        <label className="checkbox">
          <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} autoFocus={autoFocus} />
          <span>{value ? "Yes" : "No"}</span>
        </label>
      );
    case "longtext":
      return <textarea id={id} rows={4} value={String(v)} onChange={(e) => onChange(e.target.value)} disabled={disabled} autoFocus={autoFocus} />;
    case "number":
      return <input id={id} type="number" value={String(v)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} disabled={disabled} autoFocus={autoFocus} />;
    case "readonly":
    case "datetime":
      return <DisplayValue field={field} value={value} />;
    default:
      return <input id={id} type="text" value={String(v)} onChange={(e) => onChange(e.target.value)} disabled={disabled} autoFocus={autoFocus} />;
  }
}

/** A grid cell that can be edited in place. Selects/checkboxes save on change; text/date save on blur or Enter. */
export function InlineCell({
  field,
  value,
  editable,
  onSave,
}: {
  field: RField;
  value: unknown;
  editable: boolean;
  onSave: (v: unknown) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(value);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);

  if (!editable) return <DisplayValue field={field} value={value} />;

  const commit = async (v: unknown) => {
    setEditing(false);
    if ((v ?? "") === (value ?? "")) return;
    setBusy(true);
    try {
      await onSave(v);
    } catch {
      setDraft(value);
    } finally {
      setBusy(false);
    }
  };

  if (field.kind === "checkbox") {
    return (
      <input
        type="checkbox"
        aria-label={field.label}
        checked={!!value}
        disabled={busy}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => commit(e.target.checked)}
      />
    );
  }

  if (field.kind === "select") {
    return (
      <div className={`cell-select ${busy ? "busy" : ""}`} onClick={(e) => e.stopPropagation()}>
        <Pill value={value} field={field} />
        <select aria-label={field.label} value={String(value ?? "")} disabled={busy} onChange={(e) => commit(e.target.value || null)}>
          <option value="">—</option>
          {field.choices?.map((c) => (
            <option key={c.title} value={c.title}>{c.title}</option>
          ))}
        </select>
      </div>
    );
  }

  if (!editing) {
    return (
      <div
        className={`cell-edit ${busy ? "busy" : ""}`}
        title="Click to edit"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <DisplayValue field={field} value={value} />
      </div>
    );
  }

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()} className="cell-input">
      {field.kind === "date" ? (
        <input
          type="date"
          autoFocus
          value={String(draft ?? "").slice(0, 10)}
          onChange={(e) => setDraft(e.target.value || null)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft);
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
        />
      ) : (
        <input
          type="text"
          autoFocus
          value={String(draft ?? "")}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft);
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
        />
      )}
    </div>
  );
}
