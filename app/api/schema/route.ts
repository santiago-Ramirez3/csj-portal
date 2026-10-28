import { requireUser, route } from "@/lib/api";
import { clientSchema, invalidateSchema } from "@/lib/schema";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const me = await requireUser(req);
  if (req.nextUrl.searchParams.get("refresh") === "1" && me.role === "Admin") invalidateSchema();
  return { modules: await clientSchema(me.role) };
});
