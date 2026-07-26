import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"

import { env } from "../utils/env"

const sql = neon(env.DATABASE_URL)

export const db = drizzle(sql)

export async function connectDB() {
  try {
    await sql`select 1`
    console.log('PostgreSQL is connected now')
  } catch (error) {
    console.log("Can't connect to PostgreSQL", error)
    throw error
  }
}
