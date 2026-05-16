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

async function seedAdmin() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: "admin@parcapazar.com" },
  });

  if (existingAdmin) {
    console.log("Admin already exists, skipping.");
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

  console.log("✅ Admin seeded.");
}

async function seedParts() {
  const existingPart = await prisma.part.findFirst();
  if (existingPart) {
    console.log("Parts already seeded, skipping.");
    return;
  }

  const parts = [
    {
      sku: "BOSCH-0986452041",
      oemCodes: ["34116794300", "34116798825"],
      brand: "Bosch",
      name: "Ön Fren Balatası",
      description: "BMW 3 serisi için ön fren balatası seti, dört parça.",
      category: "BRAKES" as const,
      vehicleMakes: ["BMW"],
      vehicleModels: ["320i E90", "320d E90", "325i E90"],
    },
    {
      sku: "MAHLE-OX371D",
      oemCodes: ["A2701800009", "2701800009"],
      brand: "Mahle",
      name: "Yağ Filtresi",
      description: "Mercedes M271 motor için yağ filtresi.",
      category: "FILTERS" as const,
      vehicleMakes: ["Mercedes-Benz"],
      vehicleModels: ["C180 W204", "C200 W204", "E200 W212"],
    },
    {
      sku: "NGK-IFR6T-11",
      oemCodes: ["90919-01210", "9091901210"],
      brand: "NGK",
      name: "İridyum Buji",
      description: "Toyota Corolla için iridyum buji seti.",
      category: "ENGINE" as const,
      vehicleMakes: ["Toyota"],
      vehicleModels: ["Corolla 1.6 VVT-i", "Avensis 1.8"],
    },
    {
      sku: "VALEO-563214",
      oemCodes: ["8200063988", "7700428656"],
      brand: "Valeo",
      name: "Debriyaj Seti",
      description: "Renault Megane 1.5 dCi için komple debriyaj seti.",
      category: "TRANSMISSION" as const,
      vehicleMakes: ["Renault"],
      vehicleModels: ["Megane II 1.5 dCi", "Scenic II 1.5 dCi"],
    },
    {
      sku: "SACHS-3000950726",
      oemCodes: ["06A141031M"],
      brand: "Sachs",
      name: "Volant",
      description: "VW Golf 5 1.9 TDI için çift kütleli volant.",
      category: "TRANSMISSION" as const,
      vehicleMakes: ["Volkswagen"],
      vehicleModels: ["Golf V 1.9 TDI", "Passat B6 1.9 TDI"],
    },
    {
      sku: "MANN-W7008",
      oemCodes: ["045115561B"],
      brand: "Mann Filter",
      name: "Yağ Filtresi",
      description: "VW Polo 1.4 TDI için yağ filtresi.",
      category: "FILTERS" as const,
      vehicleMakes: ["Volkswagen", "Skoda", "Seat"],
      vehicleModels: ["Polo 1.4 TDI", "Fabia 1.4 TDI", "Ibiza 1.4 TDI"],
    },
    {
      sku: "FEBI-22557",
      oemCodes: ["31336752735"],
      brand: "Febi Bilstein",
      name: "Ön Amortisör Yastığı",
      description: "BMW 5 serisi için ön amortisör yastığı.",
      category: "SUSPENSION" as const,
      vehicleMakes: ["BMW"],
      vehicleModels: ["520i E60", "525i E60", "530i E60"],
    },
    {
      sku: "BOSCH-F026407123",
      oemCodes: ["1109AY", "1109Z2"],
      brand: "Bosch",
      name: "Yakıt Filtresi",
      description: "Peugeot 308 1.6 HDi için yakıt filtresi.",
      category: "FILTERS" as const,
      vehicleMakes: ["Peugeot", "Citroen"],
      vehicleModels: ["308 1.6 HDi", "C4 1.6 HDi"],
    },
    {
      sku: "DELPHI-LP1832",
      oemCodes: ["34116771868"],
      brand: "Delphi",
      name: "Ön Fren Balatası",
      description: "BMW X3 F25 için ön fren balatası seti.",
      category: "BRAKES" as const,
      vehicleMakes: ["BMW"],
      vehicleModels: ["X3 F25 xDrive20d", "X3 F25 xDrive30d"],
    },
    {
      sku: "BOSCH-0258017025",
      oemCodes: ["06A906262BR"],
      brand: "Bosch",
      name: "Lambda Sensörü",
      description: "VW/Audi 1.8T için lambda (oksijen) sensörü.",
      category: "ELECTRICAL" as const,
      vehicleMakes: ["Volkswagen", "Audi"],
      vehicleModels: ["Passat B6 1.8 TSI", "A4 B7 1.8T"],
    },
  ];

  await prisma.part.createMany({ data: parts });
  console.log(`✅ Seeded ${parts.length} parts to catalog.`);
}

async function seedDiscountCodes() {
  const existing = await prisma.discountCode.findFirst();
  if (existing) {
    console.log("Discount codes already seeded, skipping.");
    return;
  }

  await prisma.discountCode.createMany({
    data: [
      {
        code: "HOSGELDIN10",
        discountPercent: 10,
        maxUses: 1000,
      },
      {
        code: "BAYRAM20",
        discountPercent: 20,
        maxUses: 50,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      {
        code: "PARCAPAZAR5",
        discountPercent: 5,
        maxUses: 10000,
      },
    ],
  });

  console.log("✅ Seeded 3 discount codes.");
}

async function main() {
  await seedAdmin();
  await seedParts();
  await seedDiscountCodes();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
