import type { Rulebook } from "../index";
import type { Locale, SimEventLike } from "../simview";

export type { Locale };

/*
 * A domain pack is everything that changes when Reeve moves from one kind of SOP to another
 * (vault: "Reeve - SOP Inputs and Rule Types", "Domains outside finance"). The pipeline stays
 * the same (compile, simulate, audit, approve, run); a pack supplies the nouns, the statuses,
 * the KPIs and the plain-language view the owner reads on their phone.
 *
 * The three statement types of an SOP map onto a pack's view:
 *   rule       → what Reeve did (lines) and how each entity stands (entities)
 *   constraint → what it refused to do on its own (exceptions waiting for the owner)
 *   kpi        → monitors with a target (kpis), with the honesty note that Reeve measures, not guarantees
 */

export type Tone = "ok" | "warn" | "bad" | "idle";

export interface PackKpi {
  id: string;
  label: string;
  value: number;
  display: string;
  target?: number;
  targetDisplay?: string;
  /** "target" means reach it (revenue); "limit" means stay under it (expiring stock). */
  targetKind?: "target" | "limit";
  /** Plain words on what Reeve can and cannot do about this number. */
  note?: string;
  tone?: Tone;
}

export interface PackStat {
  label: string;
  value: string;
  tone?: Tone;
}

/** One thing the SOP is about: a room, a SKU, an employee, a ticket, a purchase order. */
export interface PackEntity {
  id: string;
  label: string;
  status: string;
  /** One sentence on where this entity stands, in the owner's terms. */
  detail: string;
  /** Small markers, e.g. "late fee", "credit", "expires in 12 days". */
  flags: string[];
}

/** A case outside the rules. Reeve never decides these; it flags them with the options. */
export interface PackException {
  id: string;
  date: string;
  text: string;
  options: string[];
  /** Options that move money need the owner's passkey. */
  needsPasskey: boolean;
}

export interface PackView {
  kpis: PackKpi[];
  stats: PackStat[];
  entities: PackEntity[];
  /** What Reeve did on the day, one plain sentence per kind of action. */
  lines: string[];
  /** Everything flagged up to and including the day. */
  exceptions: PackException[];
}

/** A pack's fixed words in another language; anything left out stays English. */
export interface PackWords {
  domain: string;
  example: string;
  entity: { one: string; many: string };
  /** Status label per status key. */
  statuses: Record<string, string>;
}

export interface DomainPack {
  id: string;
  /** "Rent collection", "Stock and expiry", ... */
  domain: string;
  /** The running example the pack ships with. */
  example: string;
  entity: { one: string; many: string };
  statuses: Record<string, { label: string; tone: Tone }>;
  /** Rule card types the engine runs for this pack. A rulebook made of these selects the pack. */
  cardTypes: string[];
  /** Where the data and actions live (vault: "Reeve - Connectors and Composio"). */
  connectors: string[];
  /** Hosts the sandbox may reach for this pack; everything else is blocked. */
  egress: string[];
  /** Days on which anything happened, in order. */
  days(events: SimEventLike[]): string[];
  /** The view in `locale` ("en" when left out). */
  view(events: SimEventLike[], date: string, rulebook?: Rulebook, locale?: Locale): PackView;
  /** The fixed words above in other languages (see inLocale). */
  words?: Partial<Record<Exclude<Locale, "en">, PackWords>>;
}
