import type { Rulebook } from "../index";
import { collectedBy, dayLines, eventDays, juta, money, roomsAt, type Locale, type SimEventLike } from "../simview";
import type { DomainPack, PackException, PackKpi } from "./contract";

/** Rent collection: invoices, reminders, late fees and exit notices. First pack; the Kos Melati demo runs on it. */
export const rentPack: DomainPack = {
  id: "rent-collection",
  domain: "Rent collection",
  example: "a 30-room kos",
  entity: { one: "Room", many: "Rooms" },
  statuses: {
    open: { label: "no invoice yet", tone: "idle" },
    paid: { label: "paid", tone: "ok" },
    partial: { label: "part paid", tone: "warn" },
    unpaid: { label: "unpaid", tone: "idle" },
    notice: { label: "exit notice", tone: "bad" },
  },
  words: {
    id: {
      domain: "Tagihan sewa",
      example: "kos 30 kamar",
      entity: { one: "Kamar", many: "Kamar" },
      statuses: { open: "belum ditagih", paid: "lunas", partial: "bayar sebagian", unpaid: "belum bayar", notice: "surat peringatan" },
    },
  },
  cardTypes: ["invoice_schedule", "reminder", "late_fee", "notice", "overpayment", "max_fee", "approval_threshold", "revenue_target"],
  connectors: ["Stripe, Xendit or Midtrans (invoices, payment links, refunds)", "WhatsApp or email (tenant messages)", "Google Sheets (tenant list)"],
  egress: ["api.stripe.com", "api.xendit.co", "api.midtrans.com"],

  days: eventDays,

  view(events: SimEventLike[], date: string, rulebook?: Rulebook, locale: Locale = "en") {
    const id = locale === "id";
    const jt = (n: number) => juta(n, locale);
    const rp = (n: number) => money(n, locale);
    const rooms = roomsAt(events, date);
    const target = rulebook?.cards.find((c) => c.type === "revenue_target");
    const targetAmount = target?.type === "revenue_target" ? target.monthly_target : undefined;
    const kpiEvent = events.find((e) => e.type === "kpi_alert" && e.date === date);
    const collected = kpiEvent?.amount ?? collectedBy(events, date);

    const kpis: PackKpi[] = [
      {
        id: "collected",
        label: id ? "Terkumpul bulan ini" : "Collected this month",
        value: collected,
        display: jt(collected),
        target: targetAmount,
        targetDisplay: targetAmount ? jt(targetAmount) : undefined,
        note: targetAmount
          ? id
            ? "Ini target, bukan janji: Reeve mengukurnya, mengabari kamu di hari pengecekan, dan menyarankan langkah."
            : "A target, not a promise: Reeve measures it, warns you on the check day and suggests actions."
          : undefined,
        tone: targetAmount && collected < targetAmount ? "warn" : "ok",
      },
    ];

    const owed = rooms.filter((r) => r.status !== "paid" && r.status !== "open");
    const exceptions: PackException[] = events
      .filter((e) => e.date <= date && (e.type === "kpi_alert" || e.type === "refund_request"))
      .map((e, i) =>
        e.type === "kpi_alert"
          ? {
              id: `kpi-${e.date}`,
              date: e.date,
              text: id
                ? `Terkumpul ${jt(e.amount ?? 0)} sampai hari pengecekan${targetAmount ? `, di bawah target ${jt(targetAmount)}` : ""}. ${owed.length} kamar masih belum lunas.`
                : `Collected ${jt(e.amount ?? 0)} by the check day${targetAmount ? `, below the ${jt(targetAmount)} target` : ""}. ${owed.length} rooms still owe.`,
              options: id ? ["Kirim pengingat sekarang", "Tunggu pengingat berikutnya"] : ["Send reminders now", "Wait for the next reminder"],
              needsPasskey: false,
            }
          : {
              id: `refund-${e.date}-${i}`,
              date: e.date,
              text: id
                ? `Refund ${rp(e.amount ?? 0)} untuk kamar ${e.tenant_id} di atas batasmu.`
                : `Refund of ${rp(e.amount ?? 0)} for room ${e.tenant_id} is above your limit.`,
              options: id ? ["Setujui refund", "Simpan jadi saldo"] : ["Approve the refund", "Keep it as credit"],
              needsPasskey: true,
            },
      );

    return {
      kpis,
      stats: [
        { label: id ? "lunas" : "paid", value: `${rooms.filter((r) => r.status === "paid").length}/${rooms.length}`, tone: "ok" },
        { label: id ? "kena denda" : "late fees", value: String(rooms.filter((r) => r.fee).length), tone: "warn" },
        { label: id ? "surat peringatan" : "exit notices", value: String(rooms.filter((r) => r.status === "notice").length), tone: "bad" },
      ],
      entities: rooms.map((r) => ({
        id: r.id,
        label: r.id.replace(/^K/, ""),
        status: r.status,
        detail:
          r.status === "open"
            ? id
              ? "Belum ada tagihan bulan ini."
              : "No invoice yet this month."
            : id
              ? `Sudah bayar ${rp(r.paid)} dari tagihan ${rp(r.due)}${r.fee ? ", sudah termasuk denda" : ""}.`
              : `Paid ${rp(r.paid)} of ${rp(r.due)} due${r.fee ? ", including a late fee" : ""}.`,
        flags: [...(r.fee ? [id ? "denda" : "late fee"] : []), ...(r.credit ? [id ? "saldo" : "credit"] : [])],
      })),
      lines: dayLines(events, date, locale),
      exceptions,
    };
  },
};
