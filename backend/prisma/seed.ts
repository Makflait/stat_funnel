import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_USER_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_USER_PASSWORD ?? "changeme123";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });

  await prisma.app.upsert({
    where: { id: "seed-app" },
    update: {
      name: "My iOS App",
      ownerId: user.id,
      appStoreUrl: "https://apps.apple.com",
    },
    create: {
      id: "seed-app",
      name: "My iOS App",
      ownerId: user.id,
      appStoreUrl: "https://apps.apple.com",
    },
  });

  console.log("Seed complete", { email });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
