import { notFound } from "next/navigation";
import { currentUser } from "@/lib/session";
import { UsersAdmin } from "@/components/UsersAdmin";
export default async function Page() {
  const me = await currentUser();
  if (me?.role !== "Admin") notFound();
  return <UsersAdmin />;
}
