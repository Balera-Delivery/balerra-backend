import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { RoleType } from '../constants/roles';
import { sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';

export const authorizeRole = (allowedRoles: RoleType[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError({
        res,
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Authentication required.',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError({
        res,
        statusCode: HttpStatus.FORBIDDEN,
        message: `Forbidden: Access requires one of [${allowedRoles.join(', ')}] roles.`,
      });
      return;
    }

    next();
  };
};
