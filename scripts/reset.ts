import fs from "node:fs";
import { resolveDatabasePath } from "../src/db/client";

/**
 * Deletes the SQLite database and its WAL sidecar files so the next `npm run
 * setup` starts from nothing. Kept separate from `seed` because seeding is
 * non-destructive to the schema and this is not.
 */
const file = resolveDatabasePath();
let removed = 0;

for (const suffix of ["", "-wal", "-shm"]) {
  const target = `${file}${suffix}`;
  if (fs.existsSync(target)) {
    fs.rmSync(target);
    removed += 1;
    console.log(`Removed ${target}`);
  }
}

if (removed === 0) {
  console.log(`Nothing to remove — no database at ${file}.`);
} else {
  console.log("\nRun `npm run setup` to recreate and reseed it.");
}
