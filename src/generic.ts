import { z } from "zod";

/**
 * The generic pack: any SOP whose rules have a clear trigger, condition and action
 * ("Reeve - SOP Inputs and Rule Types"). Records come from a connector (a Google Sheet, a CSV,
 * a CRM, a POS); actions are connector tools (send a WhatsApp, an email, create a task). The
 * domain packs (rent, minimarket) stay as tuned verticals; this one runs whatever else an owner writes.
 *
 * Kept flat (no recursion) so every model's structured output can produce it.
 */

const base = {
  id: z.string().describe("R1, R2, ..."),
  title: z.string().describe("One-line human-readable rule, in the SOP's language"),
  source_quote: z.string().describe("The exact SOP phrase this card comes from"),
};

export const ConditionOp = z.enum(["lt", "lte", "gt", "gte", "eq", "neq", "days_until_lte", "days_since_gte", "empty", "not_empty"]);
export type ConditionOp = z.infer<typeof ConditionOp>;

export const GenericCondition = z.object({
  field: z.string().describe("A field of the record, e.g. stock, status, due_date"),
  op: ConditionOp.describe(
    "lt/lte/gt/gte: numeric comparison; eq/neq: text, case-insensitive; days_until_lte: the date field is between today and N days ahead; days_since_gte: the date field is at least N days ago; empty/not_empty: no value needed",
  ),
  value: z.union([z.number(), z.string()]).nullable().describe("The number, text or day count compared against; null for empty/not_empty"),
});
export type GenericCondition = z.infer<typeof GenericCondition>;

export const Schedule = z.object({
  every: z.enum(["day", "week", "month"]),
  weekday: z.number().int().nullable().describe("every=week: 0 = Monday ... 6 = Sunday"),
  day_of_month: z.number().int().nullable().describe("every=month: 1-28"),
});
export type Schedule = z.infer<typeof Schedule>;

export const ToolArg = z.object({
  name: z.string().describe("The tool's argument name"),
  template: z.string().describe("Text with {field} placeholders filled from the record, e.g. 'Halo {name}, tagihan {amount} jatuh tempo {due_date}'"),
});

export const GenericRuleCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("generic_rule"),
  schedule: Schedule,
  match: z.enum(["all", "any"]).describe("Whether all conditions or any one must hold"),
  conditions: z.array(GenericCondition),
  action: z.object({
    connector: z.string().describe("Where the action runs, e.g. whatsapp, gmail, googlesheets, slack, or log when no connector fits"),
    tool: z.string().describe("The connector's tool, e.g. WHATSAPP_SEND_MESSAGE, GMAIL_SEND_EMAIL; or LOG"),
    args: z.array(ToolArg),
    amount_field: z.string().nullable().describe("A money field of the record this action is about, so approval limits can apply"),
  }),
  once_per_record: z.boolean().describe("true: at most once per record (e.g. one welcome message); false: every scheduled day the conditions hold"),
});

export const GenericApprovalCard = z.object({
  ...base,
  kind: z.literal("constraint"),
  type: z.literal("generic_approval"),
  tool: z.string().describe("The tool this limit applies to, or * for every action"),
  amount_above: z.number().describe("Actions about more than this amount (IDR) wait for the owner's approval instead of running"),
});

export const GenericNeverCard = z.object({
  ...base,
  kind: z.literal("constraint"),
  type: z.literal("generic_never"),
  tool: z.string().describe("The tool that must never run when the conditions hold, or * for any"),
  match: z.enum(["all", "any"]),
  conditions: z.array(GenericCondition),
});

export const GenericKpiCard = z.object({
  ...base,
  kind: z.literal("kpi"),
  type: z.literal("generic_kpi"),
  schedule: Schedule,
  aggregate: z.enum(["sum", "count"]),
  field: z.string().nullable().describe("aggregate=sum: the numeric field to add up"),
  match: z.enum(["all", "any"]),
  conditions: z.array(GenericCondition).describe("Which records count; empty = all"),
  alert_if: z.enum(["below", "above"]),
  threshold: z.number(),
});

export const GENERIC_CARD_TYPES = ["generic_rule", "generic_approval", "generic_never", "generic_kpi"] as const;

/** What the rules are about and where the records come from. */
export const GenericData = z.object({
  entity: z.string().describe("One record, e.g. Customer, Order, Student, Ticket"),
  entity_plural: z.string(),
  key_field: z.string().describe("The field that identifies a record, e.g. id, order_no, phone"),
  fields: z.array(z.object({ name: z.string(), type: z.enum(["number", "text", "date"]) })),
  source: z.object({
    connector: z.string().describe("Where the records live, e.g. googlesheets, csv, shopify, hubspot"),
    tool: z.string().nullable().describe("The connector's read tool, if known, e.g. GOOGLESHEETS_BATCH_GET"),
  }),
});
export type GenericData = z.infer<typeof GenericData>;

/** A generic scenario: records as they stand on day 0, plus field changes on later days. */
export const GenericScenario = z.object({
  pack: z.literal("generic"),
  start_date: z.string(),
  days: z.number().int(),
  key_field: z.string(),
  records: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
  updates: z.array(z.object({ day: z.number().int(), key: z.string(), field: z.string(), value: z.union([z.string(), z.number(), z.null()]) })),
});
export type GenericScenario = z.infer<typeof GenericScenario>;

// ── Condition semantics, written once for the Auditor (TypeScript). The Builder's Python is separate. ──

const DAY = 86_400_000;
const toDay = (s: string) => {
  const t = Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
};
const asNumber = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v.replace(/[^0-9.-]/g, "")))) return Number(v.replace(/[^0-9.-]/g, ""));
  return null;
};

export function conditionHolds(c: GenericCondition, rec: Record<string, unknown>, today: string): boolean {
  const v = rec[c.field];
  switch (c.op) {
    case "empty":
      return v === null || v === undefined || String(v).trim() === "";
    case "not_empty":
      return !(v === null || v === undefined || String(v).trim() === "");
    case "eq":
    case "neq": {
      const same = String(v ?? "").trim().toLowerCase() === String(c.value ?? "").trim().toLowerCase();
      return c.op === "eq" ? same : !same;
    }
    case "days_until_lte":
    case "days_since_gte": {
      const d = typeof v === "string" ? toDay(v) : null;
      const t = toDay(today)!;
      const n = asNumber(c.value);
      if (d === null || n === null) return false;
      const until = Math.round((d - t) / DAY);
      return c.op === "days_until_lte" ? until >= 0 && until <= n : -until >= n;
    }
    default: {
      const x = asNumber(v);
      const n = asNumber(c.value);
      if (x === null || n === null) return false;
      return c.op === "lt" ? x < n : c.op === "lte" ? x <= n : c.op === "gt" ? x > n : x >= n;
    }
  }
}

export const conditionsHold = (match: "all" | "any", cs: GenericCondition[], rec: Record<string, unknown>, today: string) =>
  cs.length === 0 ? true : match === "all" ? cs.every((c) => conditionHolds(c, rec, today)) : cs.some((c) => conditionHolds(c, rec, today));

export function scheduleFires(s: Schedule, today: string): boolean {
  const d = new Date(`${today}T00:00:00Z`);
  if (s.every === "week") return ((d.getUTCDay() + 6) % 7) === s.weekday;
  if (s.every === "month") return d.getUTCDate() === s.day_of_month;
  return true;
}

export const renderTemplate = (t: string, rec: Record<string, unknown>) => t.replace(/\{([^{}]+)\}/g, (_, f: string) => String(rec[f.trim()] ?? ""));

export { asNumber as genericNumber };

const shift = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Two field values on either side of a condition's boundary: `pass` makes it hold, `fail` is the nearest value that does not. */
export function boundaryValues(c: GenericCondition, today: string): { pass: string | number; fail: string | number } {
  const n = typeof c.value === "number" ? c.value : Number(c.value);
  const text = String(c.value ?? "");
  switch (c.op) {
    case "lt":
      return { pass: n - 1, fail: n };
    case "lte":
      return { pass: n, fail: n + 1 };
    case "gt":
      return { pass: n + 1, fail: n };
    case "gte":
      return { pass: n, fail: n - 1 };
    case "eq":
      return { pass: text, fail: `${text}-other` };
    case "neq":
      return { pass: `${text}-other`, fail: text };
    case "days_until_lte":
      return { pass: shift(today, n), fail: shift(today, n + 1) };
    case "days_since_gte":
      return { pass: shift(today, -n), fail: shift(today, -n + 1) };
    case "empty":
      return { pass: "", fail: "x" };
    case "not_empty":
      return { pass: "x", fail: "" };
  }
}

/** The first date on or after `from` the schedule fires, and the next one after it. */
export function firingDays(s: Schedule, from: string): [string, string] {
  let d = from;
  while (!scheduleFires(s, d)) d = shift(d, 1);
  let e = shift(d, 1);
  while (!scheduleFires(s, e)) e = shift(e, 1);
  return [d, e];
}

export { shift as shiftDate };
