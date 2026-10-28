import "server-only";
import bcrypt from "bcryptjs";
import { createRecord, env, getRecord, listRecords, nc, updateRecord, w } from "./nocodb";
import { getSchema, invalidateSchema } from "./schema";
import { USERS_TABLE, type Role } from "./modules";

export interface PortalUser {
  Id: number;
  Email: string;
  "Full Name"?: string;
  Role?: Role;
  Active?: boolean;
  "Password Hash"?: string;
  "Last Login"?: string;
}

export function publicUser(u: PortalUser) {
  return {
    id: u.Id,
    email: u.Email,
    name: u["Full Name"] || "",
    role: (u.Role === "Admin" ? "Admin" : "Staff") as Role,
    active: !!u.Active,
    lastLogin: u["Last Login"] || null,
  };
}

async function createUsersTable() {
  const { baseId } = env();
  const fields = [
    { title: "Email", type: "SingleLineText" },
    { title: "Full Name", type: "SingleLineText" },
    {
      title: "Role",
      type: "SingleSelect",
      default_value: "Staff",
      options: { choices: [{ title: "Admin", color: "#7D26CD" }, { title: "Staff", color: "#36BFFF" }] },
    },
    { title: "Active", type: "Checkbox" },
    { title: "Password Hash", type: "SingleLineText", description: "bcrypt hash - managed by the portal" },
    { title: "Last Login", type: "DateTime" },
  ];
  try {
    await nc(`/api/v3/meta/bases/${baseId}/tables`, {
      method: "POST",
      body: { title: USERS_TABLE, description: "Users of the CSJ portal (managed from the portal).", fields },
    });
  } catch {
    // v2 fallback
    await nc(`/api/v2/meta/bases/${baseId}/tables`, {
      method: "POST",
      body: {
        table_name: "portal_users",
        title: USERS_TABLE,
        columns: [
          { column_name: "id", title: "Id", uidt: "ID" },
          { column_name: "email", title: "Email", uidt: "SingleLineText" },
          { column_name: "full_name", title: "Full Name", uidt: "SingleLineText" },
          { column_name: "role", title: "Role", uidt: "SingleSelect", dtxp: "'Admin','Staff'" },
          { column_name: "active", title: "Active", uidt: "Checkbox" },
          { column_name: "password_hash", title: "Password Hash", uidt: "SingleLineText" },
          { column_name: "last_login", title: "Last Login", uidt: "DateTime" },
        ],
      },
    });
  }
  invalidateSchema();
}

export async function usersTableId(create = false): Promise<string | null> {
  let s = await getSchema();
  if (!s.tables[USERS_TABLE] && create) {
    await createUsersTable();
    s = await getSchema();
  }
  return s.tables[USERS_TABLE]?.id || null;
}

export async function findUserByEmail(email: string): Promise<PortalUser | null> {
  const t = await usersTableId();
  if (!t) return null;
  const r = await listRecords(t, { where: w.eq("Email", email.toLowerCase().trim()), limit: 1 });
  return (r.list[0] as PortalUser) || null;
}

export async function countUsers(): Promise<number> {
  const t = await usersTableId();
  if (!t) return 0;
  const r = await listRecords(t, { limit: 1, fields: "Id" });
  return r.pageInfo?.totalRows ?? r.list.length;
}

export async function listUsers() {
  const t = await usersTableId();
  if (!t) return [];
  const r = await listRecords(t, { limit: 200, sort: "Email" });
  return (r.list as PortalUser[]).map(publicUser);
}

export function validatePassword(p: string): string | null {
  if (typeof p !== "string" || p.length < 10) return "Password must have at least 10 characters";
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "Password must include letters and numbers";
  return null;
}

export async function createUser(input: { email: string; name: string; role: Role; password: string }) {
  const t = await usersTableId(true);
  if (!t) throw new Error("Portal Users table not available");
  const email = input.email.toLowerCase().trim();
  if (await findUserByEmail(email)) throw new Error("A user with this email already exists");
  const hash = await bcrypt.hash(input.password, 11);
  const r = await createRecord(t, {
    Email: email,
    "Full Name": input.name.trim(),
    Role: input.role === "Admin" ? "Admin" : "Staff",
    Active: true,
    "Password Hash": hash,
  });
  userCache.delete(r.Id);
  return r.Id;
}

export async function updateUser(
  id: number,
  patch: { name?: string; role?: Role; active?: boolean; password?: string }
) {
  const t = await usersTableId();
  if (!t) throw new Error("Portal Users table not available");
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields["Full Name"] = patch.name.trim();
  if (patch.role !== undefined) fields.Role = patch.role === "Admin" ? "Admin" : "Staff";
  if (patch.active !== undefined) fields.Active = !!patch.active;
  if (patch.password !== undefined) fields["Password Hash"] = await bcrypt.hash(patch.password, 11);
  await updateRecord(t, id, fields);
  userCache.delete(id);
}

export async function getUser(id: number): Promise<PortalUser | null> {
  const t = await usersTableId();
  if (!t) return null;
  try {
    return (await getRecord(t, id)) as PortalUser;
  } catch {
    return null;
  }
}

export async function touchLastLogin(id: number) {
  const t = await usersTableId();
  if (!t) return;
  try {
    await updateRecord(t, id, { "Last Login": new Date().toISOString().slice(0, 19).replace("T", " ") });
  } catch {
    /* non critical */
  }
}

export async function checkPassword(u: PortalUser, password: string) {
  if (!u["Password Hash"]) return false;
  return bcrypt.compare(password, u["Password Hash"]);
}

// Short cache so deactivated users lose access within a minute without a NocoDB call per request.
const userCache = new Map<number, { at: number; user: PortalUser | null }>();
export async function getUserCached(id: number): Promise<PortalUser | null> {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.user;
  const user = await getUser(id);
  userCache.set(id, { at: Date.now(), user });
  return user;
}
