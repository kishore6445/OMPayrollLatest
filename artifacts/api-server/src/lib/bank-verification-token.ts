/**
 * Short-lived signed proof that a bank account was verified before a new
 * employee record existed. This lets Add Employee verify bank details first
 * without making isAcctVarify / VerifiedBeneficiaryName client-writable.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

interface BankVerificationTokenPayload {
  v: 1;
  accountNumber: string;
  ifsc: string;
  beneficiaryName: string | null;
  provider: "SANDBOX_PENNILESS";
  transactionId: string | null;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.BANK_VERIFICATION_TOKEN_SECRET?.trim()
    || process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("Bank verification token secret is not configured");
  }
  return secret;
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getSecret()).update(encodedPayload).digest("base64url");
}

export function createBankVerificationToken(input: {
  accountNumber: string;
  ifsc: string;
  beneficiaryName: string | null;
  provider: "SANDBOX_PENNILESS";
  transactionId: string | null;
}): string {
  const payload: BankVerificationTokenPayload = {
    v: 1,
    accountNumber: input.accountNumber.trim(),
    ifsc: input.ifsc.trim().toUpperCase(),
    beneficiaryName: input.beneficiaryName,
    provider: input.provider,
    transactionId: input.transactionId,
    exp: Date.now() + 15 * 60 * 1000,
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyBankVerificationToken(token: string): BankVerificationTokenPayload {
  const parts = token.split(".");
  if (parts.length != 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid bank verification proof");
  }

  const expected = sign(parts[0]);
  const suppliedBuf = Buffer.from(parts[1]);
  const expectedBuf = Buffer.from(expected);
  if (suppliedBuf.length !== expectedBuf.length || !timingSafeEqual(suppliedBuf, expectedBuf)) {
    throw new Error("Invalid bank verification proof");
  }

  let payload: BankVerificationTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as BankVerificationTokenPayload;
  } catch {
    throw new Error("Invalid bank verification proof");
  }

  if (payload.v !== 1 || payload.exp < Date.now()) {
    throw new Error("Bank verification has expired. Verify the account again.");
  }
  if (!payload.accountNumber || !payload.ifsc) {
    throw new Error("Invalid bank verification proof");
  }
  return payload;
}
