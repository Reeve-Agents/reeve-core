import type { Rulebook } from "../index";
import type { DomainPack, Locale } from "./contract";
import { genericPack, genericPackFor } from "./generic";
import { inLocale } from "./locale";
import { minimarketPack } from "./minimarket";
import { rentPack } from "./rent";

export type { DomainPack, Locale, PackEntity, PackException, PackKpi, PackStat, PackView, PackWords, Tone } from "./contract";
export { genericPack, genericPackFor, inLocale, minimarketPack, rentPack };

/** Every pack the engine can run (docs/PACKS.md). */
export const PACKS: DomainPack[] = [rentPack, minimarketPack];

/** The pack whose card types cover the most of the rulebook's cards; the generic view if none does. */
export function packFor(
  rulebook: (Pick<Rulebook, "cards"> & Partial<Pick<Rulebook, "pack" | "data">>) | null | undefined,
  locale: Locale = "en",
): DomainPack {
  if (!rulebook?.cards.length) return inLocale(genericPack, locale);
  if (rulebook.pack === "generic") return genericPackFor(rulebook, locale);
  let best: DomainPack = genericPack;
  let bestHits = 0;
  for (const pack of PACKS) {
    const hits = rulebook.cards.filter((c) => pack.cardTypes.includes(c.type)).length;
    if (hits > bestHits) {
      best = pack;
      bestHits = hits;
    }
  }
  return inLocale(best, locale);
}
