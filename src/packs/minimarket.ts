import type { Rulebook } from "../index";
import { eventDays, rupiah, type SimEventLike } from "../simview";
import type { DomainPack, PackEntity, PackException, PackKpi } from "./contract";

/** Minimarket stock and expiry: reorders, supplier fallback, markdowns before expiry, slow movers. Pack 2. */

const count = (events: SimEventLike[], type: string) => events.filter((e) => e.type === type);
const total = (events: SimEventLike[]) => events.reduce((s, e) => s + (e.amount ?? 0), 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function lines(events: SimEventLike[], date: string): string[] {
  const today = events.filter((e) => e.date === date);
  const out: string[] = [];
  const sales = count(today, "sales")[0];
  if (sales) out.push(`${sales.note ?? "sales"} sold, ${rupiah(sales.amount ?? 0)}`);
  const pos = count(today, "po_created");
  if (pos.length) {
    const bySupplier = new Map<string, number>();
    for (const p of pos) {
      const s = (p.note ?? "?").split(":")[0]!;
      bySupplier.set(s, (bySupplier.get(s) ?? 0) + 1);
    }
    out.push(`${plural(pos.length, "order")} placed (${[...bySupplier].map(([s, n]) => `${n} with Supplier ${s}`).join(", ")}), ${rupiah(total(pos))}`);
  }
  const received = count(today, "po_received");
  if (received.length) out.push(`${plural(received.length, "delivery", "deliveries")} received`);
  const switched = count(today, "supplier_switched");
  if (switched.length) out.push(`${plural(switched.length, "late order")} moved to the backup supplier`);
  const markdowns = count(today, "markdown");
  if (markdowns.length) out.push(`${plural(markdowns.length, "item")} marked down before expiry`);
  const writeoffs = count(today, "writeoff");
  if (writeoffs.length) out.push(`${plural(writeoffs.length, "item")} written off at expiry, ${rupiah(total(writeoffs))}`);
  const stockouts = count(today, "stockout");
  if (stockouts.length) out.push(`${plural(stockouts.length, "item")} ran out on the shelf`);
  const stopped = count(today, "reorder_stopped");
  if (stopped.length) out.push(`${plural(stopped.length, "slow mover")} no longer reordered`);
  const approval = count(today, "po_approval_request");
  if (approval.length) out.push(`${plural(approval.length, "order")} above your limit, waiting for you`);
  const kpi = count(today, "kpi_alert")[0];
  if (kpi) out.push(`${rupiah(kpi.amount ?? 0)} of stock expiring soon, owner alerted`);
  return out;
}

export const minimarketPack: DomainPack = {
  id: "minimarket",
  domain: "Stock and expiry",
  example: "a minimarket with 24 items",
  entity: { one: "Item", many: "Stock" },
  statuses: {
    ok: { label: "in stock", tone: "ok" },
    ordered: { label: "low, order on the way", tone: "idle" },
    low: { label: "low", tone: "bad" },
    out: { label: "out of stock", tone: "bad" },
    marked_down: { label: "marked down before expiry", tone: "warn" },
    stopped: { label: "slow mover, not reordered", tone: "idle" },
  },
  cardTypes: ["reorder_point", "supplier_fallback", "expiry_markdown", "slow_mover_stop", "po_approval_threshold", "markdown_floor", "expiring_value_limit"],
  connectors: ["POS (Moka, Majoo or Loyverse via Composio)", "Google Sheets (stock and expiry)", "Supplier email or WhatsApp (purchase orders)"],
  egress: ["sheets.googleapis.com", "the POS API host"],

  days: eventDays,

  view(events: SimEventLike[], date: string, rulebook?: Rulebook) {
    const upTo = events.filter((e) => e.date <= date);
    const limitCard = rulebook?.cards.find((c) => c.type === "expiring_value_limit");
    const limit = limitCard?.type === "expiring_value_limit" ? limitCard : undefined;
    const close = upTo.filter((e) => e.type === "day_close").at(-1);
    const expiring = close?.amount ?? 0;

    const kpis: PackKpi[] = [
      {
        id: "expiring",
        label: `Expiring within ${limit?.window_days ?? 30} days (at cost)`,
        value: expiring,
        display: rupiah(expiring),
        target: limit?.max_value,
        targetDisplay: limit ? rupiah(limit.max_value) : undefined,
        targetKind: "limit",
        note: limit ? "A limit, not a promise: Reeve marks stock down before it expires and warns you on the check day." : undefined,
        tone: limit && expiring > limit.max_value ? "warn" : "ok",
      },
    ];

    // Latest status per item, plus what is still waiting on the owner.
    const latest = new Map<string, SimEventLike & { label?: string }>();
    for (const e of upTo) if (e.type === "status") latest.set(e.tenant_id, e as SimEventLike & { label?: string });
    const pending = new Set<string>();
    for (const e of upTo) {
      if (e.type === "po_approval_request") pending.add(e.tenant_id);
      if (e.type === "po_created") pending.delete(e.tenant_id);
    }
    const lastMarkdown = new Map<string, string>();
    for (const e of upTo) if (e.type === "markdown" && e.note) lastMarkdown.set(e.tenant_id, e.note.split(",")[0]!);

    const entities: PackEntity[] = [...latest.values()]
      .sort((a, b) => a.tenant_id.localeCompare(b.tenant_id))
      .map((e) => ({
        id: e.tenant_id,
        label: e.tenant_id.replace(/^S/, ""),
        status: e.note ?? "ok",
        detail: `${e.label ?? e.tenant_id}: ${plural(e.amount ?? 0, "unit")} on the shelf.`,
        flags: [...(pending.has(e.tenant_id) ? ["waiting for your approval"] : []), ...(lastMarkdown.has(e.tenant_id) ? [lastMarkdown.get(e.tenant_id)!] : [])],
      }));

    const exceptions: PackException[] = upTo.flatMap((e): PackException[] => {
      if (e.type === "po_approval_request" && pending.has(e.tenant_id)) {
        const [supplier, qty] = (e.note ?? ":").split(":");
        const name = latest.get(e.tenant_id)?.label ?? e.tenant_id;
        return [
          {
            id: `po-${e.tenant_id}-${e.date}`,
            date: e.date,
            text: `Order ${qty} × ${name} from Supplier ${supplier} for ${rupiah(e.amount ?? 0)} is above your limit.`,
            options: ["Approve the order", "Order fewer", "Skip this week"],
            needsPasskey: true,
          },
        ];
      }
      if (e.type === "kpi_alert") {
        return [
          {
            id: `kpi-${e.date}`,
            date: e.date,
            text: `${rupiah(e.amount ?? 0)} of stock expires within ${limit?.window_days ?? 30} days${limit ? `, above your ${rupiah(limit.max_value)} limit` : ""}.`,
            options: ["Mark down further", "Ask the supplier to take it back", "Accept the risk"],
            needsPasskey: false,
          },
        ];
      }
      return [];
    });

    const n = entities.length;
    const fine = entities.filter((e) => e.status === "ok" || e.status === "ordered").length;
    const short = entities.filter((e) => e.status === "low" || e.status === "out").length;
    return {
      kpis,
      stats: [
        { label: "in stock", value: `${fine}/${n}`, tone: "ok" },
        { label: "low or out", value: String(short), tone: short ? "bad" : "ok" },
        { label: "marked down", value: String(entities.filter((e) => e.status === "marked_down").length), tone: "warn" },
      ],
      entities,
      lines: lines(events, date),
      exceptions,
    };
  },
};
