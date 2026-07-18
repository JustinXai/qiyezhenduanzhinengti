import type { Config } from "drizzle-kit";

export default {
  schema: "./src/storage/schema.ts",
  out: "./src/storage/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/dev.sqlite",
  },
} satisfies Config;
