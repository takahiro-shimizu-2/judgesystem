import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../utils/logger";

export type Role = "admin" | "evaluator" | "orderer" | "auditor";

export interface AuthPayload {
  userId: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "";
const AUTH_ENABLED = (process.env.AUTH_ENABLED ?? "false").toLowerCase() === "true";
if (AUTH_ENABLED && !process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET environment variable is required when AUTH_ENABLED=true");
    process.exit(1);
}
if (!AUTH_ENABLED && process.env.NODE_ENV === "production") {
    console.warn("WARNING: Authentication is disabled in production. Set AUTH_ENABLED=true.");
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_ENABLED) {
    req.user = { userId: "dev-user", email: "dev@example.com", role: "admin" };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    logger.warn({ err }, "JWT verification failed");
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!AUTH_ENABLED) {
      next();
      return;
    }

    const userRole = req.user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
}
