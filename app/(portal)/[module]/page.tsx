import { notFound } from "next/navigation";
import { getModule } from "@/lib/modules";
import { currentUser } from "@/lib/session";
import { ModuleView } from "@/components/ModuleView";

export default async function Page({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const spec = getModule(module);
  if (!spec || spec.hidden) notFound();
  const me = await currentUser();
  if (spec.section === "Admin" && me?.role !== "Admin") notFound();
  return <ModuleView key={module} moduleKey={module} />;
}
