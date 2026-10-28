"use client";
import { createContext, useContext } from "react";
import type { RModule } from "@/lib/schema";

export interface Me {
  uid: number;
  email: string;
  name: string;
  role: "Admin" | "Staff";
}
interface Ctx {
  me: Me;
  modules: RModule[];
}
const C = createContext<Ctx | null>(null);

export function SchemaProvider({ me, modules, children }: Ctx & { children: React.ReactNode }) {
  return <C.Provider value={{ me, modules }}>{children}</C.Provider>;
}
export function usePortal() {
  const v = useContext(C);
  if (!v) throw new Error("usePortal outside provider");
  return v;
}
export function useModule(key: string) {
  return usePortal().modules.find((m) => m.key === key);
}
