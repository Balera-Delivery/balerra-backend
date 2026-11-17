import { prisma } from '../config/prisma';
import { PromotionService } from './promotion.service';

/**
 * PricingService is the single source of truth for checkout prices.
 * The customer app shows the quote returned here, and createDelivery saves the
 * exact same numbers, so what the customer pays always matches what is stored.
 *
 * Rules:
 * - Food: dish prices come from the database (never from the client).
 * - Delivery fee: one fee for every order, set by the admin (setting `delivery_fee`).
 *   Food carts with dishes from several restaurants add `extra_stop_fee` for each
 *   additional restaurant (one rider, several pickups).
 * - No service fee.
 */

export const PRICING_SETTING_KEYS = {
  DELIVERY_FEE: 'delivery_fee',
  EXTRA_STOP_FEE: 'extra_stop_fee',
} as const;

const SETTING_DEFAULTS: Record<string, number> = {
  [PRICING_SETTING_KEYS.DELIVERY_FEE]: 100,
  [PRICING_SETTING_KEYS.EXTRA_STOP_FEE]: 30,
};

const MAX_QUANTITY_PER_DISH = 50;

export class PricingError extends Error {
  statusCode = 400;
}

export interface CartItemInput {
  foodItemId: string;
  quantity?: number;
  notes?: string;
}

export interface QuoteLine {
  foodItemId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  notes: string | null;
}

export interface RestaurantGroup {
  restaurantId: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  deliveryFee: number;
  subtotal: number;
  items: QuoteLine[];
}

export interface Quote {
  type: 'FOOD' | 'PACKAGE';
  restaurants: RestaurantGroup[];
  subtotal: number;
  baseDeliveryFee: number;
  extraStops: number;
  extraStopFee: number;
  deliveryFee: number;
  discount: number;
  promoCode: string | null;
  promotionId: string | null;
  promoMessage: string | null;
  total: number;
}

interface PromoOptions {
  promoCode?: string | null;
  customerId?: string;
  /** When true an invalid promo code throws (used when saving the order). */
  strictPromo?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class PricingService {
  static async getNumberSetting(key: string): Promise<number> {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const parsed = row ? parseFloat(row.value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : SETTING_DEFAULTS[key] ?? 0;
  }

  /** Quote a food cart that may contain dishes from several restaurants. */
  static async quoteFood(items: CartItemInput[], options: PromoOptions = {}): Promise<Quote> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new PricingError('Your cart is empty. Please add at least one dish.');
    }

    // Merge duplicate dishes and validate quantities, keeping the cart order.
    const merged = new Map<string, { quantity: number; notes: string | null }>();
    for (const item of items) {
      if (!item.foodItemId) throw new PricingError('Each cart item must include a foodItemId.');
      const qty = Math.floor(Number(item.quantity ?? 1));
      if (!Number.isFinite(qty) || qty < 1) throw new PricingError('Quantity must be at least 1.');
      const existing = merged.get(item.foodItemId);
      const totalQty = (existing?.quantity ?? 0) + qty;
      if (totalQty > MAX_QUANTITY_PER_DISH) {
        throw new PricingError(`You can order at most ${MAX_QUANTITY_PER_DISH} of the same dish.`);
      }
      merged.set(item.foodItemId, { quantity: totalQty, notes: item.notes?.trim() || existing?.notes || null });
    }

    const ids = [...merged.keys()];
    const foods = await prisma.foodItem.findMany({
      where: { id: { in: ids } },
      include: { restaurant: true },
    });
    const foodById = new Map(foods.map((f) => [f.id, f]));

    const missing = ids.filter((id) => !foodById.has(id));
    if (missing.length > 0) {
      throw new PricingError('Some dishes in your cart are no longer available. Please refresh the menu and try again.');
    }

    const groups = new Map<string, RestaurantGroup>();
    for (const id of ids) {
      const food = foodById.get(id)!;
      const restaurant = food.restaurant;
      if (!food.isAvailable) {
        throw new PricingError(`"${food.name}" is currently unavailable. Please remove it from your cart.`);
      }
      if ((restaurant.status || '').toLowerCase() === 'inactive') {
        throw new PricingError(`${restaurant.name} is not accepting orders right now. Please remove its dishes from your cart.`);
      }

      const { quantity, notes } = merged.get(id)!;
      const line: QuoteLine = {
        foodItemId: food.id,
        name: food.name,
        price: food.price,
        quantity,
        subtotal: round2(food.price * quantity),
        notes,
      };

      let group = groups.get(restaurant.id);
      if (!group) {
        group = {
          restaurantId: restaurant.id,
          name: restaurant.name,
          address: restaurant.address,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          deliveryFee: restaurant.deliveryFee,
          subtotal: 0,
          items: [],
        };
        groups.set(restaurant.id, group);
      }
      group.items.push(line);
      group.subtotal = round2(group.subtotal + line.subtotal);
    }

    const restaurants = [...groups.values()];
    const subtotal = round2(restaurants.reduce((sum, g) => sum + g.subtotal, 0));
    // One delivery fee for the whole platform (admin setting), not per restaurant
    const baseDeliveryFee = await this.getNumberSetting(PRICING_SETTING_KEYS.DELIVERY_FEE);
    restaurants.forEach((g) => { g.deliveryFee = baseDeliveryFee; });
    const extraStops = restaurants.length - 1;
    const extraStopFee = extraStops > 0 ? await this.getNumberSetting(PRICING_SETTING_KEYS.EXTRA_STOP_FEE) : 0;
    const deliveryFee = round2(baseDeliveryFee + extraStops * extraStopFee);

    const promo = await this.applyPromo(options, {
      orderAmount: subtotal,
      deliveryFee,
      deliveryType: 'FOOD',
      restaurants,
    });

    return {
      type: 'FOOD',
      restaurants,
      subtotal,
      baseDeliveryFee,
      extraStops,
      extraStopFee,
      deliveryFee,
      ...promo,
      total: round2(Math.max(0, subtotal + deliveryFee - promo.discount)),
    };
  }

  /** Quote a package (non-food) delivery. */
  static async quotePackage(options: PromoOptions = {}): Promise<Quote> {
    const deliveryFee = await this.getNumberSetting(PRICING_SETTING_KEYS.DELIVERY_FEE);
    const promo = await this.applyPromo(options, {
      orderAmount: 0,
      deliveryFee,
      deliveryType: 'PACKAGE',
      restaurants: [],
    });

    return {
      type: 'PACKAGE',
      restaurants: [],
      subtotal: 0,
      baseDeliveryFee: deliveryFee,
      extraStops: 0,
      extraStopFee: 0,
      deliveryFee,
      ...promo,
      total: round2(Math.max(0, deliveryFee - promo.discount)),
    };
  }

  private static async applyPromo(
    options: PromoOptions,
    ctx: { orderAmount: number; deliveryFee: number; deliveryType: 'FOOD' | 'PACKAGE'; restaurants: RestaurantGroup[] }
  ): Promise<Pick<Quote, 'discount' | 'promoCode' | 'promotionId' | 'promoMessage'>> {
    const none = { discount: 0, promoCode: null, promotionId: null, promoMessage: null };
    const code = options.promoCode?.trim();
    if (!code) return none;

    const reject = (message: string) => {
      if (options.strictPromo) throw new PricingError(message);
      return { ...none, promoMessage: message };
    };

    // Partner promos only discount the matching restaurant's part of the cart.
    let orderAmount = ctx.orderAmount;
    let restaurantId: string | undefined = ctx.restaurants[0]?.restaurantId;
    const promoTarget = await prisma.promotion.findUnique({
      where: { code: code.toUpperCase() },
      select: { restaurantId: true },
    });
    if (promoTarget?.restaurantId) {
      const match = ctx.restaurants.find((g) => g.restaurantId === promoTarget.restaurantId);
      if (match) {
        orderAmount = match.subtotal;
        restaurantId = match.restaurantId;
      }
    }

    const result: any = await PromotionService.validatePromotion({
      code,
      orderAmount,
      deliveryFee: ctx.deliveryFee,
      deliveryType: ctx.deliveryType,
      restaurantId,
      customerId: options.customerId,
    });

    if (!result.valid) return reject(result.message || 'This promo code cannot be used.');

    const maxDiscount = ctx.orderAmount + ctx.deliveryFee;
    return {
      discount: round2(Math.min(Number(result.discountAmount) || 0, maxDiscount)),
      promoCode: result.promotion?.code ?? code.toUpperCase(),
      promotionId: result.promotion?.id ?? null,
      promoMessage: result.message ?? null,
    };
  }
}
