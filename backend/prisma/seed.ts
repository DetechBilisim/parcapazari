import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: "admin@parcapazar.com" },
  });

  if (existingAdmin) {
    console.log("Admin already exists, skipping seed.");
    return;
  }

  const passwordHash = await bcrypt.hash("admin2026", 10);

  await prisma.user.create({
    data: {
      email: "admin@parcapazar.com",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      companyName: "ParçaPazar Platform",
      taxNumber: "0000000000",
    },
  });

  console.log("✅ Admin seeded: admin@parcapazar.com / admin2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
