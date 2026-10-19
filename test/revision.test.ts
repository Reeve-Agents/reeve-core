import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareRuns, diffRulebooks, Rulebook, type SimEvent } from "../src/index";

const kos = Rulebook.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/kos-melati/rulebook.json", import.meta.url)), "utf8")));
const stock = Rulebook.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/minimarket/rulebook.json", import.meta.url)), "utf8")));

describe("diffRulebooks", () => {
  it("ignores wording, ids and quotes; reports changed values, added and removed cards", () => {
    const next = structuredClone(kos);
    for (const c of next.cards) c.title = `${c.title} (reworded)`;
    expect(diffRulebooks(kos, next)).toEqual([]);

    const fee = next.cards.find((c) => c.type === "late_fee")!;
    if (fee.type === "late_fee") fee.tenure_grace = { min_months: 6, extra_days: 3 };
    next.cards = next.cards.filter((c) => c.type !== "revenue_target");
    const changes = diffRulebooks(kos, next);
    expect(changes).toEqual([
      { kind: "changed", id: "R3", type: "late_fee", title: expect.any(String), fields: [{ field: "tenure_grace.min_months", before: 12, after: 6 }] },
      { kind: "removed", id: "R8", type: "revenue_target", title: expect.any(String), fields: [] },
    ]);
  });

  it("matches repeatable cards by content, so a new markdown step is an addition", () => {
    const next = structuredClone(stock);
    next.cards.push({ id: "M9", kind: "rule", type: "expiry_markdown", title: "H-7 70%", source_quote: "H-7", days_before_expiry: 7, percent: 70 });
    expect(diffRulebooks(stock, next).map((c) => [c.kind, c.id])).toEqual([["added", "M9"]]);
  });
});

describe("compareRuns", () => {
  const ev = (tenant_id: string, type: SimEvent["type"], amount?: number): SimEvent => ({ date: "2026-11-08", tenant_id, type, amount });
  it("lists only totals and tenants that moved, and skips payments", () => {
    const impact = compareRuns(
      { events: [ev("K01", "payment", 1), ev("K22", "late_fee", 75_000)], summary: { fees: 75_000, invoiced: 10 } },
      { events: [ev("K01", "payment", 2), ev("K22", "late_fee", 120_000), ev("K22", "notice")], summary: { fees: 120_000, invoiced: 10 } },
    );
    expect(impact.totals).toEqual([{ key: "fees", before: 75_000, after: 120_000 }]);
    expect(impact.subjects).toEqual([
      {
        id: "K22",
        changes: [
          { type: "late_fee", count: [1, 1], amount: [75_000, 120_000] },
          { type: "notice", count: [0, 1], amount: [0, 0] },
        ],
      },
    ]);
  });
});
