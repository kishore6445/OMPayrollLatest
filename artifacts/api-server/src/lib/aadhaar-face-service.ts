import { createHash, randomUUID } from "node:crypto";

export type AadhaarFaceStatus = "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";

export interface StartFaceAuthInput {
  aadhaarNumber: string;
  sessionId: string;
  callbackUrl: string;
  purpose: string;
}

export interface StartFaceAuthResult {
  providerSessionId: string;
  providerHandoffUrl?: string;
}

export interface SubmitFaceRdInput {
  providerSessionId: string;
  merchantSessionId: string;
  faceRdPayload: string;
}

export interface SubmitFaceRdResult {
  status: "PENDING" | "VERIFIED" | "FAILED";
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];
const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];

export function normalizeAadhaar(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isValidAadhaar(value: string): boolean {
  const digits = normalizeAadhaar(value);
  if (!/^\d{12}$/.test(digits)) return false;
  if (/^(\d)\1{11}$/.test(digits)) return false;
  let c = 0;
  const reversed = digits.split("").reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

export function aadhaarHash(aadhaarNumber: string): string {
  const pepper = process.env.AADHAAR_HASH_PEPPER || process.env.SESSION_SECRET || "";
  if (!pepper) throw new Error("AADHAAR_HASH_PEPPER or SESSION_SECRET must be configured");
  return createHash("sha256").update(`${pepper}:${normalizeAadhaar(aadhaarNumber)}`).digest("hex");
}

export function maskAadhaar(aadhaarNumber: string): string {
  const digits = normalizeAadhaar(aadhaarNumber);
  return digits.length >= 4 ? `XXXXXXXX${digits.slice(-4)}` : "XXXXXXXXXXXX";
}

export type AadhaarFaceMode = "mock" | "uidai_test" | "provider";

const UIDAI_PUBLIC_TEST_AADHAARS = new Set([
  "999941057058",
  "999971658847",
]);

export function aadhaarFaceMode(): AadhaarFaceMode {
  const mode = (process.env.AADHAAR_FACE_MODE || "mock").toLowerCase();
  if (mode === "provider") return "provider";
  if (mode === "uidai_test") return "uidai_test";
  return "mock";
}

export function isUidaiPublicTestAadhaar(value: string): boolean {
  return UIDAI_PUBLIC_TEST_AADHAARS.has(normalizeAadhaar(value));
}

export function uidaiPublicTestAadhaars(): string[] {
  return [...UIDAI_PUBLIC_TEST_AADHAARS];
}

/**
 * Provider-ready adapter. In provider mode, the configured AUA/Sub-AUA partner must expose
 * a session-start endpoint that returns a providerSessionId and Android handoff URL/deep link.
 * No raw face image is ever accepted by this API.
 */
export async function startFaceAuthentication(input: StartFaceAuthInput): Promise<StartFaceAuthResult> {
  const mode = aadhaarFaceMode();
  if (mode === "mock") {
    return { providerSessionId: `mock_${randomUUID()}` };
  }
  if (mode === "uidai_test") {
    const aadhaar = normalizeAadhaar(input.aadhaarNumber);
    const allowReal = (process.env.UIDAI_TEST_ALLOW_REAL_AADHAAR || "false").toLowerCase() === "true";
    if (!allowReal && !isUidaiPublicTestAadhaar(aadhaar)) {
      throw new Error("UIDAI test mode accepts only published UIDAI test Aadhaar numbers. Use provider mode for production Aadhaar authentication.");
    }
    return { providerSessionId: `uidai_test_${randomUUID()}` };
  }

  const baseUrl = process.env.AADHAAR_FACE_PROVIDER_BASE_URL;
  const apiKey = process.env.AADHAAR_FACE_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Aadhaar Face provider is not configured");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/face-auth/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      aadhaarNumber: normalizeAadhaar(input.aadhaarNumber),
      merchantSessionId: input.sessionId,
      callbackUrl: input.callbackUrl,
      purpose: input.purpose,
      captureMode: "AADHAAR_FACE_RD",
    }),
  });

  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(data.error ?? data.message ?? `Provider returned HTTP ${response.status}`));
  }

  const providerSessionId = String(data.providerSessionId ?? data.sessionId ?? "").trim();
  const handoffUrl = String(data.handoffUrl ?? data.deepLink ?? data.launchUrl ?? "").trim();
  if (!providerSessionId) {
    throw new Error("Provider response is missing providerSessionId");
  }

  return { providerSessionId, providerHandoffUrl: handoffUrl || undefined };
}


export async function getFaceRdCaptureRequest(providerSessionId: string): Promise<string> {
  const mode = aadhaarFaceMode();
  if (mode === "mock") {
    throw new Error("Live Face RD capture needs an AUA/Sub-AUA provider request; mock mode cannot create a UIDAI Face RD request");
  }
  if (mode === "uidai_test") {
    const configuredRequest = (process.env.UIDAI_TEST_FACE_RD_REQUEST || "").trim();
    if (configuredRequest) {
      if (configuredRequest.length > 500_000) throw new Error("UIDAI_TEST_FACE_RD_REQUEST is unexpectedly large");
      return configuredRequest;
    }
    throw new Error("UIDAI test mode is active, but no signed/valid Face RD test request is configured. UIDAI's public Auth test setup still requires the public-AUA signing keystore/certificate or an AUA sandbox. Configure UIDAI_TEST_FACE_RD_REQUEST only with a request generated from the official UIDAI/AUA test tooling.");
  }
  const baseUrl = process.env.AADHAAR_FACE_PROVIDER_BASE_URL;
  const apiKey = process.env.AADHAAR_FACE_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Aadhaar Face provider is not configured");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/face-auth/sessions/${encodeURIComponent(providerSessionId)}/rd-request`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error ?? data.message ?? `Provider returned HTTP ${response.status}`));
  const request = String(data.request ?? data.faceRdRequest ?? data.pidOptions ?? "").trim();
  if (!request) throw new Error("Provider response is missing the Face RD request payload");
  if (request.length > 500_000) throw new Error("Face RD request payload is unexpectedly large");
  return request;
}

/**
 * Forward the opaque encrypted Face RD response to the configured AUA/Sub-AUA provider.
 * The payload is never persisted or logged by OMpayroll.
 */
export async function submitFaceRdPayload(input: SubmitFaceRdInput): Promise<SubmitFaceRdResult> {
  const mode = aadhaarFaceMode();
  if (mode === "mock") {
    return { status: "VERIFIED", transactionId: `mock-android-${randomUUID()}` };
  }
  if (mode === "uidai_test") {
    const proxyUrl = (process.env.UIDAI_TEST_AUTH_PROXY_URL || "").trim();
    const simulate = (process.env.UIDAI_TEST_SIMULATE_RESULT || "false").toLowerCase() === "true";
    if (simulate) {
      return { status: "VERIFIED", transactionId: `uidai-test-simulated-${randomUUID()}` };
    }
    if (!proxyUrl) {
      throw new Error("UIDAI test Face RD result was captured, but no UIDAI/AUA test authentication proxy is configured. Set UIDAI_TEST_AUTH_PROXY_URL to your official test client/proxy, or use UIDAI_TEST_SIMULATE_RESULT=true only for non-production workflow testing.");
    }
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantSessionId: input.merchantSessionId,
        providerSessionId: input.providerSessionId,
        faceRdPayload: input.faceRdPayload,
        auaCode: process.env.UIDAI_TEST_AUA_CODE || "public",
        subAuaCode: process.env.UIDAI_TEST_SUB_AUA_CODE || "public",
        authUrl: process.env.UIDAI_TEST_AUTH_URL || "https://developer.uidai.gov.in/authserver/2.5",
      }),
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(data.error ?? data.message ?? `UIDAI test proxy returned HTTP ${response.status}`));
    const raw = String(data.status ?? data.ret ?? "PENDING").toUpperCase();
    return {
      status: ["VERIFIED", "SUCCESS", "Y", "YES", "TRUE"].includes(raw) ? "VERIFIED"
        : ["FAILED", "FAILURE", "N", "NO", "FALSE"].includes(raw) ? "FAILED" : "PENDING",
      transactionId: String(data.transactionId ?? data.txnId ?? data.txn ?? "") || undefined,
      errorCode: String(data.errorCode ?? data.err ?? "") || undefined,
      errorMessage: String(data.errorMessage ?? data.message ?? "") || undefined,
    };
  }

  const baseUrl = process.env.AADHAAR_FACE_PROVIDER_BASE_URL;
  const apiKey = process.env.AADHAAR_FACE_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Aadhaar Face provider is not configured");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/face-auth/sessions/${encodeURIComponent(input.providerSessionId)}/rd-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      merchantSessionId: input.merchantSessionId,
      faceRdPayload: input.faceRdPayload,
    }),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error ?? data.message ?? `Provider returned HTTP ${response.status}`));

  const raw = String(data.status ?? "PENDING").toUpperCase();
  const status = ["VERIFIED", "SUCCESS", "Y", "YES"].includes(raw) ? "VERIFIED"
    : ["FAILED", "FAILURE", "N", "NO"].includes(raw) ? "FAILED" : "PENDING";
  return {
    status,
    transactionId: String(data.transactionId ?? data.txnId ?? "") || undefined,
    errorCode: String(data.errorCode ?? "") || undefined,
    errorMessage: String(data.errorMessage ?? data.message ?? "") || undefined,
  };
}
