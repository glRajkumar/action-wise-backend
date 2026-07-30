import { db } from "../lib/db";

async function main() {
  const tables = await db.execute(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  console.log("TABLES:", tables.rows.map((r) => r.table_name).join(", "));

  for (const tableName of ["connections", "connection_secrets", "workspaces", "users"]) {
    const cols = await db.execute(
      `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='${tableName}' order by ordinal_position`,
    );
    if (cols.rows.length > 0) {
      console.log(`\n${tableName}:`);
      for (const row of cols.rows) console.log(`  ${row.column_name}: ${row.data_type}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
