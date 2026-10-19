import { fileURLToPath } from "node:url";

/** Absolute path to the sample businesses shipped with this package (Node only). */
export const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
