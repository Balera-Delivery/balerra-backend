import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('[Error Middleware]', err);

  const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
  const message = err.message || 'Internal server error occurred.';

  sendError({
    res,
    statusCode,
    message,
    error: process.env.NODE_ENV === 'development' ? { stack: err.stack, details: err } : {},
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError({
    res,
    statusCode: HttpStatus.NOT_FOUND,
    message: `API Route not found: [${req.method}] ${req.originalUrl}`,
  });
};
