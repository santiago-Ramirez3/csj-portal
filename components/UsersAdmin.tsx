"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/dates";
import { Modal } from "./Modal";
import { usePortal } from "./SchemaContext";
import { useToast } from "./Toast";

type U = { id: number; email: string; name: string; role: "Admin" | "Staff"; active: boolean; lastLogin: string | null };

export function UsersAdmin() {
  const { me } = usePortal();
  const toast = useToast();
  const [users, setUsers] = useState<U[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<U | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "Staff", password: "" });
  const [pw, setPw] = useState("");

  const load = useCallback(() => api<{ users: U[] }>("/api/users").then((r) => setUsers(r.users)).catch((e) => toast(e.message, "err")), [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (u: U, body: Record<string, unknown>, msg: string) => {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body });
      toast(msg);
      load();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">People who can sign in to the portal. Admins can manage users and catalogs.</p>
        </div>
        <button className="btn primary" onClick={() => { setForm({ email: "", name: "", role: "Staff", password: "" }); setAdding(true); }}>+ New user</button>
      </div>
      <div className="grid-wrap">
        <table className="grid">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="static">
                <td>{u.name || <span className="muted">—</span>}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={u.id === me.uid} onChange={(e) => patch(u, { role: e.target.value }, "Role updated")}>
                    <option>Staff</option>
                    <option>Admin</option>
                  </select>
                </td>
                <td>
                  <input type="checkbox" checked={u.active} disabled={u.id === me.uid} onChange={(e) => patch(u, { active: e.target.checked }, e.target.checked ? "User activated" : "User deactivated")} aria-label="Active" />
                </td>
                <td>{u.lastLogin ? fmtDateTime(u.lastLogin) : <span className="muted">never</span>}</td>
                <td><button className="link-btn" onClick={() => { setPw(""); setResetFor(u); }}>Reset password</button></td>
              </tr>
            ))}
            {users && users.length === 0 && <tr><td colSpan={6} className="empty">No users.</td></tr>}
          </tbody>
        </table>
      </div>

      {adding && (
        <Modal title="New user" onClose={() => setAdding(false)}>
          <form
            className="record-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/api/users", { method: "POST", body: form });
                toast("User created");
                setAdding(false);
                load();
              } catch (e: any) {
                toast(e.message, "err");
              }
            }}
          >
            <label className="field"><span>Full name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label className="field"><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label className="field"><span>Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>Staff</option><option>Admin</option></select></label>
            <label className="field"><span>Temporary password</span><input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
            <p className="muted small">At least 10 characters with letters and numbers. Share it securely; the user can change it after signing in.</p>
            <div className="form-actions"><button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary">Create user</button></div>
          </form>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`Reset password · ${resetFor.email}`} onClose={() => setResetFor(null)}>
          <form
            className="record-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await patch(resetFor, { password: pw }, "Password reset");
              setResetFor(null);
            }}
          >
            <label className="field"><span>New temporary password</span><input type="text" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
            <div className="form-actions"><button type="button" className="btn" onClick={() => setResetFor(null)}>Cancel</button><button className="btn primary">Reset</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
