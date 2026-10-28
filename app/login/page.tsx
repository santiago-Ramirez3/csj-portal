"use client";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("expired")) setNote("Your session ended. Please sign in again.");
  }, []);
  return (
    <div className="login-wrap">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          setBusy(true);
          try {
            const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Sign in failed");
            window.location.href = "/";
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="logo big">CSJ</div>
        <h1>CSJ Portal</h1>
        <p className="muted">Sign in to continue</p>
        {note && <div className="notice">{note}</div>}
        <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {err && <div className="form-error" role="alert">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
