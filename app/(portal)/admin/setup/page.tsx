import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";
import { SetupView } from "@/components/SetupView";
export default async function Page() {
  const me = await currentUser();
  if (me?.role !== "Admin") notFound();
  return <SetupView />;
}
