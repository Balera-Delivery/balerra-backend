import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { RoleType } from '../constants/roles';

export interface TokenPayload {
  userId: string;
  role: RoleType;
  email?: string | null;
  phoneNumber?: string | null;
}

export const signToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as any,
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
};
