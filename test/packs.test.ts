import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import rulebook from "../fixtures/kos-melati/rulebook.json" with { type: "json" };
import sim from "../fixtures/kos-melati/sim-events.json" with { type: "json" };
import { Rulebook } from "../src/index";
import mmRulebook from "../fixtures/minimarket/rulebook.json" with { type: "json" };
import mmSim from "../fixtures/minimarket/sim-events.json" with { type: "json" };
import { genericPack, minimarketPack, packFor, rentPack } from "../src/packs/index";
import { juta, rupiah, shortDate } from "../src/simview";

const rb = rulebook as unknown as Rulebook;

describe("domain packs", () => {
  it("selects the rent pack for the Kos Melati rulebook and the generic view otherwise", () => {
    expect(packFor(rb).id).toBe("rent-collection");
    expect(packFor(null).id).toBe("generic");
    expect(packFor({ cards: [] }).id).toBe("generic");
  });

  it("shows the engine's own Nov 15 for Kos Melati", () => {
    const view = rentPack.view(sim.events, "2026-11-15", rb);
    expect(view.stats.map((s) => s.value)).toEqual(["24/30", "6", "6"]);
    expect(view.kpis[0]?.display).toBe("Rp41.5 jt");
    expect(view.kpis[0]?.targetDisplay).toBe("Rp45 jt");
    expect(view.kpis[0]?.tone).toBe("warn");
    expect(view.lines).toEqual(["6 exit notices sent", "Rp41.5 jt collected by the 15th, owner alerted"]);
    expect(view.exceptions).toHaveLength(1);
    expect(view.exceptions[0]?.options).toContain("Send reminders now");
    expect(view.entities).toHaveLength(30);
    expect(view.entities.find((e) => e.id === "K22")).toMatchObject({ status: "notice", flags: ["late fee"] });
  });

  it("shows the minimarket CreateOS run in stock terms", () => {
    const mm = mmRulebook as unknown as Rulebook;
    expect(packFor(mm).id).toBe("minimarket");
    const view = minimarketPack.view(mmSim.events, "2026-11-09", mm);
    expect(view.kpis[0]).toMatchObject({ display: "Rp1,007,600", targetDisplay: "Rp1,000,000", tone: "warn" });
    expect(view.entities).toHaveLength(24);
    expect(view.exceptions.map((x) => x.id)).toEqual(["po-S09-2026-11-02", "kpi-2026-11-09"]);
    expect(view.exceptions[0]?.needsPasskey).toBe(true);
    expect(view.entities.find((e) => e.id === "S09")?.flags).toContain("waiting for your approval");
    expect(view.lines.some((l) => l.includes("owner alerted"))).toBe(true);
  });

  it("keeps a generic view for events no pack claims", () => {
    const events = [
      { date: "2026-11-01", tenant_id: "T-1", type: "ticket_opened" },
      { date: "2026-11-01", tenant_id: "T-1", type: "escalated" },
      { date: "2026-11-02", tenant_id: "T-2", type: "ticket_opened" },
    ];
    const view = genericPack.view(events, "2026-11-01");
    expect(view.entities.map((e) => e.status)).toEqual(["active", "idle"]);
    expect(view.lines).toEqual(["1 × ticket opened", "1 × escalated"]);
  });
});

describe("generic pack: any SOP, in the rulebook's own words", () => {
  const rb = Rulebook.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/bimbel-cerdas/rulebook.json", import.meta.url)), "utf8")));
  const ev = (date: string, tenant_id: string, type: string, extra: Record<string, unknown> = {}) => ({ date, tenant_id, type, ...extra }) as never;
  const events = [
    ev("2026-11-02", "S01", "action", { rule: "R1", tool: "TELEGRAM_SEND_MESSAGE" }),
    ev("2026-11-02", "S03", "action", { rule: "R1", tool: "TELEGRAM_SEND_MESSAGE" }),
    ev("2026-11-02", "S11", "approval_request", { rule: "R1", tool: "TELEGRAM_SEND_MESSAGE", amount: 3_000_000 }),
    ev("2026-11-02", "S07", "blocked", { rule: "R1", tool: "TELEGRAM_SEND_MESSAGE" }),
    ev("2026-11-02", "-", "kpi_alert", { rule: "R6", amount: 9_150_000 }),
  ];

  it("is chosen for a generic rulebook and named after its data", () => {
    const pack = packFor(rb);
    expect(pack.id).toBe("generic");
    expect(pack.entity).toEqual({ one: "Siswa", many: "Siswa" });
  });

  it("reads like the owner's rules: lines per rule, held actions as passkey exceptions", () => {
    const v = packFor(rb).view(events, "2026-11-02", rb);
    expect(v.lines[0]).toMatch(/^Pengingat Telegram .*: 2 times$/);
    expect(v.lines).toContainEqual(expect.stringContaining("waiting for you"));
    expect(v.exceptions.find((x) => x.needsPasskey)).toMatchObject({ options: ["Send it", "Don't send"] });
    expect(v.exceptions.find((x) => x.needsPasskey)!.text).toContain("Rp3,000,000");
    expect(v.entities.find((e) => e.id === "S07")).toMatchObject({ status: "blocked" });
    expect(v.stats.map((s) => [s.label, s.value])).toEqual([["actions today", "2"], ["waiting for you", "1"], ["blocked", "1"]]);
  });
});

describe("packs in Indonesian, for the owner app", () => {
  it("formats money and dates the Indonesian way", () => {
    expect(rupiah(1_007_600, "id")).toBe("Rp1.007.600");
    expect(juta(41_500_000, "id")).toBe("Rp41,5 jt");
    expect(shortDate("2026-10-15", "id")).toBe("15 Okt");
    expect(shortDate("2026-11-15")).toBe("Nov 15");
  });

  it("tells Kos Melati's Nov 15 in Indonesian, with the same numbers", () => {
    const pack = packFor(rb, "id");
    expect(pack.entity).toEqual({ one: "Kamar", many: "Kamar" });
    expect(pack.statuses.notice).toEqual({ label: "surat peringatan", tone: "bad" });
    const view = pack.view(sim.events, "2026-11-15", rb);
    expect(view.stats.map((s) => [s.label, s.value])).toEqual([["lunas", "24/30"], ["kena denda", "6"], ["surat peringatan", "6"]]);
    expect(view.kpis[0]).toMatchObject({ label: "Terkumpul bulan ini", display: "Rp41,5 jt", targetDisplay: "Rp45 jt" });
    expect(view.lines).toEqual(["6 surat peringatan dikirim", "Rp41,5 jt terkumpul sampai tanggal 15, kamu sudah dikabari"]);
    expect(view.exceptions[0]?.options).toContain("Kirim pengingat sekarang");
    expect(view.entities.find((e) => e.id === "K22")).toMatchObject({ status: "notice", flags: ["denda"] });
  });

  it("tells the minimarket run in Indonesian", () => {
    const mm = mmRulebook as unknown as Rulebook;
    const view = packFor(mm, "id").view(mmSim.events, "2026-11-02", mm);
    expect(view.lines[0]).toBe("30 unit terjual, Rp315.200");
    expect(view.lines).toContain("1 pesanan di atas batasmu, menunggu kamu");
    expect(view.exceptions[0]?.text).toBe("Pesanan 49 × Beras 5kg dari Supplier A senilai Rp3.038.000 di atas batasmu.");
    expect(view.entities.find((e) => e.id === "S03")?.flags).toEqual(["diskon 20%"]);
    expect(view.entities.find((e) => e.id === "S09")?.flags).toContain("menunggu persetujuanmu");
  });

  it("keeps the generic pack in the rulebook's nouns, with Indonesian around them", () => {
    const g = Rulebook.parse(JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/bimbel-cerdas/rulebook.json", import.meta.url)), "utf8")));
    const pack = packFor(g, "id");
    expect(pack.entity).toEqual({ one: "Siswa", many: "Siswa" });
    expect(pack.statuses.blocked?.label).toBe("ditahan aturan larangan");
    const v = pack.view([{ date: "2026-11-02", tenant_id: "S01", type: "action", rule: "R1" } as never], "2026-11-02", g);
    expect(v.lines[0]).toMatch(/: 1 kali$/);
    expect(v.entities[0]?.detail).toMatch(/^Terakhir: .*, 2 Nov\.$/);
    expect(v.stats.map((s) => s.label)).toEqual(["aksi hari ini", "menunggu kamu", "ditahan"]);
  });
});
