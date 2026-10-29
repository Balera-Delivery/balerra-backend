import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { signToken } from '../utils/jwt';
import { Roles, RoleType } from '../constants/roles';
import { NotificationService } from './notification.service';

/**
 * Normalizes phone numbers to standard format (+251...)
 * Handles: "+251 911 000 001", "0911 000 001", "251911000001", "911000001"
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('251') && digits.length >= 12) {
    return '+' + digits;
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    return '+251' + digits.slice(1);
  }
  if (digits.length === 9 && (digits.startsWith('9') || digits.startsWith('7'))) {
    return '+251' + digits;
  }
  if (phone.trim().startsWith('+')) {
    return '+' + digits;
  }
  return phone.trim();
}

/**
 * Returns all possible variations of a phone number (normalized, local 09..., with/without +, with spaces)
 */
export function getPhoneVariations(phone: string): string[] {
  if (!phone) return [];
  const raw = phone.trim();
  const norm = normalizePhoneNumber(phone);
  const digits = phone.replace(/[^\d]/g, '');
  const variations = new Set<string>();

  if (raw) variations.add(raw);
  if (norm) variations.add(norm);
  if (digits) {
    variations.add(digits);
    if (norm.startsWith('+251')) {
      const local = '0' + norm.slice(4);
      variations.add(local);
      variations.add(norm.slice(1)); // 251...
      if (norm.length === 13) {
        variations.add(`${norm.slice(0, 4)} ${norm.slice(4, 7)} ${norm.slice(7, 10)} ${norm.slice(10)}`);
        variations.add(`${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`);
      }
    }
  }
  return Array.from(variations);
}

export class AuthService {
  /**
   * Register a new Customer (Immediate active)
   */
  static async registerCustomer(data: {
    fullName: string;
    phoneNumber: string;
    email?: string;
    password: string;
    address?: string;
  }) {
    // Check for existing phone number
    const existingPhone = await prisma.customer.findUnique({
      where: { phoneNumber: data.phoneNumber },
    });
    if (existingPhone) {
      throw new Error('Phone number is already registered.');
    }

    // Check for existing email if provided
    if (data.email && data.email.trim() !== '') {
      const existingEmail = await prisma.customer.findUnique({
        where: { email: data.email },
      });
      if (existingEmail) {
        throw new Error('Email address is already registered.');
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const customer = await prisma.customer.create({
      data: {
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        email: data.email && data.email.trim() !== '' ? data.email : null,
        password: hashedPassword,
        address: data.address || null,
        status: 'ACTIVE',
      },
    });

    const token = signToken({
      userId: customer.id,
      role: Roles.CUSTOMER,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
    });

    // Notify admins of new customer registration
    NotificationService.notifyAdmins(
      'New Customer Registered',
      `${customer.fullName} (${customer.phoneNumber}) has joined the platform.`,
      { customerId: customer.id }
    ).catch(() => {});

    return {
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phoneNumber: customer.phoneNumber,
        email: customer.email,
        address: customer.address,
        status: customer.status,
        createdAt: customer.createdAt,
      },
      token,
    };
  }

  /**
   * Customer Login (Supports either email OR phoneNumber)
   */
  static async loginCustomer(identifier: string, passwordPlain: string) {
    const isEmail = identifier.includes('@');
    const cleanId = identifier.trim();
    let customer: any = null;

    if (isEmail) {
      customer = await prisma.customer.findUnique({ where: { email: cleanId } });
    } else {
      const candidates = getPhoneVariations(cleanId);
      customer = await prisma.customer.findFirst({
        where: { phoneNumber: { in: candidates } },
      });
      if (!customer) {
        const norm = normalizePhoneNumber(cleanId);
        const allCust = await prisma.customer.findMany({ select: { id: true, phoneNumber: true } });
        const match = allCust.find(c => normalizePhoneNumber(c.phoneNumber) === norm);
        if (match) {
          customer = await prisma.customer.findUnique({ where: { id: match.id } });
        }
      }
    }

    if (!customer) {
      throw new Error('Invalid phone number/email or password.');
    }

    if (customer.status === 'SUSPENDED') {
      throw new Error('Your account has been suspended. Please contact support.');
    }

    const isMatch = await bcrypt.compare(passwordPlain, customer.password);
    if (!isMatch) {
      throw new Error('Invalid phone number/email or password.');
    }

    const token = signToken({
      userId: customer.id,
      role: Roles.CUSTOMER,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
    });

    return {
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phoneNumber: customer.phoneNumber,
        email: customer.email,
        address: customer.address,
        status: customer.status,
      },
      token,
    };
  }

  /**
   * Register a new Rider (Starts with PENDING_APPROVAL)
   */
  static async registerRider(data: {
    fullName: string;
    email?: string;
    phoneNumber: string;
    password: string;
    vehicleInfo?: string;
  }) {
    if (data.email && data.email.trim() !== '') {
      const existingEmail = await prisma.rider.findUnique({
        where: { email: data.email.trim() },
      });
      if (existingEmail) {
        throw new Error('Email address is already registered for a rider.');
      }
    }

    const normPhone = normalizePhoneNumber(data.phoneNumber);
    const phoneCandidates = getPhoneVariations(data.phoneNumber);

    const existingPhone = await prisma.rider.findFirst({
      where: {
        phoneNumber: { in: phoneCandidates },
        isDeleted: false,
      },
    });
    if (existingPhone) {
      throw new Error('Phone number is already registered for a rider.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const rider = await prisma.rider.create({
      data: {
        fullName: data.fullName,
        email: data.email && data.email.trim() !== '' ? data.email.trim() : null,
        phoneNumber: normPhone,
        password: hashedPassword,
        vehicleInfo: data.vehicleInfo || null,
        accountStatus: 'PENDING_APPROVAL',
        availabilityStatus: 'OFFLINE',
        isPhoneVerified: false,
      },
    });

    // Generate initial SMS OTP for phone verification
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.phoneVerification.create({
      data: {
        phoneNumber: rider.phoneNumber,
        code: otpCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });
    console.log(`[SMS OTP] Verification code for ${rider.phoneNumber}: ${otpCode}`);

    // Notify admins to review the new rider registration
    NotificationService.notifyAdmins(
      'New Rider Application',
      `Rider ${rider.fullName} (${rider.phoneNumber}) registered and is awaiting approval.`,
      { riderId: rider.id }
    ).catch(() => {});

    return {
      id: rider.id,
      fullName: rider.fullName,
      email: rider.email,
      phoneNumber: rider.phoneNumber,
      accountStatus: rider.accountStatus,
      isPhoneVerified: rider.isPhoneVerified,
      message: 'Registration submitted successfully. Please verify your phone number.',
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otpCode } : {}),
    };
  }

  /**
   * Rider Login (Accepts phone number or email, and checks active / not deleted / not deactivated)
   */
  static async loginRider(identifier: string, passwordPlain: string) {
    const cleanId = identifier.trim();
    const phoneCandidates = getPhoneVariations(cleanId);

    let rider = await prisma.rider.findFirst({
      where: {
        OR: [
          ...phoneCandidates.map(p => ({ phoneNumber: p })),
          { email: cleanId },
        ],
      },
    });

    if (!rider) {
      // Robust fallback: search across active riders matching normalized digits
      const normInput = normalizePhoneNumber(cleanId);
      const allRiders = await prisma.rider.findMany({
        where: { isDeleted: false },
        select: { id: true, phoneNumber: true },
      });
      const match = allRiders.find(r => normalizePhoneNumber(r.phoneNumber) === normInput);
      if (match) {
        rider = await prisma.rider.findUnique({ where: { id: match.id } });
      }
    }

    if (!rider) {
      throw new Error('Invalid phone number or password.');
    }

    if (rider.isDeleted) {
      throw new Error('This rider account has been removed. Please contact administration.');
    }

    if (rider.isDeactivated) {
      throw new Error('Your rider account is currently deactivated. Please contact administration.');
    }

    const isMatch = await bcrypt.compare(passwordPlain, rider.password);
    if (!isMatch) {
      throw new Error('Invalid phone number or password.');
    }

    if (rider.accountStatus === 'PENDING_APPROVAL') {
      if (rider.isPhoneVerified || process.env.NODE_ENV !== 'production') {
        // Auto-activate verified rider in non-production or upon OTP verification
        await prisma.rider.update({
          where: { id: rider.id },
          data: { accountStatus: 'ACTIVE' },
        });
        rider.accountStatus = 'ACTIVE';
      } else {
        throw new Error('Your account is pending admin approval. You will be notified once activated.');
      }
    }

    if (rider.accountStatus === 'SUSPENDED') {
      throw new Error('Your rider account has been suspended. Please contact administration.');
    }

    const token = signToken({
      userId: rider.id,
      role: Roles.RIDER,
      email: rider.email,
      phoneNumber: rider.phoneNumber,
    });

    return {
      rider: {
        id: rider.id,
        fullName: rider.fullName,
        email: rider.email,
        phoneNumber: rider.phoneNumber,
        vehicleInfo: rider.vehicleInfo,
        availabilityStatus: rider.availabilityStatus,
        accountStatus: rider.accountStatus,
        isPhoneVerified: rider.isPhoneVerified,
      },
      token,
    };
  }

  /**
   * Send Phone Verification SMS OTP
   */
  static async sendPhoneOtp(phoneNumber: string) {
    const cleanPhone = phoneNumber.trim();
    const normPhone = normalizePhoneNumber(cleanPhone);
    const candidates = getPhoneVariations(cleanPhone);
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Invalidate previous unverified codes for this phone (any variation)
    await prisma.phoneVerification.deleteMany({
      where: { phoneNumber: { in: candidates }, isVerified: false },
    });

    await prisma.phoneVerification.create({
      data: {
        phoneNumber: normPhone,
        code: otpCode,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    console.log(`[SMS OTP Service] Sent verification code to ${normPhone}: ${otpCode}`);
    return {
      success: true,
      message: `Verification code sent to ${cleanPhone}.`,
      // For development/testing convenience, include code in non-production
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otpCode } : {}),
    };
  }

  /**
   * Verify Phone SMS OTP
   */
  static async verifyPhoneOtp(phoneNumber: string, code: string) {
    const cleanPhone = phoneNumber.trim();
    const cleanCode = code.trim();
    const candidates = getPhoneVariations(cleanPhone);

    const record = await prisma.phoneVerification.findFirst({
      where: {
        phoneNumber: { in: candidates },
        code: cleanCode,
        isVerified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new Error('Invalid or expired verification code.');
    }

    await prisma.phoneVerification.update({
      where: { id: record.id },
      data: { isVerified: true },
    });

    // Mark rider as verified and active
    await prisma.rider.updateMany({
      where: { phoneNumber: { in: candidates } },
      data: { isPhoneVerified: true, accountStatus: 'ACTIVE' },
    });

    return {
      success: true,
      message: 'Phone number verified successfully.',
    };
  }

  /**
   * Reset Password with Phone SMS OTP
   */
  static async resetPasswordWithOtp(phoneNumber: string, code: string, newPassword: string) {
    const cleanPhone = phoneNumber.trim();
    const cleanCode = code.trim();
    const candidates = getPhoneVariations(cleanPhone);

    const record = await prisma.phoneVerification.findFirst({
      where: {
        phoneNumber: { in: candidates },
        code: cleanCode,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new Error('Invalid or expired verification code.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const rider = await prisma.rider.findFirst({
      where: { phoneNumber: { in: candidates } },
    });

    const customer = await prisma.customer.findFirst({
      where: { phoneNumber: { in: candidates } },
    });

    if (!rider && !customer) {
      throw new Error('No account found associated with this phone number.');
    }

    if (rider) {
      await prisma.rider.update({
        where: { id: rider.id },
        data: {
          password: hashedPassword,
          isPhoneVerified: true,
          accountStatus: 'ACTIVE',
        },
      });
    }

    if (customer) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          password: hashedPassword,
        },
      });
    }

    await prisma.phoneVerification.update({
      where: { id: record.id },
      data: { isVerified: true },
    });

    return {
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    };
  }

  /**
   * Admin Login
   */
  static async loginAdmin(email: string, passwordPlain: string) {
    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      throw new Error('Invalid admin email or password.');
    }

    const isMatch = await bcrypt.compare(passwordPlain, admin.password);
    if (!isMatch) {
      throw new Error('Invalid admin email or password.');
    }

    const token = signToken({
      userId: admin.id,
      role: Roles.ADMIN,
      email: admin.email,
    });

    return {
      admin: {
        id: admin.id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
      },
      token,
    };
  }

  /**
   * Get Current User Profile (by Token info)
   */
  static async getMe(userId: string, role: RoleType) {
    if (role === Roles.CUSTOMER) {
      const customer = await prisma.customer.findUnique({
        where: { id: userId },
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
      return { user: customer, role };
    }

    if (role === Roles.RIDER) {
      const rider = await prisma.rider.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          vehicleInfo: true,
          availabilityStatus: true,
          accountStatus: true,
          createdAt: true,
        },
      });
      return { user: rider, role };
    }

    if (role === Roles.ADMIN) {
      const admin = await prisma.admin.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });
      return { user: admin, role };
    }

    throw new Error('Invalid user role.');
  }

  /**
   * Change Password
   */
  static async changePassword(
    userId: string,
    role: RoleType,
    currentPasswordPlain: string,
    newPasswordPlain: string
  ) {
    let currentHash = '';

    if (role === Roles.CUSTOMER) {
      const customer = await prisma.customer.findUnique({ where: { id: userId } });
      if (!customer) throw new Error('Customer not found.');
      currentHash = customer.password;
    } else if (role === Roles.RIDER) {
      const rider = await prisma.rider.findUnique({ where: { id: userId } });
      if (!rider) throw new Error('Rider not found.');
      currentHash = rider.password;
    } else if (role === Roles.ADMIN) {
      const admin = await prisma.admin.findUnique({ where: { id: userId } });
      if (!admin) throw new Error('Admin not found.');
      currentHash = admin.password;
    }

    const isMatch = await bcrypt.compare(currentPasswordPlain, currentHash);
    if (!isMatch) {
      throw new Error('Current password is incorrect.');
    }

    const newHash = await bcrypt.hash(newPasswordPlain, 10);

    if (role === Roles.CUSTOMER) {
      await prisma.customer.update({ where: { id: userId }, data: { password: newHash } });
    } else if (role === Roles.RIDER) {
      await prisma.rider.update({ where: { id: userId }, data: { password: newHash } });
    } else if (role === Roles.ADMIN) {
      await prisma.admin.update({ where: { id: userId }, data: { password: newHash } });
    }

    return true;
  }

  /**
   * Update FCM Token
   */
  static async updateFcmToken(userId: string, role: RoleType, fcmToken: string) {
    if (role === Roles.CUSTOMER) {
      await prisma.customer.update({ where: { id: userId }, data: { fcmToken } });
    } else if (role === Roles.RIDER) {
      await prisma.rider.update({ where: { id: userId }, data: { fcmToken } });
    } else if (role === Roles.ADMIN) {
      await prisma.admin.update({ where: { id: userId }, data: { fcmToken } });
    }
    return true;
  }
}
