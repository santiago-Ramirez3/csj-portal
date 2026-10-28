"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtDate } from "@/lib/dates";
import { useModule, usePortal } from "./SchemaContext";
import { DisplayValue } from "./fields";

type Card = { module: string; label: string; status: string; n: number | null; tone: string };

export function Dashboard() {
  const { me } = usePortal();
  const coord = useModule("coordination");
  const [data, setData] = useState<{ today: string; cards: Card[]; upcoming: any[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api("/api/dashboard").then(setData).catch((e) => setErr(e.message));
  }, []);
  const f = (name: string) => coord?.fields.find((x) => x.name === name);
  const statusCols = ["Clearance", "Auth", "Verification", "Transportation", "Status"];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Welcome{me.name ? `, ${me.name.split(" ")[0]}` : ""}</h1>
          <p className="muted">{data ? `Today is ${fmtDate(data.today)}` : "Loading…"}</p>
        </div>
      </div>
      {err && <div className="notice err">{err}</div>}
      <div className="cards">
        {data?.cards.map((c) => (
          <Link key={c.label} href={`/${c.module}?status=${encodeURIComponent(c.status)}`} className={`card tone-${c.tone}`}>
            <div className="card-n">{c.n ?? "—"}</div>
            <div className="card-l">{c.label}</div>
          </Link>
        ))}
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Procedures in the next 7 days</h2>
          <Link className="link-btn" href="/coordination">Open coordination →</Link>
        </div>
        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.upcoming.length === 0 ? (
          <p className="muted">No procedures scheduled in the next 7 days.</p>
        ) : (
          <div className="mini-table-wrap">
            <table className="mini-table">
              <thead>
                <tr>
                  <th>DOS</th>
                  <th>Patient</th>
                  <th>Procedure</th>
                  {statusCols.map((c) => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((r) => (
                  <tr key={r.Id}>
                    <td>{fmtDate(r["Date of Service"])}</td>
                    <td><Link href={`/coordination?open=${r.Id}`}>{r["Patient Name"]}</Link></td>
                    <td><span className="clip">{r.__parents?.procedure?.label || "—"}</span></td>
                    {statusCols.map((c) => <td key={c}>{f(c) ? <DisplayValue field={f(c)!} value={r[c]} /> : "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
