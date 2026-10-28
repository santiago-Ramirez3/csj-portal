"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/dates";
import { useToast } from "./Toast";

type M = {
  key: string;
  table: string;
  found: boolean;
  rows: number | null;
  missingFields: string[];
  parents: { label: string; linkOk: boolean; inverseField: string | null }[];
  children: { label: string; linkOk: boolean }[];
};

export function SetupView() {
  const toast = useToast();
  const [d, setD] = useState<{ baseId: string; loadedAt: number; usersTable: boolean; modules: M[] } | null>(null);
  const load = useCallback(
    (refresh = false) => api(`/api/setup${refresh ? "?refresh=1" : ""}`).then(setD).catch((e) => toast(e.message, "err")),
    [toast]
  );
  useEffect(() => {
    load();
  }, [load]);
  const ok = (b: boolean) => <span className={`status-dot ${b ? "ok" : "bad"}`}>{b ? "OK" : "Missing"}</span>;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Setup check</h1>
          <p className="muted">
            {d ? <>Base <code>{d.baseId}</code> · schema loaded {fmtDateTime(new Date(d.loadedAt).toISOString())}</> : "Loading…"}
          </p>
        </div>
        <button
          className="btn"
          onClick={async () => {
            await load(true);
            toast("Schema reloaded from NocoDB. Reload the page to see new dropdown options.");
          }}
        >
          Reload schema from NocoDB
        </button>
      </div>
      {d && (
        <>
          <div className="panel"><strong>Portal Users table:</strong> {ok(d.usersTable)}</div>
          <div className="grid-wrap">
            <table className="grid">
              <thead><tr><th>Module</th><th>NocoDB table</th><th>Found</th><th>Records</th><th>Missing fields</th><th>Parent links</th><th>Related lists</th></tr></thead>
              <tbody>
                {d.modules.map((m) => (
                  <tr key={m.key} className="static">
                    <td>{m.key}</td>
                    <td>{m.table}</td>
                    <td>{ok(m.found)}</td>
                    <td>{m.rows ?? "—"}</td>
                    <td>{m.missingFields.length ? <span className="bad-text">{m.missingFields.join(", ")}</span> : <span className="muted">none</span>}</td>
                    <td>
                      {m.parents.length === 0 ? <span className="muted">—</span> : m.parents.map((p) => (
                        <div key={p.label} className="small">{p.label}: {ok(p.linkOk)} {p.inverseField ? <span className="muted">(shown via “{p.inverseField}”)</span> : <span className="muted">(inverse field not detected)</span>}</div>
                      ))}
                    </td>
                    <td>
                      {m.children.length === 0 ? <span className="muted">—</span> : m.children.map((c) => (
                        <div key={c.label} className="small">{c.label}: {ok(c.linkOk)}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
