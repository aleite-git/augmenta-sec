import type {Request, Response, NextFunction} from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

/**
 * Auth middleware — verifies JWT from Authorization header.
 * Attaches decoded payload to req.user.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({error: 'Missing or invalid authorization header'});
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({error: 'Invalid or expired token'});
  }
}

/**
 * Role-based authorization guard.
 * Must be used after authMiddleware.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({error: 'Not authenticated'});
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({error: 'Insufficient permissions'});
      return;
    }
    next();
  };
}
