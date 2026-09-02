import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';
import { sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';
import { prisma } from '../config/prisma';
import { Roles } from '../constants/roles';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export const authenticateJwt = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError({
      res,
      statusCode: HttpStatus.UNAUTHORIZED,
      message: 'Access denied. No token provided.',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);

    // Verify user exists and check active status
    if (decoded.role === Roles.CUSTOMER) {
      const customer = await prisma.customer.findUnique({ where: { id: decoded.userId } });
      if (!customer) {
        sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: 'User not found.' });
        return;
      }
      if (customer.status === 'SUSPENDED') {
        sendError({ res, statusCode: HttpStatus.FORBIDDEN, message: 'Your customer account is suspended.' });
        return;
      }
    } else if (decoded.role === Roles.RIDER) {
      const rider = await prisma.rider.findUnique({ where: { id: decoded.userId } });
      if (!rider) {
        sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: 'Rider not found.' });
        return;
      }
      if (rider.accountStatus === 'SUSPENDED') {
        sendError({ res, statusCode: HttpStatus.FORBIDDEN, message: 'Your rider account is suspended.' });
        return;
      }
      if (rider.accountStatus === 'PENDING_APPROVAL') {
        sendError({ res, statusCode: HttpStatus.FORBIDDEN, message: 'Your rider account is pending admin approval.' });
        return;
      }
    } else if (decoded.role === Roles.ADMIN) {
      const admin = await prisma.admin.findUnique({ where: { id: decoded.userId } });
      if (!admin) {
        sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: 'Admin not found.' });
        return;
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    sendError({
      res,
      statusCode: HttpStatus.UNAUTHORIZED,
      message: 'Invalid or expired authentication token.',
      error,
    });
  }
};
