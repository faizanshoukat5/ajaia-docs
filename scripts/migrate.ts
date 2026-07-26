import { createConnection, resolveDatabasePath } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

const file = resolveDatabasePath();
const sqlite = createConnection(file);
const ran = runMigrations(sqlite);
sqlite.close();

if (ran.length === 0) {
  console.log(`Database at ${file} is already up to date.`);
} else {
  console.log(`Applied ${ran.length} migration(s) to ${file}:`);
  for (const name of ran) console.log(`  - ${name}`);
}
