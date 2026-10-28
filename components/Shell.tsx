"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { usePortal } from "./SchemaContext";
import { Modal } from "./Modal";
import { api } from "@/lib/client";
import { useToast } from "./Toast";

function ChangePassword({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  return (
    <Modal title="Change password" onClose={onClose}>
      <form
        className="record-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          if (next !== confirm) return setErr("New passwords do not match");
          try {
            await api("/api/me/password", { method: "POST", body: { current, next } });
            toast("Password updated");
            onClose();
          } catch (e: any) {
            setErr(e.message);
          }
        }}
      >
        <label className="field"><span>Current password</span><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
        <label className="field"><span>New password</span><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
        <label className="field"><span>Confirm new password</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
        <p className="muted small">At least 10 characters, with letters and numbers.</p>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions"><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary">Update password</button></div>
      </form>
    </Modal>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, modules } = usePortal();
  const path = usePathname();
  const [pw, setPw] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const work = modules.filter((m) => m.section === "Work" && !m.hidden);
  const admin = modules.filter((m) => m.section === "Admin" && !m.hidden);
  const item = (href: string, label: string) => (
    <Link key={href} href={href} className={`nav-item ${path === href ? "active" : ""}`} onClick={() => setNavOpen(false)}>
      {label}
    </Link>
  );
  return (
    <div className={`shell ${navOpen ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">CSJ</div>
          <div>
            <div className="brand-title">CSJ Portal</div>
            <div className="brand-sub">Auths & coordination</div>
          </div>
        </div>
        <nav>
          {item("/", "Dashboard")}
          <div className="nav-label">Work</div>
          {work.map((m) => item(`/${m.key}`, m.title))}
          {me.role === "Admin" && (
            <>
              <div className="nav-label">Admin</div>
              {admin.map((m) => item(`/${m.key}`, m.title))}
              {item("/admin/users", "Users")}
              {item("/admin/setup", "Setup")}
            </>
          )}
        </nav>
        <div className="me">
          <div className="me-name">{me.name || me.email}</div>
          <div className="me-sub">{me.email} · {me.role}</div>
          <div className="row gap">
            <button className="link-btn light" onClick={() => setPw(true)}>Change password</button>
            <button
              className="link-btn light"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <button className="nav-toggle" onClick={() => setNavOpen((v) => !v)} aria-label="Menu">☰</button>
      <main className="content">{children}</main>
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  );
}
