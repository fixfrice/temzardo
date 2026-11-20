import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export const signToken = (userId: number) => jwt.sign({ sub: userId }, SECRET, { expiresIn: '30d' });

export function auth(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  try {
    req.userId = Number(jwt.verify(token ?? '', SECRET).sub);
    next();
  } catch {
    next(new HttpError(401, 'Unauthorized'));
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Validation failed', issues: err.issues });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
}

declare global {
  namespace Express {
    interface Request {
      userId: number;
    }
  }
}
