import { and, eq } from "drizzle-orm";

import { connectionSecrets } from "../db/schema/connections";
import { db } from "../lib/db";
import { decryptSecret } from "./crypto";

// Internal use only (Playground/Actions execution) — the decrypted value
// must never be returned from an API response.
export async function getDecryptedConnectionSecret(connectionId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ ciphertext: connectionSecrets.ciphertext, iv: connectionSecrets.iv, authTag: connectionSecrets.authTag })
    .from(connectionSecrets)
    .where(and(eq(connectionSecrets.connectionId, connectionId), eq(connectionSecrets.userId, userId)));

  if (!row) return null;
  return decryptSecret(row);
}
