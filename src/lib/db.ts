/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads server modules in dev, which would otherwise construct
 * a fresh PrismaClient (and a fresh connection pool) on every edit. Stashing
 * the instance on `globalThis` in development survives the reload; production
 * always gets exactly one instance per process, which is what it wants anyway.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
