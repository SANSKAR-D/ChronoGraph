import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const dbUrl = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
  });

// Always cache client on globalThis to prevent connection pool exhaustion in serverless runtimes
globalForPrisma.prisma = db;

export default db;
