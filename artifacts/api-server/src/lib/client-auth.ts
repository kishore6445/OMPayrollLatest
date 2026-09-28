/**
 * client-auth.ts
 *
 * Authentication helpers for the PayrollOm client-schema database.
 * Tables: app_users, app_roles, app_permissions (in payrollom_client).
 *
 * Token: signed HMAC-SHA256 base64url envelope (no external JWT lib needed).
 * Password: PBKDF2-SHA512, 310 000 iterations — matches seed-client-admin.mjs.
 */

import { pbkdf2, timingSafeEqual, createHmac, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { type Request, type Response, type NextFunction } from "express";
import { queryOne, queryRows, execute } from "@workspace/pg-client-db";
import { logger } from "./logger.js";

const pbkdf2Async = promisify(pbkdf2);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientAuthUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword: boolean;
  permissions: string[]; // "module:action"
}

interface TokenPayload {
  userId: number;
  username: string;
  role: string;
  mustChangePassword: boolean;
  exp: number;
}

// Extend Express Request so both old and new auth coexist during transition
declare global {
  namespace Express {
    interface Request {
      clientUser?: ClientAuthUser;
    }
  }
}

// ── Env checks ───────────────────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) throw new Error("SESSION_SECRET env var is not set");

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// ── Token sign / verify ───────────────────────────────────────────────────────

function signBody(body: string): string {
  return createHmac("sha256", SESSION_SECRET!).update(body).digest("base64url");
}

export function makeClientToken(user: ClientAuthUser): string {
  const payload: TokenPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signBody(body);
  return `${body}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = signBody(body);
  try {
    const expectedBuf = Buffer.from(expected, "base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    if (expectedBuf.length !== sigBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, sigBuf)) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
}

// ── Password helpers ──────────────────────────────────────────────────────────

/**
 * Hash a plain-text password using PBKDF2-SHA512.
 * Returns a self-contained string: pbkdf2:sha512:310000:<hex-salt>:<hex-key>
 */
export async function hashClientPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await pbkdf2Async(plain, salt, 310_000, 64, "sha512");
  return `pbkdf2:sha512:310000:${salt}:${key.toString("hex")}`;
}

/**
 * Verify a plain-text password against a stored PBKDF2 hash.
 * Constant-time comparison guards against timing attacks.
 */
export async function verifyClientPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(":");
    if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
    const [, algo, iters, salt, keyHex] = parts;
    const iterations = parseInt(iters, 10);
    if (!iterations || iterations < 1) return false;
    const storedKey = Buffer.from(keyHex, "hex");
    const derived = await pbkdf2Async(plain, salt, iterations, storedKey.length, algo);
    return timingSafeEqual(derived, storedKey);
  } catch {
    return false;
  }
}

// ── User + permissions loader ─────────────────────────────────────────────────

export async function loadClientUser(userId: number): Promise<ClientAuthUser | null> {
  const row = await queryOne<{
    id: number;
    username: string;
    full_name: string | null;
    role: string | null;
    is_active: boolean | null;
    must_change_password: boolean;
  }>(
    `SELECT id, username, full_name, role, is_active, must_change_password
     FROM app_users WHERE id = $1`,
    [userId]
  );
  if (!row || !row.is_active) return null;

  const perms = await queryRows<{ module: string; action: string }>(
    `SELECT module, action FROM app_permissions
     WHERE role_name = $1 AND allowed = TRUE`,
    [row.role ?? ""]
  );

  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name ?? "",
    role: row.role ?? "",
    mustChangePassword: row.must_change_password,
    permissions: perms.map((p) => `${p.module}:${p.action}`),
  };
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * requireClientAuth — validates token, attaches req.clientUser.
 * Also back-fills req.user (old interface) so existing route permission
 * checks keep working during the gradual route migration.
 */
export async function requireClientAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyToken(header.slice(7));
  if (!payload || payload.exp < Date.now()) {
    res.status(401).json({ error: "Token expired or invalid" });
    return;
  }

  const user = await loadClientUser(payload.userId).catch((err) => {
    logger.error({ err }, "loadClientUser failed");
    return null;
  });
  if (!user) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  req.clientUser = user;

  // Back-fill req.user for old route compatibility during gradual migration
  (req as Request & { user: unknown }).user = {
    id: String(user.id),
    email: user.username,
    name: user.fullName,
    roleId: user.role,
    roleName: user.role,
    permissions: user.permissions,
  };

  next();
}

/**
 * requirePasswordChanged — blocks all routes when must_change_password is TRUE.
 * Returns a distinct error code so the frontend can redirect to /change-password.
 * Must be placed AFTER requireClientAuth.
 * Do NOT apply to the change-password route itself.
 */
export function requirePasswordChanged(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.clientUser?.mustChangePassword) {
    res.status(403).json({
      error: "PASSWORD_CHANGE_REQUIRED",
      message: "You must set a new password before continuing.",
    });
    return;
  }
  next();
}

/**
 * requireClientPermission(module, action)
 * Must come after requireClientAuth + requirePasswordChanged.
 * Admin role bypasses the check.
 */
export function requireClientPermission(module: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const u = req.clientUser;
    if (!u) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (
      u.role === "Admin" ||
      u.permissions.includes(`${module}:${action}`) ||
      u.permissions.includes(`${module}:all`)
    ) {
      next();
      return;
    }
    res.status(403).json({ error: `Forbidden: requires ${module}:${action}` });
  };
}

// ── Update last_login (fire-and-forget) ───────────────────────────────────────
export function touchLastLogin(userId: number): void {
  execute(`UPDATE app_users SET last_login = NOW() WHERE id = $1`, [userId]).catch(
    (err) => logger.error({ err, userId }, "touchLastLogin failed")
  );
}
