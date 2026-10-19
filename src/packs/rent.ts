import type { Rulebook } from "../index";
import { collectedBy, dayLines, eventDays, juta, money, roomsAt, type SimEventLike } from "../simview";
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
  cardTypes: ["invoice_schedule", "reminder", "late_fee", "notice", "overpayment", "max_fee", "approval_threshold", "revenue_target"],
  connectors: ["Stripe, Xendit or Midtrans (invoices, payment links, refunds)", "WhatsApp or email (tenant messages)", "Google Sheets (tenant list)"],
  egress: ["api.stripe.com", "api.xendit.co", "api.midtrans.com"],

  days: eventDays,

  view(events: SimEventLike[], date: string, rulebook?: Rulebook) {
    const rooms = roomsAt(events, date);
    const target = rulebook?.cards.find((c) => c.type === "revenue_target");
    const targetAmount = target?.type === "revenue_target" ? target.monthly_target : undefined;
    const kpiEvent = events.find((e) => e.type === "kpi_alert" && e.date === date);
    const collected = kpiEvent?.amount ?? collectedBy(events, date);

    const kpis: PackKpi[] = [
      {
        id: "collected",
        label: "Collected this month",
        value: collected,
        display: juta(collected),
        target: targetAmount,
        targetDisplay: targetAmount ? juta(targetAmount) : undefined,
        note: targetAmount ? "A target, not a promise: Reeve measures it, warns you on the check day and suggests actions." : undefined,
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
              text: `Collected ${juta(e.amount ?? 0)} by the check day${targetAmount ? `, below the ${juta(targetAmount)} target` : ""}. ${owed.length} rooms still owe.`,
              options: ["Send reminders now", "Wait for the next reminder"],
              needsPasskey: false,
            }
          : {
              id: `refund-${e.date}-${i}`,
              date: e.date,
              text: `Refund of ${money(e.amount ?? 0)} for room ${e.tenant_id} is above your limit.`,
              options: ["Approve the refund", "Keep it as credit"],
              needsPasskey: true,
            },
      );

    return {
      kpis,
      stats: [
        { label: "paid", value: `${rooms.filter((r) => r.status === "paid").length}/${rooms.length}`, tone: "ok" },
        { label: "late fees", value: String(rooms.filter((r) => r.fee).length), tone: "warn" },
        { label: "exit notices", value: String(rooms.filter((r) => r.status === "notice").length), tone: "bad" },
      ],
      entities: rooms.map((r) => ({
        id: r.id,
        label: r.id.replace(/^K/, ""),
        status: r.status,
        detail:
          r.status === "open"
            ? "No invoice yet this month."
            : `Paid ${money(r.paid)} of ${money(r.due)} due${r.fee ? ", including a late fee" : ""}.`,
        flags: [...(r.fee ? ["late fee"] : []), ...(r.credit ? ["credit"] : [])],
      })),
      lines: dayLines(events, date),
      exceptions,
    };
  },
};
