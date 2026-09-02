import { prisma } from '../config/prisma';
import { generate6DigitOTP } from '../utils/otpGenerator';

export class OtpService {
  /**
   * Generates a 6-digit random OTP and associates it with the delivery.
   */
  static async generateDeliveryOtp(deliveryId: string): Promise<string> {
    const otpCode = generate6DigitOTP();

    await prisma.oTP.upsert({
      where: { deliveryId },
      update: {
        otpCode,
        isVerified: false,
        verifiedAt: null,
      },
      create: {
        deliveryId,
        otpCode,
        isVerified: false,
      },
    });

    return otpCode;
  }

  /**
   * Retrieves active OTP for a delivery (used by customer to view and give to rider).
   */
  static async getDeliveryOtp(deliveryId: string) {
    return prisma.oTP.findUnique({
      where: { deliveryId },
      select: {
        otpCode: true,
        isVerified: true,
        createdAt: true,
      },
    });
  }

  /**
   * Verifies OTP entered by the Rider.
   */
  static async verifyDeliveryOtp(deliveryId: string, enteredOtp: string): Promise<boolean> {
    const otpRecord = await prisma.oTP.findUnique({
      where: { deliveryId },
    });

    if (!otpRecord) return false;
    if (otpRecord.isVerified) return true; // Already verified

    if (otpRecord.otpCode === enteredOtp.trim()) {
      await prisma.oTP.update({
        where: { deliveryId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      return true;
    }

    return false;
  }
}
