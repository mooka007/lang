import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

const globalForPrisma = globalThis;
const adapter = new PrismaPg({
  connectionString: env.databaseUrl
});

export const prisma =
  globalForPrisma.__documentQaPrisma ||
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__documentQaPrisma = prisma;
}
