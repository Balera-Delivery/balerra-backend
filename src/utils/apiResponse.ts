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

export const sendError = ({
  res,
  statusCode = HttpStatus.BAD_REQUEST,
  message,
  error = {},
}: ApiResponseOptions) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error,
  });
};
