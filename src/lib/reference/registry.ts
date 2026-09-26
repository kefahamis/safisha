import type { Company, Estate } from "../types";

/**
 * The companies and estates in play, as data from the database.
 *
 * Code everywhere reads them synchronously (COMPANIES, ESTATES, ESTATE_LIST),
 * so they live in containers that are filled in place: on the server from the
 * database, in the browser from the root layout. On the server the containers
 * sit on globalThis, because Next loads this module once per bundle layer and
 * they must all see the same data.
 */
export interface ReferenceData {
  companies: Company[];
  estates: Estate[];
}

interface Store {
  companies: Company[];
  estates: Record<string, Estate>;
  list: Estate[];
  /** What was last applied, so re-applying the same data is free. */
  key: string;
}

const KEY = Symbol.for("zoa.reference");
type WithStore = typeof globalThis & { [KEY]?: Store };

const g = globalThis as WithStore;
export const store: Store = (g[KEY] ??= { companies: [], estates: {}, list: [], key: "" });

/** Replaces the reference data in place; every importer sees the change. */
export function applyReference(data: ReferenceData) {
  const key = JSON.stringify(data);
  if (key === store.key) return;
  store.key = key;
  // Each company lists the estates it serves, in name order.
  const companies = data.companies.map((c) => ({
    ...c,
    estates: data.estates
      .filter((e) => e.company === c.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => e.code),
  }));
  store.companies.splice(0, store.companies.length, ...companies);
  for (const code of Object.keys(store.estates)) delete store.estates[code];
  for (const e of data.estates) store.estates[e.code] = e;
  store.list.splice(0, store.list.length, ...data.estates);
}

/** The current data, for handing from the server to the browser. */
export function currentReference(): ReferenceData {
  return { companies: store.companies.map(({ estates: _e, ...c }) => ({ ...c, estates: [] })), estates: [...store.list] };
}
