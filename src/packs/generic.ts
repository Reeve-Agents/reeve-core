import type { Rulebook } from "../index";
import { eventDays, rupiah, type SimEventLike } from "../simview";
import type { DomainPack, PackException } from "./contract";

const words = (type: string) => type.replace(/_/g, " ");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Ev = SimEventLike & { rule?: string; tool?: string };

/**
 * The "Any SOP" pack, and the fallback for a rulebook no pack claims: it shows what the rules did
 * and to whom from the events alone, in the rulebook's own words (rule titles, the data's entity name),
 * so the owner app works for any business without new UI.
 */
export const genericPack: DomainPack = {
  id: "generic",
  domain: "Operations",
  example: "any SOP",
  entity: { one: "Record", many: "Records" },
  statuses: {
    acted: { label: "acted on", tone: "ok" },
    waiting: { label: "waiting for you", tone: "warn" },
    blocked: { label: "blocked by a never rule", tone: "bad" },
    active: { label: "active", tone: "ok" },
    idle: { label: "no activity yet", tone: "idle" },
  },
  cardTypes: ["generic_rule", "generic_approval", "generic_never", "generic_kpi"],
  connectors: ["Composio (Gmail, Telegram, Sheets, Notion, ClickUp, ...)", "Any MCP server", "CSV"],
  egress: [],

  days: eventDays,

  view(events: SimEventLike[], date: string, rulebook?: Rulebook) {
    const evs = events as Ev[];
    const upTo = evs.filter((e) => e.date <= date);
    const today = evs.filter((e) => e.date === date);
    const title = (id?: string) => rulebook?.cards.find((c) => c.id === id)?.title ?? (id ? `rule ${id}` : "");
    const subjects = [...new Set(evs.map((e) => e.tenant_id).filter((t) => t !== "-"))].sort();

    // What happened today, one line per rule (or per event type for unknown rulebooks).
    const byRule = new Map<string, Ev[]>();
    for (const e of today) {
      if (e.type === "day_close" || e.type === "status") continue;
      const k = e.rule ? `${e.rule}|${e.type}` : e.type;
      byRule.set(k, [...(byRule.get(k) ?? []), e]);
    }
    const lines = [...byRule].map(([k, list]) => {
      const e = list[0]!;
      if (!e.rule) return `${list.length} × ${words(e.type)}`;
      if (e.type === "action") return `${title(e.rule)}: ${plural(list.length, "time")}`;
      if (e.type === "approval_request") return `${title(e.rule)}: ${plural(list.length, "action")} above your limit, waiting for you`;
      if (e.type === "blocked") return `${title(e.rule)}: ${plural(list.length, "action")} not sent, a never rule forbids it`;
      if (e.type === "kpi_alert") return `${title(e.rule)}: ${e.amount !== undefined ? rupiah(e.amount) : ""}`;
      return `${list.length} × ${words(e.type)} (${k})`;
    });

    const exceptions: PackException[] = upTo.flatMap((e): PackException[] => {
      if (e.type === "approval_request")
        return [
          {
            id: `ap-${e.tenant_id}-${e.date}-${e.rule}`,
            date: e.date,
            text: `${title(e.rule)} for ${e.tenant_id}${e.amount !== undefined ? ` is about ${rupiah(e.amount)}` : ""}, above your limit.`,
            options: ["Send it", "Don't send"],
            needsPasskey: true,
          },
        ];
      if (e.type === "kpi_alert")
        return [{ id: `kpi-${e.date}-${e.rule}`, date: e.date, text: `${title(e.rule)}${e.amount !== undefined ? `: ${rupiah(e.amount)}` : ""}.`, options: ["Noted"], needsPasskey: false }];
      return [];
    });

    const last = new Map<string, Ev>();
    for (const e of upTo) if (e.tenant_id !== "-") last.set(e.tenant_id, e);
    const entities = subjects.map((id) => {
      const l = last.get(id);
      const status = !l ? "idle" : l.type === "action" ? "acted" : l.type === "approval_request" ? "waiting" : l.type === "blocked" ? "blocked" : "active";
      const mine = upTo.filter((e) => e.tenant_id === id);
      return {
        id,
        label: id,
        status,
        detail: l ? `Last: ${l.rule ? title(l.rule) : words(l.type)} on ${l.date}.` : "Nothing yet.",
        flags: [...new Set(mine.flatMap((e) => (e.tool && e.type === "action" ? [e.tool.toLowerCase().replace(/_/g, " ")] : [])))].slice(0, 3),
      };
    });

    const waiting = upTo.filter((e) => e.type === "approval_request").length;
    return {
      kpis: [],
      stats: [
        { label: "actions today", value: String(today.filter((e) => e.type === "action").length) },
        { label: "waiting for you", value: String(waiting), tone: waiting ? "warn" : "ok" },
        { label: "blocked", value: String(upTo.filter((e) => e.type === "blocked").length), tone: "idle" },
      ],
      entities,
      lines,
      exceptions,
    };
  },
};

/** The generic pack in the rulebook's own nouns ("Siswa", "Orders", ...). */
export function genericPackFor(rulebook: Pick<Rulebook, "data"> | null | undefined): DomainPack {
  const d = rulebook?.data;
  return d ? { ...genericPack, entity: { one: d.entity, many: d.entity_plural } } : genericPack;
}
