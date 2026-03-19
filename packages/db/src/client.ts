import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

export function createDbClient(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false
  });

  return {
    client,
    db: drizzle(client, { schema })
  };
}

export type DatabaseClient = ReturnType<typeof createDbClient>;
export type Database = DatabaseClient["db"];

