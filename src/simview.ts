/**
 * Plain-language views of a simulation's events, for the owner's screens (the PWA and the
 * landing page). Pure functions with no dependencies, so browsers can import them directly.
 */

export interface SimEventLike {
  date: string;
  tenant_id: string;
  type: string;
  amount?: number;
  invoice_id?: string;
  note?: string;
}

export type RoomStatus = "open" | "paid" | "partial" | "unpaid" | "notice";

export interface RoomView {
  id: string;
  status: RoomStatus;
  due: number;
  paid: number;
  fee: boolean;
  credit: boolean;
}

const sum = (xs: SimEventLike[]) => xs.reduce((s, e) => s + (e.amount ?? 0), 0);

export function tenantsOf(events: SimEventLike[]): string[] {
  return [...new Set(events.map((e) => e.tenant_id).filter((t) => t !== "-"))].sort();
}

/** Each room's position on `date` (YYYY-MM-DD) against its latest invoice. */
export function roomsAt(events: SimEventLike[], date: string): RoomView[] {
  return tenantsOf(events).map((id) => {
    const mine = events.filter((e) => e.tenant_id === id && e.date <= date);
    const invoice = mine.filter((e) => e.type === "invoice").at(-1);
    if (!invoice) return { id, status: "open", due: 0, paid: 0, fee: false, credit: false };
    const fees = mine.filter((e) => e.type === "late_fee" && e.invoice_id === invoice.invoice_id);
    const priorCredit = sum(mine.filter((e) => e.type === "credit" && e.date < invoice.date));
    const due = (invoice.amount ?? 0) + sum(fees) - priorCredit;
    const paid = sum(mine.filter((e) => e.type === "payment" && e.date >= invoice.date));
    const notice = mine.some((e) => e.type === "notice" && e.invoice_id === invoice.invoice_id);
    const status: RoomStatus = paid >= due ? "paid" : notice ? "notice" : paid > 0 ? "partial" : "unpaid";
    const credit = mine.some((e) => e.type === "credit" && e.date >= invoice.date);
    return { id, status, due, paid, fee: fees.length > 0, credit };
  });
}

export const rupiah = (n: number) => `Rp${n.toLocaleString("en-US")}`;
export const juta = (n: number) => `Rp${(n / 1e6).toFixed(1).replace(/\.0$/, "")} jt`;
/** Under a million in full rupiah, above it in juta. */
export const money = (n: number) => (n >= 1_000_000 ? juta(n) : rupiah(n));

/** What happened on `date`, one plain sentence per kind of event. */
export function dayLines(events: SimEventLike[], date: string): string[] {
  const today = events.filter((e) => e.date === date);
  const of = (t: string) => today.filter((e) => e.type === t);
  const lines: string[] = [];
  const invoices = of("invoice");
  if (invoices.length) lines.push(`${invoices.length} invoices sent`);
  const payments = of("payment");
  if (payments.length) lines.push(`${payments.length} payment${payments.length > 1 ? "s" : ""} in, ${money(sum(payments))}`);
  const credits = of("credit");
  if (credits.length) lines.push(`${credits.length} overpayment kept as credit`);
  const reminders = of("reminder");
  if (reminders.length) lines.push(`${reminders.length} reminders sent`);
  const fees = of("late_fee");
  if (fees.length) lines.push(`${fees.length} late fee${fees.length > 1 ? "s" : ""} of ${rupiah(fees[0]!.amount ?? 0)}`);
  const notices = of("notice");
  if (notices.length) lines.push(`${notices.length} exit notices sent`);
  const kpi = of("kpi_alert")[0];
  if (kpi) lines.push(`${juta(kpi.amount ?? 0)} collected by the 15th, owner alerted`);
  return lines;
}

/** Days (YYYY-MM-DD) on which anything happened, in order. */
export function eventDays(events: SimEventLike[]): string[] {
  return [...new Set(events.map((e) => e.date))].sort();
}

/** Money collected in `date`'s month up to and including `date`. */
export function collectedBy(events: SimEventLike[], date: string): number {
  const month = date.slice(0, 7);
  return sum(events.filter((e) => e.type === "payment" && e.date.startsWith(month) && e.date <= date));
}

/** Add `n` days to a YYYY-MM-DD date. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-11-15" -> "Nov 15". */
export function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
}
