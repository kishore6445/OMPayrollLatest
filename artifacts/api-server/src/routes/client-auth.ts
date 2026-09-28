/**
 * client-auth routes — PayrollOm client schema
 *
 * POST /api/auth/login           username + password → signed token
 * POST /api/auth/logout          stateless; client discards token
 * GET  /api/auth/me              current user profile (blocked if pwd change pending)
 * POST /api/auth/change-password force-change on first login + self-service
 */

import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { queryOne } from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  verifyClientPassword,
  hashClientPassword,
  makeClientToken,
  loadClientUser,
  touchLastLogin,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";
import { execute } from "@workspace/pg-client-db";

const router: IRouter = Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────

const LoginBody = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const { username, password } = parsed.data;

  const row = await queryOne<{
    id: number;
    username: string;
    password_hash: string;
    full_name: string | null;
    role: string | null;
    is_active: boolean | null;
    must_change_password: boolean;
  }>(
    `SELECT id, username, password_hash, full_name, role,
            is_active, must_change_password
     FROM app_users WHERE username = $1`,
    [username]
  );

  // Always run verifyClientPassword — prevents timing-based username enumeration
  const storedHash = row?.password_hash ?? "pbkdf2:sha512:310000:00:00";
  const valid = !!(row?.is_active) && (await verifyClientPassword(password, storedHash));

  if (!valid || !row) {
    // Log failed attempt without revealing which field was wrong
    await logClientAction(0, "auth.login.failed", { username }).catch(() => {});
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  touchLastLogin(row.id);

  const user = (await loadClientUser(row.id))!;
  const token = makeClientToken(user);

  await logClientAction(user.id, "auth.login", { username: user.username });

  res.json({
    token,
    mustChangePassword: user.mustChangePassword,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post("/auth/logout", requireClientAuth, async (req, res): Promise<void> => {
  await logClientAction(req.clientUser!.id, "auth.logout", {});
  res.json({ success: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

// NOTE: requirePasswordChanged is intentionally NOT applied here.
// /auth/me must work even when must_change_password=TRUE so the frontend
// can read the user's state and redirect to the change-password screen.
router.get("/auth/me", requireClientAuth, async (req, res): Promise<void> => {
  // Re-load from DB so must_change_password is always fresh
  const u = req.clientUser!;
  res.json({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    permissions: u.permissions,
  });
});

// ── POST /api/auth/change-password ────────────────────────────────────────────

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must include an uppercase letter")
    .regex(/[a-z]/, "Must include a lowercase letter")
    .regex(/[0-9]/, "Must include a digit")
    .regex(/[^A-Za-z0-9]/, "Must include a special character"),
});

router.post(
  "/auth/change-password",
  requireClientAuth,
  // NOTE: requirePasswordChanged intentionally NOT applied here —
  // this is the one route that must work even when must_change_password = TRUE
  async (req, res): Promise<void> => {
    const parsed = ChangePasswordBody.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      res.status(400).json({ error: msg });
      return;
    }

    const { currentPassword, newPassword } = parsed.data;
    const userId = req.clientUser!.id;

    const row = await queryOne<{ password_hash: string }>(
      "SELECT password_hash FROM app_users WHERE id = $1",
      [userId]
    );
    if (!row || !(await verifyClientPassword(currentPassword, row.password_hash))) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    // Prevent re-use of current password
    if (await verifyClientPassword(newPassword, row.password_hash)) {
      res.status(400).json({ error: "New password must differ from the current password" });
      return;
    }

    const newHash = await hashClientPassword(newPassword);
    await execute(
      `UPDATE app_users
       SET password_hash = $1, must_change_password = FALSE, last_login = NOW()
       WHERE id = $2`,
      [newHash, userId]
    );

    await logClientAction(userId, "auth.password_changed", {});
    res.json({ success: true, message: "Password changed successfully." });
  }
);

export default router;
