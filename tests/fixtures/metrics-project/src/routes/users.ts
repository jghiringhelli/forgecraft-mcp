import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Intentional layer violation — direct DB call in route handler
export async function getUser(id: number) {
  return prisma.user.findUnique({ where: { id } });
}
