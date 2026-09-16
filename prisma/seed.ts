import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { initialHotels } from '../src/data/hotelData';

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
    { key: 'base_delivery_fee', value: '60' },
    { key: 'operating_hours', value: '06:00 AM - 11:00 PM' },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log('[Seed] Default system settings seeded successfully.');

  // 3. Seed Partner Hotels & Restaurants Catalog
  const initialHotelsList = initialHotels || [];

  if (initialHotelsList.length > 0) {
    console.log(`[Seed] Found ${initialHotelsList.length} partner establishments to seed...`);
    let createdHotelsCount = 0;
    let createdFoodsCount = 0;

    for (const h of initialHotelsList) {
      const restaurant = await prisma.restaurant.upsert({
        where: { code: h.id },
        update: {
          name: h.name,
          aliases: h.aliases || [],
          category: h.category || 'Cafe & Restaurant',
          cuisineType: h.cuisineType || 'Local & Traditional Cuisine',
          phone1: h.phone1 || '',
          phone2: h.phone2 || '',
          address: h.address || 'Bale Robe, Ethiopia',
          rating: Number(h.rating) || 4.8,
          totalReviews: Number(h.totalReviews) || 10,
          deliveryTime: h.deliveryTime || '25 - 40 min',
          deliveryFee: Number(h.deliveryFee) || 60,
          priceRange: h.priceRange || '$$',
          status: h.status || 'Active',
          openingHours: h.openingHours || '07:00 AM - 10:00 PM',
          isPartner: true,
          banner: h.banner || '',
          avatar: h.avatar || '',
        },
        create: {
          code: h.id,
          name: h.name,
          aliases: h.aliases || [],
          category: h.category || 'Cafe & Restaurant',
          cuisineType: h.cuisineType || 'Local & Traditional Cuisine',
          phone1: h.phone1 || '',
          phone2: h.phone2 || '',
          address: h.address || 'Bale Robe, Ethiopia',
          rating: Number(h.rating) || 4.8,
          totalReviews: Number(h.totalReviews) || 10,
          deliveryTime: h.deliveryTime || '25 - 40 min',
          deliveryFee: Number(h.deliveryFee) || 60,
          priceRange: h.priceRange || '$$',
          status: h.status || 'Active',
          openingHours: h.openingHours || '07:00 AM - 10:00 PM',
          isPartner: true,
          banner: h.banner || '',
          avatar: h.avatar || '',
        },
      });

      createdHotelsCount++;

      if (Array.isArray(h.foods)) {
        for (const f of h.foods) {
          const existingFood = await prisma.foodItem.findFirst({
            where: {
              restaurantId: restaurant.id,
              name: f.name,
            },
          });

          if (!existingFood) {
            await prisma.foodItem.create({
              data: {
                restaurantId: restaurant.id,
                code: f.id,
                name: f.name,
                category: f.category || 'Main Dishes',
                price: Number(f.price) || 0,
                description: f.description || '',
                isAvailable: f.isAvailable !== undefined ? f.isAvailable : true,
                tag: f.tag || '',
                image: f.image || '',
              },
            });
            createdFoodsCount++;
          }
        }
      }
    }
    console.log(`[Seed] Seeded ${createdHotelsCount} partner establishments and ${createdFoodsCount} food items.`);
  }

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
