/**
 * Sandbox.co.in Penny-Less Bank Account Verification integration.
 *
 * Required env vars:
 *   SANDBOX_API_KEY
 *   SANDBOX_API_SECRET
 * Optional:
 *   SANDBOX_API_BASE_URL=https://test-api.sandbox.co.in
 *   SANDBOX_API_VERSION=1.0
 *
 * The access token is cached in-process for 23 hours (provider validity: 24h).
 */

import { logger } from "./logger.js";

export interface PennilessVerificationResult {
  verified: boolean;
  accountExists: boolean;
  nameAtBank: string | null;
  transactionId: string | null;
  provider: "SANDBOX_PENNILESS";
}

interface SandboxAuthResponse {
  code?: number;
  data?: { access_token?: string };
  access_token?: string;
  transaction_id?: string;
}

interface SandboxPennilessResponse {
  code?: number;
  transaction_id?: string;
  data?: {
    account_exists?: boolean;
    name_at_bank?: string;
    message?: string;
  };
  message?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function getConfig() {
  const apiKey = process.env.SANDBOX_API_KEY?.trim();
  const apiSecret = process.env.SANDBOX_API_SECRET?.trim();
  const baseUrl = (process.env.SANDBOX_API_BASE_URL || "https://test-api.sandbox.co.in").replace(/\/$/, "");
  const apiVersion = process.env.SANDBOX_API_VERSION || "1.0";

  if (!apiKey || !apiSecret) {
    throw new Error("Penniless verification is not configured. Set SANDBOX_API_KEY and SANDBOX_API_SECRET.");
  }
  return { apiKey, apiSecret, baseUrl, apiVersion };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const { apiKey, apiSecret, baseUrl, apiVersion } = getConfig();
  const resp = await fetch(`${baseUrl}/authenticate`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "x-api-secret": apiSecret,
      "x-api-version": apiVersion,
      "content-type": "application/json",
    },
  });

  let body: SandboxAuthResponse = {};
  try { body = await resp.json() as SandboxAuthResponse; } catch { /* handled below */ }

  const token = body.data?.access_token ?? body.access_token;
  if (!resp.ok || !token) {
    logger.error({ event: "sandbox_auth_failed", status: resp.status }, "Sandbox authentication failed");
    throw new Error("Bank verification provider authentication failed");
  }

  cachedToken = { value: token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return token;
}

export async function verifyBankAccountPenniless(
  accountNumber: string,
  ifsc: string,
): Promise<PennilessVerificationResult> {
  const cleanAccount = accountNumber.trim();
  const cleanIfsc = ifsc.trim().toUpperCase();
  if (!cleanAccount) throw new Error("Bank account number is required");
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) throw new Error("Invalid IFSC code");
  if (cleanAccount.length > 40) throw new Error("Bank account number is too long");

  const { apiKey, baseUrl, apiVersion } = getConfig();
  const token = await getAccessToken();
  const url = `${baseUrl}/bank/${encodeURIComponent(cleanIfsc)}/accounts/${encodeURIComponent(cleanAccount)}/penniless-verify`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      authorization: token, // Sandbox token is intentionally NOT prefixed with Bearer
      "x-api-key": apiKey,
      "x-api-version": apiVersion,
      "x-accept-cache": "false",
    },
  });

  let body: SandboxPennilessResponse = {};
  try { body = await resp.json() as SandboxPennilessResponse; } catch { /* handled below */ }

  if (!resp.ok) {
    logger.warn({ event: "penniless_verify_failed", status: resp.status, transactionId: body.transaction_id ?? null }, "Penniless bank verification failed");
    const providerMessage = body.data?.message ?? body.message;
    throw new Error(providerMessage || `Bank verification failed (${resp.status})`);
  }

  const accountExists = body.data?.account_exists === true;
  const nameAtBank = typeof body.data?.name_at_bank === "string" && body.data.name_at_bank.trim()
    ? body.data.name_at_bank.trim()
    : null;

  return {
    verified: accountExists,
    accountExists,
    nameAtBank,
    transactionId: body.transaction_id ?? null,
    provider: "SANDBOX_PENNILESS",
  };
}
