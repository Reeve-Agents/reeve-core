import type { RuleCard, Rulebook, SimEvent } from "./index";

/**
 * Phase 4, Maintain: what changed between two versions of a rulebook, and what that change does
 * to the simulated month. Type-only imports, so the web app can use it without zod.
 */

export interface CardChange {
  kind: "added" | "removed" | "changed";
  /** The card in the new version (or the old one, if removed). */
  id: string;
  type: RuleCard["type"];
  title: string;
  /** For "changed": each field that differs. */
  fields: { field: string; before: unknown; after: unknown }[];
}

/** Cards a rulebook may hold several of; the rest are matched by type alone. */
const REPEATABLE = new Set<RuleCard["type"]>(["expiry_markdown"]);
const IGNORED = new Set(["id", "title", "source_quote"]);

const keyOf = (c: RuleCard) => (REPEATABLE.has(c.type) ? `${c.type}#${JSON.stringify(Object.entries(c).filter(([k]) => !IGNORED.has(k)).sort())}` : c.type);

function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { [prefix]: value };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
  return out;
}

export function diffRulebooks(before: Rulebook, after: Rulebook): CardChange[] {
  const old = new Map(before.cards.map((c) => [keyOf(c), c]));
  const next = new Map(after.cards.map((c) => [keyOf(c), c]));
  const changes: CardChange[] = [];
  for (const [key, c] of next) {
    const prev = old.get(key);
    if (!prev) {
      changes.push({ kind: "added", id: c.id, type: c.type, title: c.title, fields: [] });
      continue;
    }
    const a = flatten(prev);
    const b = flatten(c);
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((f) => !IGNORED.has(f) && JSON.stringify(a[f]) !== JSON.stringify(b[f]))
      .map((field) => ({ field, before: a[field], after: b[field] }));
    if (fields.length) changes.push({ kind: "changed", id: c.id, type: c.type, title: c.title, fields });
  }
  for (const [key, c] of old) if (!next.has(key)) changes.push({ kind: "removed", id: c.id, type: c.type, title: c.title, fields: [] });
  return changes;
}

export interface RunImpact {
  /** Month totals that moved (the engine's summary). */
  totals: { key: string; before: number; after: number }[];
  /** Per tenant or item: what it would see differently. */
  subjects: { id: string; changes: { type: SimEvent["type"]; count: [number, number]; amount: [number, number] }[] }[];
}

const NOT_DECISIONS = new Set<string>(["payment", "status", "day_close", "sales"]);
/** Messages quote a balance; their amount is not money the rules decided, so only how many counts. */
const MESSAGES = new Set<string>(["reminder", "notice", "stockout", "reorder_stopped", "supplier_switched"]);

const tally = (events: SimEvent[]) => {
  const m = new Map<string, Map<SimEvent["type"], { count: number; amount: number }>>();
  for (const e of events) {
    // Payments, sales and daily status are inputs or snapshots, not decisions the rules made.
    if (e.tenant_id === "-" || NOT_DECISIONS.has(e.type)) continue;
    const per = m.get(e.tenant_id) ?? new Map();
    const t = per.get(e.type) ?? { count: 0, amount: 0 };
    t.count += 1;
    if (!MESSAGES.has(e.type)) t.amount += e.amount ?? 0;
    per.set(e.type, t);
    m.set(e.tenant_id, per);
  }
  return m;
};

/** Same scenario, two versions of the rules: what each tenant (or item) would experience differently. */
export function compareRuns(
  before: { events: SimEvent[]; summary: Record<string, number> },
  after: { events: SimEvent[]; summary: Record<string, number> },
): RunImpact {
  const totals = [...new Set([...Object.keys(before.summary), ...Object.keys(after.summary)])]
    .map((key) => ({ key, before: before.summary[key] ?? 0, after: after.summary[key] ?? 0 }))
    .filter((t) => t.before !== t.after);
  const a = tally(before.events);
  const b = tally(after.events);
  const subjects = [...new Set([...a.keys(), ...b.keys()])]
    .sort()
    .map((id) => {
      const pa = a.get(id) ?? new Map();
      const pb = b.get(id) ?? new Map();
      const types = [...new Set([...pa.keys(), ...pb.keys()])] as SimEvent["type"][];
      const changes = types
        .map((type) => {
          const x = pa.get(type) ?? { count: 0, amount: 0 };
          const y = pb.get(type) ?? { count: 0, amount: 0 };
          return { type, count: [x.count, y.count] as [number, number], amount: [x.amount, y.amount] as [number, number] };
        })
        .filter((c) => c.count[0] !== c.count[1] || c.amount[0] !== c.amount[1]);
      return { id, changes };
    })
    .filter((s) => s.changes.length);
  return { totals, subjects };
}
