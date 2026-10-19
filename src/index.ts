import { z } from "zod";
import { GenericApprovalCard, GenericData, GenericKpiCard, GenericNeverCard, GenericRuleCard, GenericScenario } from "./generic";

// Rule cards: the structured, human-readable form of an SOP.
// Kept free of numeric bounds so the same schema can drive LLM structured outputs;
// bounds are enforced afterwards by validateRulebook().

const base = {
  id: z.string().describe("Stable id such as R1, R2, ..."),
  title: z.string().describe("One-line human-readable rule, in the SOP's language"),
  source_quote: z.string().describe("The exact SOP phrase this card comes from"),
};

export const InvoiceScheduleCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("invoice_schedule"),
  day_of_month: z.number().int().describe("Day of the month invoices are issued (1-28)"),
});

export const ReminderCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("reminder"),
  days_after_due: z.array(z.number().int()).describe("Send a reminder this many days after the due date"),
});

export const LateFeeCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("late_fee"),
  days_after_due: z.number().int().describe("Fee applies once the invoice is this many days overdue"),
  percent: z.number().describe("Fee as a percent, e.g. 5 for 5%"),
  basis: z.enum(["rent", "outstanding"]).describe("Percent of the monthly rent or of the unpaid balance"),
  tenure_grace: z
    .object({
      min_months: z.number().int().describe("Tenants who have stayed at least this many months..."),
      extra_days: z.number().int().describe("...get this many extra days before the fee applies"),
    })
    .nullable(),
});

export const NoticeCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("notice"),
  days_after_due: z.number().int().describe("Send a formal notice to vacate this many days overdue"),
});

export const OverpaymentCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("overpayment"),
  policy: z.enum(["credit_next_invoice", "refund_with_approval"]),
});

export const MaxFeeCard = z.object({
  ...base,
  kind: z.literal("constraint"),
  type: z.literal("max_fee"),
  max_percent_of_rent: z.number().describe("Total late fees on one invoice may never exceed this percent of rent"),
});

export const ApprovalThresholdCard = z.object({
  ...base,
  kind: z.literal("constraint"),
  type: z.literal("approval_threshold"),
  refund_above: z.number().int().describe("Refunds above this amount (IDR) need the owner's approval"),
});

export const RevenueTargetCard = z.object({
  ...base,
  kind: z.literal("kpi"),
  type: z.literal("revenue_target"),
  monthly_target: z.number().int().describe("Monthly revenue target in IDR"),
  basis: z.enum(["collected", "invoiced"]),
  alert_day: z.number().int().describe("Day of month to check the projection and alert the owner"),
});

// Pack 2: minimarket stock and expiry (docs/PACKS.md).

export const ReorderPointCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("reorder_point"),
  below_units: z.number().int().describe("Reorder when stock on hand plus stock on order falls below this many units"),
  order_up_to_units: z.number().int().describe("Order enough to bring stock on hand plus on order up to this many units"),
  supplier: z.string().describe("Default supplier for purchase orders"),
});

export const SupplierFallbackCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("supplier_fallback"),
  late_days: z.number().int().describe("Switch the order once the supplier is this many days late"),
  backup_supplier: z.string(),
});

export const ExpiryMarkdownCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("expiry_markdown"),
  days_before_expiry: z.number().int().describe("Mark down this many days before the expiry date (H-n)"),
  percent: z.number().describe("Discount as a percent, e.g. 20 for 20% off"),
});

export const SlowMoverStopCard = z.object({
  ...base,
  kind: z.literal("rule"),
  type: z.literal("slow_mover_stop"),
  no_sale_days: z.number().int().describe("Stop reordering an item with no sale for this many days"),
});

export const PoApprovalCard = z.object({
  ...base,
  kind: z.literal("constraint"),
  type: z.literal("po_approval_threshold"),
  po_above: z.number().int().describe("Purchase orders above this value (IDR) need the owner's approval"),
});

export const MarkdownFloorCard = z.object({
  ...base,
  kind: z.literal("constraint"),
  type: z.literal("markdown_floor"),
  floor: z.enum(["cost"]).describe("A markdown may never take the price below this"),
});

export const ExpiringValueCard = z.object({
  ...base,
  kind: z.literal("kpi"),
  type: z.literal("expiring_value_limit"),
  max_value: z.number().int().describe("Alert when stock expiring within the window is worth more than this (IDR, at cost)"),
  window_days: z.number().int().describe("How many days ahead count as expiring"),
  check_weekday: z.number().int().describe("Day of the week to check: 0 = Monday ... 6 = Sunday"),
});

export const RuleCard = z.discriminatedUnion("type", [
  GenericRuleCard,
  GenericApprovalCard,
  GenericNeverCard,
  GenericKpiCard,
  InvoiceScheduleCard,
  ReminderCard,
  LateFeeCard,
  NoticeCard,
  OverpaymentCard,
  MaxFeeCard,
  ApprovalThresholdCard,
  RevenueTargetCard,
  ReorderPointCard,
  SupplierFallbackCard,
  ExpiryMarkdownCard,
  SlowMoverStopCard,
  PoApprovalCard,
  MarkdownFloorCard,
  ExpiringValueCard,
]);
export type RuleCard = z.infer<typeof RuleCard>;

/** Which domain pack the rulebook belongs to (docs/PACKS.md). Missing means rent collection. */
export const PackId = z.enum(["rent-collection", "minimarket", "generic"]);
export type PackId = z.infer<typeof PackId>;
export const packOf = (rb: Pick<Rulebook, "pack">): PackId => rb.pack ?? "rent-collection";

export const Rulebook = z.object({
  pack: PackId.optional(),
  business_name: z.string(),
  /** Generic pack only: what the records are and where they come from. */
  data: GenericData.optional(),
  currency: z.literal("IDR"),
  cards: z.array(RuleCard),
  questions: z.array(z.string()).describe("Clarifying questions for the owner where the SOP is ambiguous"),
  assumptions: z.array(z.string()).describe("Assumptions made to fill gaps; each must be confirmable by the owner"),
});
export type Rulebook = z.infer<typeof Rulebook>;

export type CardOf<T extends RuleCard["type"]> = Extract<RuleCard, { type: T }>;

export function findCard<T extends RuleCard["type"]>(rb: Rulebook, type: T): CardOf<T> | undefined {
  return rb.cards.find((c): c is CardOf<T> => c.type === type);
}

export interface RulebookIssue {
  card: string;
  message: string;
}

/** Semantic checks the structured-output schema cannot express. */
export function validateRulebook(rb: Rulebook): RulebookIssue[] {
  const issues: RulebookIssue[] = [];
  const seen = new Set<string>();
  for (const c of rb.cards) {
    if (seen.has(c.type) && c.type !== "reminder" && c.type !== "expiry_markdown" && !c.type.startsWith("generic_")) issues.push({ card: c.id, message: `duplicate ${c.type} card` });
    seen.add(c.type);
    switch (c.type) {
      case "invoice_schedule":
        if (c.day_of_month < 1 || c.day_of_month > 28) issues.push({ card: c.id, message: "day_of_month must be 1-28" });
        break;
      case "reminder":
        if (c.days_after_due.some((d) => d < 0)) issues.push({ card: c.id, message: "reminder days must be >= 0" });
        break;
      case "late_fee":
        if (c.percent <= 0 || c.percent > 100) issues.push({ card: c.id, message: "percent must be in (0, 100]" });
        if (c.days_after_due < 1) issues.push({ card: c.id, message: "late fee must start at least 1 day overdue" });
        if (c.tenure_grace && (c.tenure_grace.min_months < 1 || c.tenure_grace.extra_days < 1))
          issues.push({ card: c.id, message: "tenure_grace values must be >= 1" });
        break;
      case "notice":
        if (c.days_after_due < 1) issues.push({ card: c.id, message: "notice must be at least 1 day overdue" });
        break;
      case "max_fee":
        if (c.max_percent_of_rent <= 0) issues.push({ card: c.id, message: "max_percent_of_rent must be > 0" });
        break;
      case "approval_threshold":
        if (c.refund_above < 0) issues.push({ card: c.id, message: "refund_above must be >= 0" });
        break;
      case "revenue_target":
        if (c.monthly_target <= 0) issues.push({ card: c.id, message: "monthly_target must be > 0" });
        if (c.alert_day < 1 || c.alert_day > 28) issues.push({ card: c.id, message: "alert_day must be 1-28" });
        break;
      case "overpayment":
        break;
      case "reorder_point":
        if (c.below_units < 1) issues.push({ card: c.id, message: "below_units must be >= 1" });
        if (c.order_up_to_units < c.below_units) issues.push({ card: c.id, message: "order_up_to_units must be >= below_units" });
        break;
      case "supplier_fallback":
        if (c.late_days < 1) issues.push({ card: c.id, message: "late_days must be >= 1" });
        break;
      case "expiry_markdown":
        if (c.days_before_expiry < 1) issues.push({ card: c.id, message: "days_before_expiry must be >= 1" });
        if (c.percent <= 0 || c.percent >= 100) issues.push({ card: c.id, message: "percent must be in (0, 100)" });
        break;
      case "slow_mover_stop":
        if (c.no_sale_days < 1) issues.push({ card: c.id, message: "no_sale_days must be >= 1" });
        break;
      case "po_approval_threshold":
        if (c.po_above < 0) issues.push({ card: c.id, message: "po_above must be >= 0" });
        break;
      case "markdown_floor":
        break;
      case "generic_rule":
      case "generic_kpi":
        if (c.schedule.every === "week" && (c.schedule.weekday === null || c.schedule.weekday < 0 || c.schedule.weekday > 6)) issues.push({ card: c.id, message: "a weekly schedule needs a weekday 0-6" });
        if (c.schedule.every === "month" && (c.schedule.day_of_month === null || c.schedule.day_of_month < 1 || c.schedule.day_of_month > 28)) issues.push({ card: c.id, message: "a monthly schedule needs a day 1-28" });
        for (const k of c.conditions) {
          if (!["empty", "not_empty"].includes(k.op) && k.value === null) issues.push({ card: c.id, message: `condition on ${k.field} (${k.op}) needs a value` });
          if (["lt", "lte", "gt", "gte", "days_until_lte", "days_since_gte"].includes(k.op) && typeof k.value !== "number") issues.push({ card: c.id, message: `condition on ${k.field} (${k.op}) needs a number` });
        }
        if (c.type === "generic_kpi" && c.aggregate === "sum" && !c.field) issues.push({ card: c.id, message: "a sum KPI needs a field" });
        break;
      case "generic_approval":
        if (c.amount_above < 0) issues.push({ card: c.id, message: "amount_above must be >= 0" });
        break;
      case "generic_never":
        break;
      case "expiring_value_limit":
        if (c.max_value < 0) issues.push({ card: c.id, message: "max_value must be >= 0" });
        if (c.window_days < 1) issues.push({ card: c.id, message: "window_days must be >= 1" });
        if (c.check_weekday < 0 || c.check_weekday > 6) issues.push({ card: c.id, message: "check_weekday must be 0-6" });
        break;
    }
  }
  if (packOf(rb) === "generic") {
    if (!rb.data) issues.push({ card: "-", message: "a generic rulebook needs its data description (entity, key field, source)" });
    if (!rb.cards.some((c) => c.type === "generic_rule" || c.type === "generic_kpi")) issues.push({ card: "-", message: "at least one rule or KPI is required" });
    if (rb.cards.some((c) => !c.type.startsWith("generic_"))) issues.push({ card: "-", message: "domain-pack cards do not belong in a generic rulebook" });
    for (const a of rb.cards) {
      if (a.type !== "generic_approval") continue;
      const covered = rb.cards.some((r) => r.type === "generic_rule" && (a.tool === "*" || a.tool === r.action.tool) && r.action.amount_field);
      if (!covered) issues.push({ card: a.id, message: `this approval limit can never apply: no rule${a.tool === "*" ? "" : ` using ${a.tool}`} names the amount it is about (amount_field)` });
    }
    const fields = new Set((rb.data?.fields ?? []).map((f) => f.name));
    if (fields.size) {
      for (const c of rb.cards) {
        const used = [...("conditions" in c ? c.conditions.map((k) => k.field) : []), ...(c.type === "generic_rule" && c.action.amount_field ? [c.action.amount_field] : []), ...(c.type === "generic_kpi" && c.field ? [c.field] : [])];
        for (const f of used) if (!fields.has(f)) issues.push({ card: c.id, message: `uses a field the data does not have: ${f}` });
      }
    }
  } else if (packOf(rb) === "minimarket") {
    if (!findCard(rb, "reorder_point")) issues.push({ card: "-", message: "a reorder_point card is required" });
    if (rb.cards.some((c) => ["invoice_schedule", "late_fee", "notice", "reminder"].includes(c.type)))
      issues.push({ card: "-", message: "billing cards do not belong in a minimarket rulebook" });
  } else if (!findCard(rb, "invoice_schedule")) {
    issues.push({ card: "-", message: "an invoice_schedule card is required" });
  }
  return issues;
}

// Simulation input (data that goes into the sandbox; never sent to the LLM).

export const Tenant = z.object({
  id: z.string(),
  name: z.string(),
  room: z.string(),
  rent: z.number().int(),
  move_in: z.string().describe("YYYY-MM-DD"),
});
export type Tenant = z.infer<typeof Tenant>;

export const Payment = z.object({
  tenant_id: z.string(),
  day: z.number().int().describe("Day offset from the scenario start (0-based)"),
  amount: z.number().int(),
});

export const Scenario = z.object({
  start_date: z.string(),
  days: z.number().int(),
  tenants: z.array(Tenant),
  payments: z.array(Payment),
});
export type Scenario = z.infer<typeof Scenario>;

// Minimarket scenario: items with batches, daily sales, suppliers and their delays.

export const StockBatch = z.object({ units: z.number().int(), expires: z.string().describe("YYYY-MM-DD") });
export const StockItem = z.object({
  id: z.string(),
  name: z.string(),
  cost: z.number().int(),
  price: z.number().int(),
  shelf_life_days: z.number().int().describe("Shelf life of a fresh delivery"),
  batches: z.array(StockBatch),
  last_sold_days_ago: z.number().int(),
});
export const StockScenario = z.object({
  pack: z.literal("minimarket"),
  start_date: z.string(),
  days: z.number().int(),
  suppliers: z.array(z.object({ id: z.string(), lead_days: z.number().int() })),
  items: z.array(StockItem),
  sales: z.array(z.object({ item_id: z.string(), day: z.number().int(), units: z.number().int() })),
  /** Orders placed with `supplier` on days [from_day, to_day] arrive `extra_days` late. */
  delays: z.array(z.object({ supplier: z.string(), from_day: z.number().int(), to_day: z.number().int(), extra_days: z.number().int() })),
});
export type StockScenario = z.infer<typeof StockScenario>;
export type AnyScenario = Scenario | StockScenario | GenericScenario;

// Results returned by the sandbox job (aggregates and events only).

export interface SimEvent {
  date: string;
  /** The subject of the event: a tenant for rent, an item (SKU) for stock, "-" for the business. */
  tenant_id: string;
  type:
    | "invoice"
    | "reminder"
    | "late_fee"
    | "notice"
    | "payment"
    | "credit"
    | "refund_request"
    | "kpi_alert"
    | "sales"
    | "po_created"
    | "po_approval_request"
    | "po_received"
    | "supplier_switched"
    | "stockout"
    | "markdown"
    | "writeoff"
    | "reorder_stopped"
    | "status"
    // generic pack
    | "action"
    | "approval_request"
    | "blocked";
  amount?: number;
  invoice_id?: string;
  note?: string;
  /** Generic pack: the card that decided, the tool and its rendered arguments. */
  rule?: string;
  tool?: string;
  args?: Record<string, string>;
}

export interface TestReport {
  ran: number;
  failed: number;
  failures: string[];
}

export interface MutationReport {
  total: number;
  killed: number;
  survivors: { id: string; description: string }[];
}

export interface JobResults {
  builder_tests: TestReport;
  audit_spec: TestReport;
  mutation: MutationReport;
  constraints: { violations: string[] };
  simulation: {
    events: SimEvent[];
    summary: Record<string, number>;
  };
}

export interface Finding {
  severity: "blocker" | "warning" | "info";
  code: string;
  message: string;
}

export interface Verdict {
  status: "pass" | "fail";
  mutation_score: number;
  findings: Finding[];
}

export interface Receipt {
  run_id: string;
  created_at: string;
  rulebook_hash: string;
  code_hash: string;
  data_hash: string;
  result_hash: string;
  verdict: Verdict["status"];
  files: Record<string, string>;
  receipt_hash: string;
}

export { compareRuns, diffRulebooks, type CardChange, type RunImpact } from "./revision";
export * from "./generic";
export type * from "./operations";
