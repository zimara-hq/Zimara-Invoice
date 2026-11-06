/** Wall-clock parts in Asia/Riyadh. Issue date and time come from the server clock only. */
export function riyadhNow(d = new Date()) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d)) p[x.type] = x.value;
  const hh = p.hour === "24" ? "00" : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hh}:${p.minute}:${p.second}`, year: p.year, ym: `${p.year}-${p.month}` };
}

export function money(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Riyadh" });
}

export function fmtDateTime(v: string | Date | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
}
