import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { getUserCached } from "@/lib/users";
import { clientSchema } from "@/lib/schema";
import { SchemaProvider } from "@/components/SchemaContext";
import { ToastProvider } from "@/components/Toast";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const s = await currentUser();
  if (!s) redirect("/login");
  const u = await getUserCached(s.uid);
  if (!u || !u.Active) redirect("/login?expired=1");
  const me = { ...s, role: u.Role === "Admin" ? ("Admin" as const) : ("Staff" as const), name: u["Full Name"] || s.name };
  let modules;
  try {
    modules = await clientSchema(me.role);
  } catch (e: any) {
    return (
      <div className="page">
        <h1>Cannot reach NocoDB</h1>
        <p className="muted">{e?.message}</p>
        <p>Check the NOCODB_URL, NOCODB_TOKEN and NOCODB_BASE_ID variables in Railway.</p>
      </div>
    );
  }
  return (
    <SchemaProvider me={me} modules={modules}>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </SchemaProvider>
  );
}
