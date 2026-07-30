import { db } from "../lib/db";

// The old app's `connections` (social connections: requester/receiver) collides
// with Action Wise's `connections`. Rename it out of the way — no data lost,
// the old app can migrate/rename back if it's ever revived.
async function main() {
  const conns = await db.execute(`select count(*)::int as n from "connections"`);
  console.log(`old connections rows: ${Number(conns.rows[0]?.n ?? -1)}`);

  await db.execute(`alter table "connections" rename to "legacy_social_connections"`);
  console.log('Renamed "connections" -> "legacy_social_connections"');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
