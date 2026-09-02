import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Starting database seeding for Balerra Delivery Platform...');

  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@balera.com';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'AdminPassword@123';
  const adminName = process.env.DEFAULT_ADMIN_NAME || 'Super Administrator';

  // 1. Seed Super Admin
  const existingAdmin = await prisma.admin.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.admin.create({
      data: {
        fullName: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
      },
    });
    console.log(`[Seed] Default Super Admin created: ${admin.email} / ${adminPassword}`);
  } else {
    console.log(`[Seed] Super Admin (${adminEmail}) already exists.`);
  }

  // 2. Seed Default System Settings
  const defaultSettings = [
    { key: 'company_name', value: 'Balerra Delivery Service' },
    { key: 'support_phone', value: '+251911000000' },
    { key: 'support_email', value: 'support@balera.com' },
    { key: 'currency', value: 'ETB' },
    { key: 'base_delivery_fee', value: '100' },
    { key: 'operating_hours', value: '08:00 AM - 10:00 PM' },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log('[Seed] Default system settings seeded successfully.');

  console.log('[Seed] Seeding completed successfully! 🚀');
}

main()
  .catch((e) => {
    console.error('[Seed Error]:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
