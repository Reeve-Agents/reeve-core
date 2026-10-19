import type { SimEvent, Tenant } from "./index";

/**
 * What a run looks like once the broker is operating it. These are the shapes the API returns, so
 * they live here, shared by the broker (which writes them) and the web app (which shows them).
 */

export interface OperationInvoice {
  /** The rule engine's invoice id, e.g. K01-2026-11; a late fee has its own entry. */
  key: string;
  tenant: string;
  kind: "rent" | "late_fee";
  amount: number;
  date: string;
  invoiceId: string;
  status: "open" | "paid" | "expired" | "void";
  amountPaid: number;
  payUrl?: string;
  paymentRef?: string;
}

export interface OperationPayment {
  tenant: string;
  /** Day offset on the business clock the payment counts on. */
  day: number;
  amount: number;
  source: "rail" | "transfer";
  ref: string;
  at: string;
}

export interface OperationAction {
  date: string;
  tenant: string;
  type: SimEvent["type"];
  amount?: number;
  outcome: "invoiced" | "logged" | "raised" | "covered_by_credit" | "blocked";
  detail: string;
}

export interface OperationException {
  id: string;
  date: string;
  tenant: string;
  kind: "overpayment" | "refund_request" | "kpi_alert";
  amount: number;
  text: string;
  status: "open" | "kept_as_credit" | "refunded" | "noted";
  /** Above the rulebook's refund limit: refunding needs the owner's passkey. */
  needsPasskey: boolean;
  refundId?: string;
}

export interface OperationRecord {
  id: string;
  rulebookId: string;
  receiptHash: string;
  rail: string;
  /** First day of the business clock (the cycle the audit simulated). */
  startDate: string;
  /** Last business day processed; null before day 1 runs. */
  clock: string | null;
  status: "idle" | "running" | "error";
  error?: string;
  /** The billing roster, fixed when the run starts (rent and move-in included). */
  tenants: (Pick<Tenant, "id" | "name" | "room"> & Partial<Pick<Tenant, "rent" | "move_in">>)[];
  invoices: OperationInvoice[];
  payments: OperationPayment[];
  actions: OperationAction[];
  exceptions: OperationException[];
  seenEvents: string[];
  log: { at: string; line: string }[];
  createdAt: string;
}

export interface SentAction {
  date: string;
  key: string;
  rule: string;
  tool: string;
  connector: string;
  args: Record<string, string>;
  amount?: number;
  ok: boolean;
  /** Which connector actually ran it (composio, mcp:<name>, log). */
  via?: string;
  error?: string;
}

export interface HeldAction {
  id: string;
  date: string;
  key: string;
  rule: string;
  kind: "approval_request" | "blocked" | "kpi_alert";
  tool?: string;
  connector?: string;
  args?: Record<string, string>;
  amount?: number;
  text: string;
  status: "open" | "approved" | "declined" | "noted";
  needsPasskey: boolean;
}

export interface GenericOperationRecord {
  id: string;
  kind: "generic";
  rulebookId: string;
  receiptHash: string;
  datasetId: string;
  startDate: string;
  clock: string | null;
  status: "idle" | "running" | "error";
  error?: string;
  sent: SentAction[];
  held: HeldAction[];
  log: { at: string; line: string }[];
  createdAt: string;
}
