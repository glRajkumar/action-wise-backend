import { readFileSync } from "node:fs";
import { db } from "../lib/db";

// One-off: applies drizzle/0000_lazy_cable.sql statement by statement,
// skipping objects that already exist (auth tables were created earlier).
const SKIPPABLE = new Set(["42P07", "42710"]);

async function main() {
  const sqlText = readFileSync("drizzle/0000_lazy_cable.sql", "utf8");
  const statements = sqlText
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  let applied = 0;
  let skipped = 0;
  for (const statement of statements) {
    try {
      await db.execute(statement);
      applied++;
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code && SKIPPABLE.has(code)) {
        skipped++;
        continue;
      }
      console.error("FAILED statement:\n", statement.slice(0, 300));
      throw error;
    }
  }
  console.log(`Done. applied=${applied} skipped(existing)=${skipped} total=${statements.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
