/**
 * The seeded demo accounts, as plain data.
 *
 * Split out from `src/db/seed.ts` so the login page can list them without
 * pulling the seeding logic (and its crypto/db imports) into its module graph.
 *
 * These credentials are shown in the UI on purpose: the deployed build is a
 * review environment, and sharing cannot be evaluated without an easy way to
 * switch between accounts. A real product would never do this — see README.
 */

export const SEED_PASSWORD = "password123";

export const SEED_USERS = [
  { key: "ada", email: "ada@ajaia.test", name: "Ada Lovelace" },
  { key: "grace", email: "grace@ajaia.test", name: "Grace Hopper" },
  { key: "alan", email: "alan@ajaia.test", name: "Alan Turing" },
] as const;

export type SeedUserKey = (typeof SEED_USERS)[number]["key"];
