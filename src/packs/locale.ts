import type { DomainPack, Locale } from "./contract";

/**
 * The pack speaking `locale`: its fixed words swapped for the translated ones, and its view built in
 * that language. The owner app asks for "id"; the developer studio and the landing page keep English.
 */
export function inLocale(pack: DomainPack, locale: Locale = "en"): DomainPack {
  if (locale === "en") return pack;
  const w = pack.words?.[locale];
  const statuses = Object.fromEntries(Object.entries(pack.statuses).map(([k, s]) => [k, { ...s, label: w?.statuses[k] ?? s.label }]));
  return {
    ...pack,
    ...(w && { domain: w.domain, example: w.example, entity: w.entity }),
    statuses,
    view: (events, date, rulebook) => pack.view(events, date, rulebook, locale),
  };
}
