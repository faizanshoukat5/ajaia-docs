import { createDb, resolveDatabasePath } from "../src/db/client";
import { SEED_PASSWORD, SEED_USERS, seed, tableCounts } from "../src/db/seed";

const file = resolveDatabasePath();
const { db, sqlite } = createDb(file);

console.log(`Seeding ${file} ...`);
seed(db);
const counts = tableCounts(db);
sqlite.close();

console.log(
  `Done. ${counts.users} users, ${counts.documents} documents, ${counts.shares} shares, ${counts.versions} versions.`,
);
console.log("\nSign in with any of these (all use the same password):\n");
for (const user of SEED_USERS) {
  console.log(`  ${user.email.padEnd(20)}  ${SEED_PASSWORD}   (${user.name})`);
}
console.log(
  "\nAda owns two documents and shares them with Grace (editor) and Alan (viewer).",
);
console.log("Grace shares her import spec with Ada as a viewer, to demo read-only access.\n");
