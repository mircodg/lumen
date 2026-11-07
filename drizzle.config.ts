import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Load .env.local / .env the same way Next.js does.
loadEnvConfig(process.cwd());

// Schema pushes must use the direct (non-pooled) connection: PgBouncer's
// transaction mode doesn't support the session state drizzle-kit relies on.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  throw new Error("DATABASE_URL_UNPOOLED is not set (run `neon env pull` or `vercel env pull`).");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
