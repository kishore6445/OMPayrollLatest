import crypto from "node:crypto";

const BASE_URL = (process.env.MEON_DIGILOCKER_BASE_URL ?? "https://digilocker.meon.co.in").replace(/\/$/, "");
const DEFAULT_REDIRECT = "https://digilocker.meon.co.in/digilocker/thank-you-page";

type SessionKind = "aadhaar" | "uan";

type SessionPayload = {
  kind: SessionKind;
  clientToken: string;
  state: string;
  userId: number;
  uan?: string;
  exp: number;
};

function credentials() {
  const companyName = (process.env.MEON_COMPANY_NAME ?? "").trim();
  const secretToken = (process.env.MEON_SECRET_TOKEN ?? "").trim();
  if (!companyName || !secretToken) throw new Error("Meon DigiLocker credentials are not configured");
  return { companyName, secretToken };
}

function sessionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  return crypto.createHash("sha256").update(`ompayroll:meon-digilocker:${secret}`).digest();
}

function encryptSession(payload: SessionPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sessionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decryptSession(token: string, expectedKind: SessionKind, userId: number): SessionPayload {
  let raw: Buffer;
  try { raw = Buffer.from(token, "base64url"); } catch { throw new Error("Invalid DigiLocker session"); }
  if (raw.length < 29) throw new Error("Invalid DigiLocker session");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", sessionKey(), iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as SessionPayload;
    if (parsed.kind !== expectedKind || parsed.userId !== userId) throw new Error("DigiLocker session mismatch");
    if (!parsed.exp || Date.now() > parsed.exp) throw new Error("DigiLocker session expired. Start verification again.");
    return parsed;
  } catch (err) {
    if (err instanceof Error && /session|expired|mismatch/i.test(err.message)) throw err;
    throw new Error("Invalid DigiLocker session");
  }
}

function safeProviderError(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const r = raw as Record<string, unknown>;
  const direct = String(r.msg ?? r.message ?? r.error ?? r.detail ?? "").trim();
  if (direct) return direct.slice(0, 500);

  // For debugging only: include a compact, sanitized provider payload so the
  // actual Meon validation error is visible without leaking credentials/tokens.
  const sensitive = /(secret|token|password|authorization|aadhaar|aadhar|pan|uan)/i;
  const sanitize = (value: unknown, depth = 0): unknown => {
    if (depth > 3) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, 10).map(v => sanitize(v, depth + 1));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = sensitive.test(k) ? "[redacted]" : sanitize(v, depth + 1);
      }
      return out;
    }
    if (typeof value === "string") return value.slice(0, 500);
    return value;
  };

  try {
    return JSON.stringify(sanitize(raw)).slice(0, 1000);
  } catch {
    return "";
  }
}

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });

  const responseText = await resp.text();
  let raw: any = {};
  try { raw = responseText ? JSON.parse(responseText) : {}; } catch { raw = { message: responseText }; }

  if (!resp.ok) {
    const detail = safeProviderError(raw);
    throw new Error(`Meon DigiLocker request failed (${resp.status})${detail ? `: ${detail}` : ""}`);
  }

  const providerMessage = String(raw?.msg ?? raw?.message ?? "").trim();
  if (raw?.success === false || raw?.status === false || String(raw?.status ?? "").toLowerCase() === "failed") {
    throw new Error(providerMessage || safeProviderError(raw) || "Meon DigiLocker rejected the request");
  }
  return raw;
}

async function accessToken() {
  const { companyName, secretToken } = credentials();
  const raw = await post("/get_access_token", { company_name: companyName, secret_token: secretToken });
  const clientToken = String(raw?.client_token ?? "").trim();
  const state = String(raw?.state ?? "").trim();
  if (!clientToken || !state) throw new Error("Meon did not return client_token/state");
  return { clientToken, state, companyName };
}

function redirectUrl() {
  return (process.env.MEON_DIGILOCKER_REDIRECT_URL ?? DEFAULT_REDIRECT).trim();
}

export async function startAadhaarDigilocker(userId: number) {
  const { clientToken, state, companyName } = await accessToken();
  const raw = await post("/digi_url", {
    client_token: clientToken,
    redirect_url: redirectUrl(),
    company_name: companyName,
    documents: process.env.MEON_AADHAAR_DOCUMENTS ?? "aadhaar,pan",
  });
  const url = String(raw?.url ?? "").trim();
  if (!url) throw new Error("Meon did not return a DigiLocker authorization URL");
  return {
    url,
    sessionToken: encryptSession({ kind: "aadhaar", clientToken, state, userId, exp: Date.now() + 30 * 60_000 }),
  };
}

export type MeonAadhaarData = {
  aadhaarReference: string;
  name: string;
  dob: string;
  gender: string;
  fatherName: string;
  address: string;
  house: string;
  locality: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  photoUrl?: string;
  retrievedAt?: string;
};

export async function completeAadhaarDigilocker(sessionToken: string, userId: number): Promise<MeonAadhaarData> {
  const s = decryptSession(sessionToken, "aadhaar", userId);
  const raw = await post("/v2/send_entire_data", { client_token: s.clientToken, state: s.state, status: true });
  const d = raw?.data ?? {};
  const name = String(d?.name ?? "").trim();
  const aadhaarReference = String(d?.aadhar_no ?? "").trim();
  if (!name || !aadhaarReference) throw new Error("Meon response did not contain Aadhaar identity data");
  return {
    aadhaarReference,
    name,
    dob: String(d?.dob ?? "").trim(),
    gender: String(d?.gender ?? "").trim(),
    fatherName: String(d?.fathername ?? "").trim(),
    address: String(d?.aadhar_address ?? "").trim(),
    house: String(d?.house ?? "").trim(),
    locality: String(d?.locality ?? "").trim(),
    district: String(d?.dist ?? "").trim(),
    state: String(d?.state ?? "").trim(),
    pincode: String(d?.pincode ?? "").trim(),
    country: String(d?.country ?? "").trim(),
    photoUrl: d?.aadhar_img_filename ? String(d.aadhar_img_filename) : undefined,
    retrievedAt: d?.date_time ? String(d.date_time) : undefined,
  };
}

export async function startUanDigilocker(uan: string, userId: number) {
  if (!/^\d{12}$/.test(uan)) throw new Error("UAN must be exactly 12 digits");
  const { clientToken, state, companyName } = await accessToken();
  // Meon UAN Card Fetch uses the same DigiLocker link endpoint as Aadhaar.
  // The UAN Card itself is requested as an `other_documents` item.
  const raw = await post("/digi_url", {
    client_token: clientToken,
    redirect_url: redirectUrl(),
    company_name: companyName,
    documents: process.env.MEON_UAN_BASE_DOCUMENTS ?? "aadhaar,pan",
    other_documents: [{ doctype: "UNCRD", orgid: "002292", consent: "Y", UAN: uan }],
  });
  const url = String(raw?.url ?? raw?.digi_url ?? raw?.link ?? "").trim();
  if (!url) throw new Error("Meon did not return a UAN DigiLocker authorization URL");
  return {
    url,
    sessionToken: encryptSession({ kind: "uan", clientToken, state, userId, uan, exp: Date.now() + 30 * 60_000 }),
  };
}

export async function completeUanDigilocker(sessionToken: string, userId: number) {
  const s = decryptSession(sessionToken, "uan", userId);
  // Retrieve the completed DigiLocker response using Meon's documented v2 endpoint.
  // Keep the provider payload unmodified under `data` until a successful live UAN
  // response confirms the exact UAN Card schema we should map into PF fields.
  const raw = await post("/v2/send_entire_data", { client_token: s.clientToken, state: s.state, status: true });
  const data = raw?.data ?? null;
  return {
    success: raw?.success !== false && String(raw?.status ?? "success").toLowerCase() !== "failed",
    uan: s.uan,
    message: String(raw?.msg ?? raw?.message ?? "UAN Card data fetched from DigiLocker.").trim(),
    data,
  };
}
