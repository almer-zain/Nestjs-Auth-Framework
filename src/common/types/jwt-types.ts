export interface JwtPayload {
  sub: number; // The user ID
  email: string;
  type: 'user' | 'admin';
  roles: string[];
  permissions: string[];
  iat?: number; // Issued at (auto-added by JWT)
  exp?: number; // Expires at (auto-added by JWT)
}

import { Request } from 'express';
export interface RequestWithUser extends Request {
  user: JwtPayload;
}
