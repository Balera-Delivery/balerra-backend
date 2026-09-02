import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';

export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        sendError({
          res,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: 'Validation failed.',
          error: formattedErrors,
        });
        return;
      }
      sendError({
        res,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid request payload.',
        error,
      });
    }
  };
};
