import { Response } from 'express';
import { HttpStatus } from '../constants/httpCodes';

export interface ApiResponseOptions<T = any> {
  res: Response;
  statusCode?: number;
  message: string;
  data?: T;
  error?: any;
}

export const sendSuccess = <T>({
  res,
  statusCode = HttpStatus.OK,
  message,
  data = {} as T,
}: ApiResponseOptions<T>) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

// Database / internal errors must never reach the apps as text (they show code details to users)
const isInternalError = (message: string, error: any) =>
  /prisma|Invalid `|Can't reach database|ECONNREFUSED|P1001|P2024|timed out fetching/i.test(message || '') ||
  (error && typeof error === 'object' && typeof error.clientVersion === 'string');

export const sendError = ({
  res,
  statusCode = HttpStatus.BAD_REQUEST,
  message,
  error = {},
}: ApiResponseOptions) => {
  if (isInternalError(message, error)) {
    console.error('[Internal error hidden from client]', message);
    return res.status(503).json({
      success: false,
      message: 'The server is busy right now. Please try again in a moment.',
      error: {},
    });
  }
  return res.status(statusCode).json({
    success: false,
    message,
    error,
  });
};
