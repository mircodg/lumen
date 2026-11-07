import { parseEnv } from "@neon/env";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import neonConfig from "@/neon";
import * as schema from "./schema";

// Validates that the pooled connection string is present (throws a clear error if not).
const { postgres } = parseEnv(neonConfig, ["DATABASE_URL"]);

// Pooled (-pooler) connection for app traffic. On Vercel Fluid Compute,
// attachDatabasePool lets idle clients be released before the instance suspends.
const pool = new Pool({ connectionString: postgres.databaseUrl });
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
