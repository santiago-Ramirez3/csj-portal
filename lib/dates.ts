// Date helpers safe for server and client.
export function todayISO(tz = "America/Detroit"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // en-CA gives YYYY-MM-DD
}
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function fmtDate(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : s;
}
export function fmtDateTime(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v).replace(" ", "T"));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}
