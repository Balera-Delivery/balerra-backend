import { prisma } from '../config/prisma';
import { PromotionType, DiscountType } from '@prisma/client';

export interface CreatePromotionDto {
  code: string;
  title: string;
  description?: string;
  promotionType?: PromotionType;
  discountType?: DiscountType;
  discountValue: number;
  maxDiscount?: number;
  minOrderAmount?: number;
  totalUsageLimit?: number;
  perUserLimit?: number;
  startDate?: string | Date;
  endDate?: string | Date;
  isActive?: boolean;
  applicableType?: string; // ALL, FOOD_ONLY, PACKAGE_ONLY, PARTNER_ONLY
  restaurantId?: string;
}

export interface ValidatePromotionDto {
  code: string;
  orderAmount: number;
  deliveryFee?: number;
  deliveryType?: 'FOOD' | 'PACKAGE' | string;
  restaurantId?: string;
  customerId?: string;
}

export class PromotionService {
  /**
   * Get all promotions with optional filtering
   */
  static async getPromotions(filters?: {
    type?: PromotionType;
    isActive?: boolean;
    search?: string;
  }) {
    const where: any = {};

    if (filters?.type) {
      where.promotionType = filters.type;
    }

    if (typeof filters?.isActive === 'boolean') {
      where.isActive = filters.isActive;
    }

    if (filters?.search) {
      where.OR = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    return prisma.promotion.findMany({
      where,
      include: {
        restaurant: {
          select: { id: true, name: true, code: true }
        },
        _count: {
          select: { redemptions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Get promotion by ID
   */
  static async getPromotionById(id: string) {
    const promo = await prisma.promotion.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: { id: true, name: true, code: true }
        },
        redemptions: {
          take: 50,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!promo) {
      throw new Error('Promotion campaign not found.');
    }

    return promo;
  }

  /**
   * Create new promotion
   */
  static async createPromotion(data: CreatePromotionDto) {
    const normalizedCode = data.code.trim().toUpperCase();

    const existing = await prisma.promotion.findUnique({
      where: { code: normalizedCode }
    });

    if (existing) {
      throw new Error(`Promotion code "${normalizedCode}" already exists.`);
    }

    return prisma.promotion.create({
      data: {
        code: normalizedCode,
        title: data.title,
        description: data.description,
        promotionType: data.promotionType || PromotionType.PROMO_CODE,
        discountType: data.discountType || DiscountType.PERCENTAGE,
        discountValue: Number(data.discountValue),
        maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : null,
        minOrderAmount: data.minOrderAmount ? Number(data.minOrderAmount) : 0,
        totalUsageLimit: data.totalUsageLimit ? Number(data.totalUsageLimit) : null,
        perUserLimit: data.perUserLimit ? Number(data.perUserLimit) : 1,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        isActive: data.isActive !== undefined ? data.isActive : true,
        applicableType: data.applicableType || 'ALL',
        restaurantId: data.restaurantId || null
      },
      include: {
        restaurant: {
          select: { id: true, name: true, code: true }
        }
      }
    });
  }

  /**
   * Update promotion
   */
  static async updatePromotion(id: string, data: Partial<CreatePromotionDto>) {
    const promo = await prisma.promotion.findUnique({ where: { id } });
    if (!promo) {
      throw new Error('Promotion not found.');
    }

    const updateData: any = { ...data };

    if (data.code) {
      updateData.code = data.code.trim().toUpperCase();
      if (updateData.code !== promo.code) {
        const existing = await prisma.promotion.findUnique({
          where: { code: updateData.code }
        });
        if (existing) {
          throw new Error(`Promotion code "${updateData.code}" is already in use.`);
        }
      }
    }

    if (data.discountValue !== undefined) updateData.discountValue = Number(data.discountValue);
    if (data.maxDiscount !== undefined) updateData.maxDiscount = data.maxDiscount ? Number(data.maxDiscount) : null;
    if (data.minOrderAmount !== undefined) updateData.minOrderAmount = Number(data.minOrderAmount);
    if (data.totalUsageLimit !== undefined) updateData.totalUsageLimit = data.totalUsageLimit ? Number(data.totalUsageLimit) : null;
    if (data.perUserLimit !== undefined) updateData.perUserLimit = Number(data.perUserLimit);
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    return prisma.promotion.update({
      where: { id },
      data: updateData,
      include: {
        restaurant: {
          select: { id: true, name: true, code: true }
        }
      }
    });
  }

  /**
   * Toggle promotion active status
   */
  static async togglePromotionStatus(id: string) {
    const promo = await prisma.promotion.findUnique({ where: { id } });
    if (!promo) {
      throw new Error('Promotion not found.');
    }

    return prisma.promotion.update({
      where: { id },
      data: { isActive: !promo.isActive }
    });
  }

  /**
   * Delete promotion
   */
  static async deletePromotion(id: string) {
    const promo = await prisma.promotion.findUnique({ where: { id } });
    if (!promo) {
      throw new Error('Promotion not found.');
    }

    return prisma.promotion.delete({ where: { id } });
  }

  /**
   * Validate promotion code for an order
   */
  static async validatePromotion(dto: ValidatePromotionDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    const now = new Date();

    const promo = await prisma.promotion.findUnique({
      where: { code: normalizedCode },
      include: {
        restaurant: {
          select: { id: true, name: true }
        }
      }
    });

    if (!promo) {
      return {
        valid: false,
        message: 'Invalid promo code. Please check and try again.'
      };
    }

    if (!promo.isActive) {
      return {
        valid: false,
        message: 'This promotion is currently paused or inactive.'
      };
    }

    if (promo.startDate && promo.startDate > now) {
      return {
        valid: false,
        message: 'This promotion campaign has not started yet.'
      };
    }

    if (promo.endDate && promo.endDate < now) {
      return {
        valid: false,
        message: 'This promo code has expired.'
      };
    }

    if (promo.totalUsageLimit && promo.usedCount >= promo.totalUsageLimit) {
      return {
        valid: false,
        message: 'This promotion has reached its maximum total redemptions.'
      };
    }

    if (dto.orderAmount < promo.minOrderAmount) {
      return {
        valid: false,
        message: `Order amount must be at least ${promo.minOrderAmount} Birr to use this promo code.`
      };
    }

    // Check restaurant target if partner discount
    if (promo.promotionType === PromotionType.PARTNER_DISCOUNT && promo.restaurantId) {
      if (dto.restaurantId !== promo.restaurantId) {
        return {
          valid: false,
          message: `This discount is only valid for orders from ${promo.restaurant?.name || 'the designated partner restaurant'}.`
        };
      }
    }

    // Check user redemption limit if customerId is provided
    if (dto.customerId && promo.perUserLimit > 0) {
      const userRedemptions = await prisma.promotionRedemption.count({
        where: {
          promotionId: promo.id,
          customerId: dto.customerId
        }
      });

      if (userRedemptions >= promo.perUserLimit) {
        return {
          valid: false,
          message: `You have already used this promo code the maximum allowed times (${promo.perUserLimit}).`
        };
      }
    }

    // Calculate discount amount
    const deliveryFee = dto.deliveryFee || 60.0;
    let discountAmount = 0;

    if (promo.promotionType === PromotionType.FREE_DELIVERY) {
      discountAmount = deliveryFee;
    } else if (promo.discountType === DiscountType.PERCENTAGE) {
      discountAmount = (dto.orderAmount * promo.discountValue) / 100;
      if (promo.maxDiscount && discountAmount > promo.maxDiscount) {
        discountAmount = promo.maxDiscount;
      }
    } else {
      // FIXED_AMOUNT
      discountAmount = Math.min(dto.orderAmount, promo.discountValue);
    }

    // Round to 2 decimal places
    discountAmount = Math.round(discountAmount * 100) / 100;
    const finalAmount = Math.max(0, (dto.orderAmount + deliveryFee) - discountAmount);

    return {
      valid: true,
      message: 'Promotion successfully applied!',
      discountAmount,
      finalAmount,
      promotion: {
        id: promo.id,
        code: promo.code,
        title: promo.title,
        promotionType: promo.promotionType,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        maxDiscount: promo.maxDiscount,
        minOrderAmount: promo.minOrderAmount
      }
    };
  }

  /**
   * Record a redemption
   */
  static async recordRedemption(params: {
    promotionId: string;
    customerId: string;
    orderId?: string;
    discountApplied: number;
  }) {
    const [redemption] = await prisma.$transaction([
      prisma.promotionRedemption.create({
        data: {
          promotionId: params.promotionId,
          customerId: params.customerId,
          orderId: params.orderId,
          discountApplied: params.discountApplied
        }
      }),
      prisma.promotion.update({
        where: { id: params.promotionId },
        data: { usedCount: { increment: 1 } }
      })
    ]);

    return redemption;
  }
}
