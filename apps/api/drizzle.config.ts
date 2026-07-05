import { config as loadDotenv } from "dotenv";
import type { Config } from "drizzle-kit";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:dev@localhost:5432/vibeyeeter",
  },
} satisfies Config;
