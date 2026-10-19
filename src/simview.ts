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

/** "en" (the default: developer studio, landing page) or "id" (the owner app). */
export type Locale = "en" | "id";

/** Thousands with dots, as Indonesians write them: 1.007.600. */
const dots = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const rupiah = (n: number, locale: Locale = "en") => (locale === "id" ? `Rp${dots(n)}` : `Rp${n.toLocaleString("en-US")}`);
export const juta = (n: number, locale: Locale = "en") => {
  const v = (n / 1e6).toFixed(1).replace(/\.0$/, "");
  return `Rp${locale === "id" ? v.replace(".", ",") : v} jt`;
};
/** Under a million in full rupiah, above it in juta. */
export const money = (n: number, locale: Locale = "en") => (n >= 1_000_000 ? juta(n, locale) : rupiah(n, locale));

/** What happened on `date`, one plain sentence per kind of event. */
export function dayLines(events: SimEventLike[], date: string, locale: Locale = "en"): string[] {
  const today = events.filter((e) => e.date === date);
  const of = (t: string) => today.filter((e) => e.type === t);
  const id = locale === "id";
  const m = (n: number) => money(n, locale);
  const lines: string[] = [];
  const invoices = of("invoice");
  if (invoices.length) lines.push(id ? `${invoices.length} tagihan dikirim` : `${invoices.length} invoices sent`);
  const payments = of("payment");
  if (payments.length)
    lines.push(id ? `${payments.length} pembayaran masuk, ${m(sum(payments))}` : `${payments.length} payment${payments.length > 1 ? "s" : ""} in, ${m(sum(payments))}`);
  const credits = of("credit");
  if (credits.length) lines.push(id ? `${credits.length} kelebihan bayar jadi saldo` : `${credits.length} overpayment kept as credit`);
  const reminders = of("reminder");
  if (reminders.length) lines.push(id ? `${reminders.length} pengingat dikirim` : `${reminders.length} reminders sent`);
  const fees = of("late_fee");
  const fee = rupiah(fees[0]?.amount ?? 0, locale);
  if (fees.length) lines.push(id ? `${fees.length} denda ${fee} ditambahkan` : `${fees.length} late fee${fees.length > 1 ? "s" : ""} of ${fee}`);
  const notices = of("notice");
  if (notices.length) lines.push(id ? `${notices.length} surat peringatan dikirim` : `${notices.length} exit notices sent`);
  const kpi = of("kpi_alert")[0];
  if (kpi)
    lines.push(
      id
        ? `${juta(kpi.amount ?? 0, locale)} terkumpul sampai tanggal ${Number(kpi.date.slice(8, 10))}, kamu sudah dikabari`
        : `${juta(kpi.amount ?? 0)} collected by the 15th, owner alerted`,
    );
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

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2026-11-15" -> "Nov 15" ("15 Nov" in Indonesian). */
export function shortDate(date: string, locale: Locale = "en"): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (locale === "id") return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`;
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
}
