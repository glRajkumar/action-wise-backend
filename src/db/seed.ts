import { db } from "../lib/db";

// No domain seed data yet — personal-workspace-on-signup (handover section B)
// is what will actually populate workspaces/members. This just confirms the
// connection works so `pnpm db:seed` is a real, runnable check from day one.
async function main() {
  await db.execute("select 1");
  console.log("Seed check passed — DB reachable, no domain rows to seed yet.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  });
