import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "admin@example.com";
  const password = process.argv[3] || "admin123";
  const name = process.argv[4] || "Admin";

  const passwordHash = await bcrypt.hash(password, 12);

  // Det här är bootstrap-skriptet för ägarkontot, därför OWNER explicit.
  // Schemats default är TEACHER så att ett konto som skapas någon annan väg
  // blir det snävaste. Lärarkonton skapas med scripts/manage-teacher.ts.
  const admin = await prisma.admin.upsert({
    where: { email },
    update: { passwordHash, name, role: "OWNER" },
    create: { email, name, passwordHash, role: "OWNER" },
  });

  console.log(`Ägarkonto skapat/uppdaterat:`);
  console.log(`  Email: ${admin.email}`);
  console.log(`  Namn: ${admin.name}`);
  console.log(`  Roll: ${admin.role}`);
  console.log(`  Lösenord: ${password}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
