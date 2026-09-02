import { prisma } from '../config/prisma';

export class CustomerService {
  /**
   * Get Customer Profile
   */
  static async getProfile(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        address: true,
        status: true,
        createdAt: true,
      },
    });

    if (!customer) throw new Error('Customer profile not found.');
    return customer;
  }

  /**
   * Update Customer Profile
   */
  static async updateProfile(
    customerId: string,
    data: {
      fullName?: string;
      phoneNumber?: string;
      email?: string;
      address?: string;
    }
  ) {
    if (data.phoneNumber) {
      const existingPhone = await prisma.customer.findFirst({
        where: {
          phoneNumber: data.phoneNumber,
          NOT: { id: customerId },
        },
      });
      if (existingPhone) throw new Error('Phone number is already in use by another account.');
    }

    if (data.email && data.email.trim() !== '') {
      const existingEmail = await prisma.customer.findFirst({
        where: {
          email: data.email,
          NOT: { id: customerId },
        },
      });
      if (existingEmail) throw new Error('Email is already in use by another account.');
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.phoneNumber && { phoneNumber: data.phoneNumber }),
        ...(data.email !== undefined && { email: data.email ? data.email : null }),
        ...(data.address !== undefined && { address: data.address }),
      },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        address: true,
        status: true,
        updatedAt: true,
      },
    });

    return updated;
  }
}
