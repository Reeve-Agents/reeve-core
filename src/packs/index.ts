import type { Rulebook } from "../index";
import type { DomainPack } from "./contract";
import { genericPack, genericPackFor } from "./generic";
import { minimarketPack } from "./minimarket";
import { rentPack } from "./rent";

export type { DomainPack, PackEntity, PackException, PackKpi, PackStat, PackView, Tone } from "./contract";
export { genericPack, genericPackFor, minimarketPack, rentPack };

/** Every pack the engine can run (docs/PACKS.md). */
export const PACKS: DomainPack[] = [rentPack, minimarketPack];

/** The pack whose card types cover the most of the rulebook's cards; the generic view if none does. */
export function packFor(rulebook: (Pick<Rulebook, "cards"> & Partial<Pick<Rulebook, "pack" | "data">>) | null | undefined): DomainPack {
  if (!rulebook?.cards.length) return genericPack;
  if (rulebook.pack === "generic") return genericPackFor(rulebook);
  let best: DomainPack = genericPack;
  let bestHits = 0;
  for (const pack of PACKS) {
    const hits = rulebook.cards.filter((c) => pack.cardTypes.includes(c.type)).length;
    if (hits > bestHits) {
      best = pack;
      bestHits = hits;
    }
  }
  return best;
}
