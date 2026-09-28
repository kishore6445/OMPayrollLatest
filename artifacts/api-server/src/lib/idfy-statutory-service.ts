import { randomUUID } from "node:crypto";

export type StatutoryKind = "uan" | "esic";
export type StatutoryStatus = "VERIFIED" | "MISMATCH" | "NOT_FOUND" | "FAILED";
export interface StatutoryResult {
  kind: StatutoryKind;
  status: StatutoryStatus;
  verified: boolean;
  provider: string;
  referenceId: string;
  message?: string;
  matchedName?: string | null;
}

const UAN_RE = /^\d{12}$/;
const ESIC_RE = /^\d{10}$/;

function mockResult(kind: StatutoryKind, value: string, employeeName: string): StatutoryResult {
  // Development-only deterministic sandbox. It validates the complete OMpayroll flow
  // without claiming a government verification. Real IDfy calls require the product-
  // specific endpoint/payload supplied with the customer's IDfy sandbox account.
  const valid = kind === "uan" ? UAN_RE.test(value) : ESIC_RE.test(value);
  return {
    kind,
    status: valid ? "VERIFIED" : "NOT_FOUND",
    verified: valid,
    provider: "idfy-mock-sandbox",
    referenceId: `mock-${randomUUID()}`,
    matchedName: valid ? employeeName : null,
    message: valid ? "Sandbox simulation only — not a live EPFO/ESIC lookup." : "Invalid number format.",
  };
}

export async function verifyStatutoryId(kind: StatutoryKind, value: string, employeeName: string): Promise<StatutoryResult> {
  const mode = (process.env.IDFY_STATUTORY_MODE ?? "mock").trim().toLowerCase();
  if (mode === "mock") return mockResult(kind, value, employeeName);

  if (mode !== "idfy") throw new Error(`Unsupported IDFY_STATUTORY_MODE: ${mode}`);
  const base = (process.env.IDFY_API_BASE_URL ?? "").replace(/\/$/, "");
  const path = kind === "uan" ? process.env.IDFY_UAN_ENDPOINT : process.env.IDFY_ESIC_ENDPOINT;
  const apiKey = process.env.IDFY_API_KEY ?? "";
  const accountId = process.env.IDFY_ACCOUNT_ID ?? "";
  if (!base || !path || !apiKey || !accountId) {
    throw new Error("IDfy sandbox is not configured. Set IDFY_API_BASE_URL, IDFY_API_KEY, IDFY_ACCOUNT_ID and the product endpoint supplied by IDfy.");
  }

  // IDfy product contracts can differ by account/product. Keep the adapter isolated.
  // The endpoint is intentionally configurable; confirm this payload against the
  // UAN/ESIC sandbox documentation issued for the OMpayroll IDfy account.
  const taskId = randomUUID();
  const body = { task_id: taskId, group_id: randomUUID(), data: kind === "uan" ? { uan: value } : { esic_number: value } };
  const resp = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": apiKey, "account-id": accountId },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const raw: any = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`IDfy ${kind.toUpperCase()} verification failed (${resp.status})`);

  // Normalize common IDfy-style result fields. Once account docs arrive, tighten this mapping.
  const source = raw?.result?.source_output ?? raw?.result ?? raw;
  const statusText = String(source?.status ?? source?.verification_status ?? raw?.status ?? "").toLowerCase();
  const verified = source?.verified === true || ["verified","success","valid","found"].includes(statusText);
  const notFound = ["not_found","not found","invalid","no_record"].includes(statusText);
  const matchedName = source?.name ?? source?.employee_name ?? source?.member_name ?? null;
  return {
    kind,
    status: verified ? "VERIFIED" : notFound ? "NOT_FOUND" : "MISMATCH",
    verified,
    provider: "idfy",
    referenceId: String(raw?.request_id ?? raw?.task_id ?? taskId),
    matchedName: matchedName ? String(matchedName) : null,
    message: verified ? "Verified by provider." : "Provider did not confirm this number.",
  };
}
