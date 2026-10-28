"use client";
import { createContext, useCallback, useContext, useState } from "react";

type T = { id: number; text: string; kind: "ok" | "err" };
const C = createContext<(text: string, kind?: "ok" | "err") => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === "err" ? 7000 : 3000);
  }, []);
  return (
    <C.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </C.Provider>
  );
}
export const useToast = () => useContext(C);
