import { prisma } from '../config/prisma';
import { generateTrackingCode } from '../utils/trackingCode';
import { OtpService } from './otp.service';
import { NotificationService } from './notification.service';
import { Roles } from '../constants/roles';
import { initialHotels } from '../data/hotelData';

export class RestaurantService {
  /**
   * Get all restaurants for Admin with filters & statistics
   */
  static async getRestaurants(options: {
    search?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, category, status, page = 1, limit = 100 } = options;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { cuisineType: { contains: search, mode: 'insensitive' } },
        { phone1: { contains: search, mode: 'insensitive' } },
        { phone2: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { foods: { some: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    if (category && category !== 'All') {
      where.category = category;
    }

    if (status && status !== 'All') {
      where.status = status;
    }

    const skip = (page - 1) * limit;

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        include: {
          foods: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.restaurant.count({ where }),
    ]);

    // Compute platform-wide summary stats
    const stats = await this.computeStats();

    return {
      restaurants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats,
    };
  }

  /**
   * Get single restaurant by ID or Code (including its food items)
   */
  static async getRestaurantById(idOrCode: string) {
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { id: idOrCode },
          { code: idOrCode },
        ],
      },
      include: {
        foods: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!restaurant) {
      throw new Error('Restaurant or Hotel not found.');
    }

    return restaurant;
  }

  /**
   * Create new Hotel / Restaurant
   */
  static async createRestaurant(data: {
    name: string;
    code?: string;
    aliases?: string[];
    category?: string;
    cuisineType?: string;
    phone1?: string;
    phone2?: string;
    address: string;
    latitude?: number;
    longitude?: number;
    rating?: number;
    totalReviews?: number;
    deliveryTime?: string;
    deliveryFee?: number;
    priceRange?: string;
    status?: string;
    openingHours?: string;
    isPartner?: boolean;
    banner?: string;
    avatar?: string;
  }) {
    // Generate next code if not supplied
    let code = data.code;
    if (!code) {
      const count = await prisma.restaurant.count();
      code = `HTL-${String(count + 1).padStart(3, '0')}`;
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        name: data.name,
        code,
        aliases: data.aliases || [],
        category: data.category || 'Cafe & Restaurant',
        cuisineType: data.cuisineType || 'Local & Traditional Cuisine',
        phone1: data.phone1 || '',
        phone2: data.phone2 || '',
        address: data.address || 'Bale Robe, Ethiopia',
        latitude: data.latitude || null,
        longitude: data.longitude || null,
        rating: data.rating !== undefined ? data.rating : 4.8,
        totalReviews: data.totalReviews !== undefined ? data.totalReviews : 0,
        deliveryTime: data.deliveryTime || '25 - 40 min',
        deliveryFee: data.deliveryFee !== undefined ? data.deliveryFee : 60,
        priceRange: data.priceRange || '$$',
        status: data.status || 'Active',
        openingHours: data.openingHours || '07:00 AM - 10:00 PM',
        isPartner: data.isPartner !== undefined ? data.isPartner : true,
        banner: data.banner || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
        avatar: data.avatar || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200&auto=format&fit=crop&q=80',
      },
      include: {
        foods: true,
      },
    });

    return restaurant;
  }

  /**
   * Update Hotel / Restaurant Details
   */
  static async updateRestaurant(idOrCode: string, data: any) {
    const existing = await this.getRestaurantById(idOrCode);

    const updated = await prisma.restaurant.update({
      where: { id: existing.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        foods: true,
      },
    });

    return updated;
  }

  /**
   * Quick update restaurant contact phones
   */
  static async updateRestaurantPhones(idOrCode: string, phone1?: string, phone2?: string) {
    const existing = await this.getRestaurantById(idOrCode);

    const updateData: any = {};
    if (phone1 !== undefined) updateData.phone1 = phone1;
    if (phone2 !== undefined) updateData.phone2 = phone2;

    const updated = await prisma.restaurant.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        foods: true,
      },
    });

    return updated;
  }

  /**
   * Toggle restaurant Active / Inactive status
   */
  static async toggleRestaurantStatus(idOrCode: string, targetStatus?: string) {
    const existing = await this.getRestaurantById(idOrCode);
    const newStatus = targetStatus || (existing.status === 'Active' ? 'Inactive' : 'Active');

    const updated = await prisma.restaurant.update({
      where: { id: existing.id },
      data: { status: newStatus },
      include: {
        foods: true,
      },
    });

    return updated;
  }

  /**
   * Delete restaurant and cascade food items
   */
  static async deleteRestaurant(idOrCode: string) {
    const existing = await this.getRestaurantById(idOrCode);

    await prisma.restaurant.delete({
      where: { id: existing.id },
    });

    return { success: true, message: `Restaurant ${existing.name} deleted successfully.` };
  }

  /**
   * Add Food item to restaurant
   */
  static async addFoodItem(restaurantIdOrCode: string, data: {
    name: string;
    code?: string;
    category?: string;
    price: number;
    description?: string;
    isAvailable?: boolean;
    tag?: string;
    image?: string;
  }) {
    const restaurant = await this.getRestaurantById(restaurantIdOrCode);

    let code = data.code;
    if (!code) {
      const count = await prisma.foodItem.count({ where: { restaurantId: restaurant.id } });
      const rCode = restaurant.code ? restaurant.code.replace('HTL-', '') : '001';
      code = `FOOD-${rCode}-${count + 1}`;
    }

    const foodItem = await prisma.foodItem.create({
      data: {
        restaurantId: restaurant.id,
        code,
        name: data.name,
        category: data.category || 'Main Dishes',
        price: Number(data.price),
        description: data.description || '',
        isAvailable: data.isAvailable !== undefined ? data.isAvailable : true,
        tag: data.tag || '',
        image: data.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80',
      },
    });

    return foodItem;
  }

  /**
   * Update Food item
   */
  static async updateFoodItem(foodIdOrCode: string, data: any) {
    const food = await prisma.foodItem.findFirst({
      where: {
        OR: [{ id: foodIdOrCode }, { code: foodIdOrCode }],
      },
    });

    if (!food) {
      throw new Error('Food item not found.');
    }

    const updated = await prisma.foodItem.update({
      where: { id: food.id },
      data: {
        ...data,
        price: data.price !== undefined ? Number(data.price) : undefined,
        updatedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Toggle Food item in-stock / out-of-stock availability
   */
  static async toggleFoodAvailability(foodIdOrCode: string, isAvailable?: boolean) {
    const food = await prisma.foodItem.findFirst({
      where: {
        OR: [{ id: foodIdOrCode }, { code: foodIdOrCode }],
      },
    });

    if (!food) {
      throw new Error('Food item not found.');
    }

    const targetAvailability = isAvailable !== undefined ? isAvailable : !food.isAvailable;

    const updated = await prisma.foodItem.update({
      where: { id: food.id },
      data: { isAvailable: targetAvailability },
    });

    return updated;
  }

  /**
   * Delete Food item
   */
  static async deleteFoodItem(foodIdOrCode: string) {
    const food = await prisma.foodItem.findFirst({
      where: {
        OR: [{ id: foodIdOrCode }, { code: foodIdOrCode }],
      },
    });

    if (!food) {
      throw new Error('Food item not found.');
    }

    await prisma.foodItem.delete({
      where: { id: food.id },
    });

    return { success: true, message: `Food item ${food.name} deleted successfully.` };
  }

  /**
   * Master dishes explorer across all establishments
   */
  static async getMasterFoods(options: {
    search?: string;
    restaurantId?: string;
    category?: string;
    isAvailable?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { search, restaurantId, category, isAvailable, page = 1, limit = 100 } = options;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { tag: { contains: search, mode: 'insensitive' } },
        { restaurant: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (restaurantId && restaurantId !== 'All') {
      where.OR = [
        { restaurantId: restaurantId },
        { restaurant: { code: restaurantId } },
      ];
    }

    if (category && category !== 'All') {
      where.category = category;
    }

    if (isAvailable !== undefined) {
      where.isAvailable = isAvailable;
    }

    const skip = (page - 1) * limit;

    const [foods, total] = await Promise.all([
      prisma.foodItem.findMany({
        where,
        include: {
          restaurant: {
            select: {
              id: true,
              code: true,
              name: true,
              category: true,
              status: true,
              address: true,
              deliveryFee: true,
              deliveryTime: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.foodItem.count({ where }),
    ]);

    return {
      foods,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Compute aggregate statistics
   */
  static async computeStats() {
    const totalHotels = await prisma.restaurant.count();
    const activeHotels = await prisma.restaurant.count({ where: { status: 'Active' } });
    const totalFoods = await prisma.foodItem.count();
    const availableFoods = await prisma.foodItem.count({ where: { isAvailable: true } });
    const outOfStockFoods = totalFoods - availableFoods;

    const avgPriceAgg = await prisma.foodItem.aggregate({
      _avg: {
        price: true,
      },
    });

    const averageFoodPrice = Math.round(avgPriceAgg._avg.price || 0);

    return {
      totalHotels,
      activeHotels,
      totalFoods,
      availableFoods,
      outOfStockFoods,
      averageFoodPrice,
    };
  }

  /**
   * Seed / Sync Default Bale Robe Hotels & Menu items into PostgreSQL
   */
  static async seedDefaults(force = false) {
    const existingCount = await prisma.restaurant.count();
    if (existingCount > 0 && !force) {
      return {
        message: 'Restaurants already exist in the database. Use force=true to re-sync.',
        count: existingCount,
      };
    }

    let createdHotelsCount = 0;
    let createdFoodsCount = 0;

    for (const h of initialHotels) {
      // Upsert Restaurant
      const restaurant = await prisma.restaurant.upsert({
        where: { code: h.id },
        update: {
          name: h.name,
          aliases: h.aliases || [],
          category: h.category || 'Cafe & Restaurant',
          cuisineType: h.cuisineType || 'Local & Traditional',
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
          cuisineType: h.cuisineType || 'Local & Traditional',
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

      // Upsert Foods
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

    const stats = await this.computeStats();

    return {
      success: true,
      message: `Successfully seeded ${createdHotelsCount} restaurants and ${createdFoodsCount} food items into PostgreSQL.`,
      stats,
    };
  }

  // ==========================================
  // CUSTOMER APP & PUBLIC FACING METHODS
  // ==========================================

  /**
   * List active restaurants for customers
   */
  static async getCustomerRestaurants(options: {
    search?: string;
    category?: string;
    cuisineType?: string;
  }) {
    const { search, category, cuisineType } = options;

    const where: any = {
      status: 'Active',
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { cuisineType: { contains: search, mode: 'insensitive' } },
        { foods: { some: { name: { contains: search, mode: 'insensitive' }, isAvailable: true } } },
      ];
    }

    if (category && category !== 'All') {
      where.category = category;
    }

    if (cuisineType && cuisineType !== 'All') {
      where.cuisineType = { contains: cuisineType, mode: 'insensitive' };
    }

    const restaurants = await prisma.restaurant.findMany({
      where,
      include: {
        foods: {
          where: { isAvailable: true },
          take: 8, // Preview dishes
        },
      },
      orderBy: [{ rating: 'desc' }, { name: 'asc' }],
    });

    return restaurants;
  }

  /**
   * Get restaurant menu for Customer ordering
   */
  static async getCustomerRestaurantMenu(idOrCode: string) {
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: idOrCode }],
        status: 'Active',
      },
      include: {
        foods: {
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        },
      },
    });

    if (!restaurant) {
      throw new Error('Restaurant not found or currently inactive.');
    }

    // Group foods by category
    const categoriesMap: { [cat: string]: any[] } = {};
    restaurant.foods.forEach((food) => {
      const cat = food.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(food);
    });

    const menuByCategory = Object.keys(categoriesMap).map((catName) => ({
      category: catName,
      items: categoriesMap[catName],
    }));

    return {
      restaurant,
      menuByCategory,
      totalMenuItems: restaurant.foods.length,
      availableItems: restaurant.foods.filter((f) => f.isAvailable).length,
    };
  }

  /**
   * Customer places a Food Delivery Order
   */
  static async createCustomerFoodOrder(
    customerId: string,
    data: {
      restaurantId: string;
      items: Array<{
        foodItemId?: string;
        name: string;
        price: number;
        quantity: number;
        notes?: string;
      }>;
      destination: string;
      destinationLatitude?: number;
      destinationLongitude?: number;
      receiverName: string;
      receiverPhone: string;
      specialInstructions?: string;
      paymentMethod?: string;
      paymentStatus?: string;
      receiptUrl?: string;
    }
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new Error('Customer account not found.');
    }

    const restaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { id: data.restaurantId },
          { code: data.restaurantId },
          { name: { contains: data.restaurantId, mode: 'insensitive' } },
        ],
      },
    });

    if (!restaurant) {
      throw new Error('Selected restaurant not found.');
    }

    if (restaurant.status !== 'Active') {
      throw new Error(`Cannot place order: ${restaurant.name} is currently closed/inactive.`);
    }

    // Calculate item subtotals and overall order total
    let subtotal = 0;
    const orderItemsData = data.items.map((item) => {
      const itemSubtotal = Number(item.price) * Number(item.quantity);
      subtotal += itemSubtotal;
      return {
        foodItemId: item.foodItemId || null,
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.quantity),
        subtotal: itemSubtotal,
        notes: item.notes || null,
      };
    });

    const deliveryFee = restaurant.deliveryFee || 60;
    const totalAmount = subtotal + deliveryFee;

    // Generate Order Number & Tracking Code
    const orderCount = await prisma.order.count();
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(orderCount + 1001).padStart(5, '0')}`;
    const trackingCode = generateTrackingCode();

    // Summary of food items for delivery parcel description
    const itemSummary = data.items.map((it) => `${it.quantity}x ${it.name}`).join(', ');

    const paymentMethod = data.paymentMethod || (data.receiptUrl ? 'DIGITAL_TRANSFER' : 'TELEBIRR');
    const paymentStatus = data.paymentStatus || (data.receiptUrl ? 'PAID_PENDING_VERIFICATION' : 'PENDING');

    // Create Delivery and Food Order in a transaction
    const [delivery, order] = await prisma.$transaction(async (tx) => {
      // 1. Create delivery record
      const dlv = await tx.delivery.create({
        data: {
          trackingCode,
          customerId,
          pickupLocation: `${restaurant.name}, ${restaurant.address}`,
          pickupLatitude: restaurant.latitude || null,
          pickupLongitude: restaurant.longitude || null,
          destination: data.destination,
          destinationLatitude: data.destinationLatitude || null,
          destinationLongitude: data.destinationLongitude || null,
          itemType: 'Food & Meals',
          itemDescription: `Food Order from ${restaurant.name}: ${itemSummary}`,
          receiverName: data.receiverName,
          receiverPhone: data.receiverPhone,
          specialInstructions: data.specialInstructions || null,
          paymentMethod,
          paymentStatus,
          receiptUrl: data.receiptUrl || null,
          status: 'PENDING',
          statusLogs: {
            create: {
              status: 'PENDING',
              updatedBy: customerId,
              notes: `Food order placed from ${restaurant.name}. Total: ETB ${totalAmount}.${data.receiptUrl ? ' Payment receipt attached.' : ''}`,
            },
          },
        },
      });

      // 2. Create food order
      const ord = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          restaurantId: restaurant.id,
          deliveryId: dlv.id,
          subtotal,
          deliveryFee,
          totalAmount,
          status: 'PENDING',
          paymentMethod,
          paymentStatus,
          receiptUrl: data.receiptUrl || null,
          specialInstructions: data.specialInstructions || null,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: true,
          restaurant: true,
          customer: {
            select: { id: true, fullName: true, phoneNumber: true, email: true },
          },
        },
      });

      return [dlv, ord];
    });

    // Generate OTP for delivery verification
    const otpCode = await OtpService.generateDeliveryOtp(delivery.id);

    // Notify Admins
    NotificationService.notifyAdmins(
      'New Food Order',
      `New food order ${order.orderNumber} placed at ${restaurant.name} by ${customer.fullName}. Total: ETB ${totalAmount}`,
      { orderId: order.id, deliveryId: delivery.id, trackingCode }
    ).catch(() => {});

    // Notify Customer
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: customerId,
      title: 'Food Order Confirmed',
      message: `Your food order ${order.orderNumber} from ${restaurant.name} has been placed! Delivery Tracking: ${trackingCode}`,
      metadata: { orderId: order.id, deliveryId: delivery.id, trackingCode },
    }).catch(() => {});

    return {
      order,
      delivery: {
        ...delivery,
        otpCode,
      },
    };
  }

  /**
   * Get Customer's food orders
   */
  static async getCustomerOrders(customerId: string) {
    const orders = await prisma.order.findMany({
      where: { customerId },
      include: {
        restaurant: {
          select: { id: true, code: true, name: true, category: true, address: true, banner: true, avatar: true },
        },
        items: true,
        delivery: {
          include: {
            rider: {
              select: { id: true, fullName: true, phoneNumber: true, vehicleInfo: true },
            },
            otp: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders;
  }

  /**
   * Get specific Food Order details
   */
  static async getOrderById(orderId: string, customerId?: string) {
    const where: any = { id: orderId };
    if (customerId) where.customerId = customerId;

    const order = await prisma.order.findFirst({
      where,
      include: {
        restaurant: true,
        items: true,
        customer: {
          select: { id: true, fullName: true, phoneNumber: true, email: true, address: true },
        },
        delivery: {
          include: {
            rider: {
              select: { id: true, fullName: true, phoneNumber: true, vehicleInfo: true, currentLatitude: true, currentLongitude: true },
            },
            statusLogs: {
              orderBy: { createdAt: 'asc' },
            },
            otp: true,
          },
        },
      },
    });

    if (!order) {
      throw new Error('Food order not found.');
    }

    return order;
  }
}
